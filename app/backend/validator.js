'use strict';

const ALLOWED_YOUTUBE_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'music.youtube.com'
];

const DANGEROUS_PATTERNS = [
  /file:\/\//i,
  /javascript:/i,
  /powershell/i,
  /cmd\.exe/i,
  /\/\.\.\/|\\\.\.\\|\.\.\//,
  /<script/i,
  /data:/i,
  /vbscript:/i
];

function hasPathSegment(pathname, prefix, minValueLength = 1) {
  if (!pathname.startsWith(prefix)) return false;
  const remainder = pathname.slice(prefix.length).split('/')[0];
  return remainder.length >= minValueLength;
}

function isChannelPath(pathname) {
  return (
    hasPathSegment(pathname, '/@', 1) ||
    hasPathSegment(pathname, '/channel/', 5) ||
    hasPathSegment(pathname, '/c/', 1) ||
    hasPathSegment(pathname, '/user/', 1)
  );
}

/**
 * Validate that a URL is a supported YouTube URL.
 * Returns {valid, type, error}
 */
function validateYouTubeUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, type: null, error: 'No URL provided' };
  }

  const trimmed = url.trim();

  if (trimmed.length > 2048) {
    return { valid: false, type: null, error: 'URL too long' };
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, type: null, error: 'Invalid URL: contains disallowed content' };
    }
  }

  let parsed;
  try {
    // Handle youtu.be shortlinks which must have protocol
    const withProtocol = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    parsed = new URL(withProtocol);
  } catch (_) {
    return { valid: false, type: null, error: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, type: null, error: 'Only HTTP/HTTPS URLs are allowed' };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.includes(host)) {
    return { valid: false, type: null, error: 'Only YouTube URLs are supported' };
  }

  const pathname = parsed.pathname.toLowerCase();

  // Playlist
  if (parsed.searchParams.has('list') && !parsed.searchParams.has('v')) {
    return { valid: true, type: 'playlist', error: null };
  }

  // Shorts
  if (pathname.startsWith('/shorts/')) {
    const shortId = pathname.split('/')[2];
    if (!shortId || shortId.length < 5) {
      return { valid: false, type: null, error: 'Invalid Shorts URL' };
    }
    return { valid: true, type: 'shorts', error: null };
  }

  // youtu.be shortlink
  if (host === 'youtu.be') {
    const videoId = pathname.slice(1);
    if (!videoId || videoId.length < 5) {
      return { valid: false, type: null, error: 'Invalid youtu.be URL' };
    }
    return { valid: true, type: 'video', error: null };
  }

  // Standard watch URL
  if (pathname === '/watch' || pathname.startsWith('/watch')) {
    const v = parsed.searchParams.get('v');
    if (!v || v.length < 5) {
      return { valid: false, type: null, error: 'Missing video ID in URL' };
    }
    // If also has list param, it's a playlist with a starting video
    if (parsed.searchParams.has('list')) {
      return { valid: true, type: 'playlist', error: null };
    }
    return { valid: true, type: 'video', error: null };
  }

  if (isChannelPath(pathname)) {
    return { valid: true, type: 'channel', error: null };
  }

  return { valid: false, type: null, error: 'URL must point to a video, shorts, playlist, or channel' };
}

function normalizeYouTubeUrl(url, type = null) {
  const inferred = type || validateYouTubeUrl(url).type;
  const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);

  if (inferred !== 'channel') {
    return parsed.toString();
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  const hasVideosTab = /\/videos$/i.test(pathname);
  const hasSpecificTab = /\/(videos|streams|shorts|playlists|featured)$/i.test(pathname);

  if (!hasVideosTab && !hasSpecificTab && isChannelPath(pathname.toLowerCase())) {
    parsed.pathname = `${pathname}/videos`;
  }

  return parsed.toString();
}

/**
 * Sanitize a filename by replacing invalid characters.
 */
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') return 'download';
  let safe = filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '_')
    .trim()
    .replace(/^\.+/, '_')
    .replace(/\s+/g, ' ');
  if (safe.length > 200) {
    safe = safe.substring(0, 200);
  }
  return safe || 'download';
}

/**
 * Ensure an output path stays strictly within the downloadRoot (no traversal).
 * The path must be a subdirectory of downloadRoot, not downloadRoot itself.
 * Returns the resolved path if safe, null if unsafe.
 */
function sanitizeOutputPath(outputPath, downloadRoot) {
  if (!outputPath || !downloadRoot) return null;
  const path = require('path');
  const resolvedRoot = path.resolve(downloadRoot);
  const resolvedOutput = path.resolve(outputPath);
  // Use path.relative() to detect traversal reliably across platforms.
  // rel === '' means outputPath exactly equals resolvedRoot (not a subdirectory).
  // rel starting with '..' means traversal above root.
  // path.isAbsolute(rel) catches cross-drive paths on Windows.
  const rel = path.relative(resolvedRoot, resolvedOutput);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return resolvedOutput;
}

module.exports = { validateYouTubeUrl, normalizeYouTubeUrl, sanitizeFilename, sanitizeOutputPath };
