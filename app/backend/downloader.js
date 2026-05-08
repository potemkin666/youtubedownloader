'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const validator = require('./validator');

// Map jobId -> spawned child process
const activeProcesses = new Map();

/**
 * Resolve yt-dlp or ffmpeg binary path.
 * Checks binDir first, then falls back to system PATH.
 */
function resolveBin(binDir, toolName) {
  const candidates = [
    path.join(binDir, toolName + (process.platform === 'win32' ? '.exe' : '')),
    path.join(binDir, toolName)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  // Fall back to PATH
  return process.platform === 'win32' ? toolName + '.exe' : toolName;
}

/**
 * Check if a tool is available and return its version.
 */
function checkTool(binDir, toolName) {
  return new Promise((resolve) => {
    const bin = resolveBin(binDir, toolName);
    const child = spawn(bin, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 8000
    });
    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });
    child.on('error', () => resolve({ available: false, version: null }));
    child.on('close', (code) => {
      if (code === 0 && output.trim()) {
        const version = output.trim().split('\n')[0].trim();
        resolve({ available: true, version });
      } else {
        resolve({ available: false, version: null });
      }
    });
  });
}

function isMissingBinaryError(err) {
  return !!(err && err.code === 'ENOENT');
}

function getMissingBinaryMessage(binDir, toolName) {
  const exeName = process.platform === 'win32' ? `${toolName}.exe` : toolName;
  return `${exeName} is missing. Add ${exeName} to ${binDir} and restart AbyssFetch.`;
}

/**
 * Fetch video metadata using yt-dlp --dump-json.
 */
function isCollectionType(type) {
  return type === 'playlist' || type === 'channel';
}

function fetchMetadata(url, binDir, options = {}) {
  return new Promise((resolve, reject) => {
    const requestedType = options.requestedType || validator.validateYouTubeUrl(url).type;
    const normalizedUrl = validator.normalizeYouTubeUrl(url, requestedType);
    const bin = resolveBin(binDir, 'yt-dlp');
    const args = isCollectionType(requestedType)
      ? [
          '--dump-single-json',
          '--flat-playlist',
          '--playlist-end',
          '1',
          '--no-warnings',
          '--skip-download',
          normalizedUrl
        ]
      : [
          '--dump-json',
          '--no-playlist',
          '--no-warnings',
          '--skip-download',
          normalizedUrl
        ];

    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 30000
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (isMissingBinaryError(err)) {
        return reject(new Error(getMissingBinaryMessage(binDir, 'yt-dlp')));
      }
      reject(new Error(`yt-dlp not found or failed to start: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const errText = stderr.trim() || `yt-dlp exited with code ${code}`;
        return reject(new Error(errText));
      }
      try {
        // yt-dlp may output multiple JSON lines for playlists; take first
        const firstLine = stdout.trim().split('\n')[0];
        const meta = JSON.parse(firstLine);
        const formatted = {
          id: meta.id,
          title: meta.title || 'Unknown Title',
          channel: meta.channel || meta.uploader || 'Unknown',
          duration: meta.duration || 0,
          durationString: meta.duration_string || formatDuration(meta.duration),
          thumbnail: meta.thumbnail || null,
          webpage_url: meta.webpage_url || normalizedUrl,
          is_live: !!meta.is_live,
          filesize_approx: meta.filesize_approx || null,
          view_count: meta.view_count || 0,
          upload_date: meta.upload_date || null,
          description: (meta.description || '').slice(0, 500),
          formats: summarizeFormats(meta.formats || []),
          playlist_count: meta.playlist_count || null,
          requestedType,
          entry_count: Array.isArray(meta.entries) ? meta.entries.length : null,
          _type: meta._type || requestedType || 'video'
        };
        if (!formatted.thumbnail && Array.isArray(meta.thumbnails) && meta.thumbnails.length > 0) {
          formatted.thumbnail = meta.thumbnails[meta.thumbnails.length - 1]?.url || null;
        }
        resolve(formatted);
      } catch (parseErr) {
        reject(new Error(`Failed to parse yt-dlp output: ${parseErr.message}`));
      }
    });
  });
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function summarizeFormats(formats) {
  const seen = new Set();
  const result = [];
  for (const f of formats) {
    const key = `${f.ext}-${f.height || 'audio'}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        format_id: f.format_id,
        ext: f.ext,
        height: f.height || null,
        fps: f.fps || null,
        vcodec: f.vcodec || null,
        acodec: f.acodec || null,
        filesize: f.filesize || f.filesize_approx || null
      });
    }
    if (result.length >= 20) break;
  }
  return result;
}

/**
 * Build yt-dlp argument array for a download job.
 */
function buildArgs(job, cfg, appRoot) {
  const args = [];
  const format = (job.format || 'mp4').toLowerCase();
  const quality = (job.quality || 'best').toLowerCase();

  // Format selection
  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else if (format === 'm4a') {
    args.push('-f', 'bestaudio[ext=m4a]/bestaudio', '--audio-quality', '0');
  } else if (format === 'webm') {
    if (quality === 'best' || quality === 'audio only') {
      args.push('-f', 'bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best', '--merge-output-format', 'webm');
    } else {
      const h = qualityToHeight(quality);
      args.push(
        '-f',
        `bestvideo[height<=${h}][ext=webm]+bestaudio[ext=webm]/best[height<=${h}][ext=webm]/best[height<=${h}]`,
        '--merge-output-format', 'webm'
      );
    }
  } else {
    // Default: mp4
    if (quality === 'best') {
      args.push(
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4'
      );
    } else if (quality === 'audio only') {
      args.push('-f', 'bestaudio[ext=m4a]/bestaudio', '--audio-quality', '0');
    } else {
      const h = qualityToHeight(quality);
      args.push(
        '-f',
        `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${h}][ext=mp4]/best[height<=${h}]`,
        '--merge-output-format', 'mp4'
      );
    }
  }

  // Optional extras
  if (job.saveThumbnail) args.push('--write-thumbnail');
  if (job.saveInfoJson) args.push('--write-info-json');
  if (job.saveSubtitles) {
    args.push('--write-subs', '--write-auto-subs', '--sub-langs', 'en.*');
  }

  const isCollection = isCollectionType(job.urlType);
  if (isCollection) {
    args.push('--yes-playlist');
    if (Number.isInteger(job.playlistLimit) && job.playlistLimit > 0) {
      args.push('--playlist-end', String(job.playlistLimit));
    }
  }

  // Output template
  const outputPath = job.outputPath || require('./config').resolveFolder(appRoot, cfg.videoFolder);
  const outputTemplate = path.join(outputPath, '%(title)s [%(id)s].%(ext)s');
  args.push('-o', outputTemplate);

  // Temp dir
  const tempDir = require('./config').resolveFolder(appRoot, cfg.tempFolder);
  args.push('--paths', `temp:${tempDir}`);

  // Progress output
  args.push('--newline', '--progress');

  if (!isCollection) {
    args.push('--no-playlist');
  }

  // FFmpeg location if available
  const { path: pathModule } = { path: require('path') };
  const binDir = pathModule.join(appRoot, 'bin');
  const ffmpegBin = resolveBin(binDir, 'ffmpeg');
  if (require('fs').existsSync(ffmpegBin)) {
    args.push('--ffmpeg-location', binDir);
  }

  return args;
}

function qualityToHeight(quality) {
  const map = {
    '2160p': 2160, '4k': 2160,
    '1440p': 1440, '1440': 1440,
    '1080p': 1080, '1080': 1080,
    '720p': 720, '720': 720,
    '480p': 480, '480': 480,
    '360p': 360, '360': 360
  };
  return map[quality] || 1080;
}

/**
 * Start a download job. Calls onProgress, onComplete, onError.
 */
function startDownload(job, cfg, appRoot, onProgress, onComplete, onError) {
  const binDir = path.join(appRoot, 'bin');
  const bin = resolveBin(binDir, 'yt-dlp');
  const args = buildArgs(job, cfg, appRoot);
  args.push(validator.normalizeYouTubeUrl(job.url, job.urlType));

  logger.appLog('info', 'Starting download', { jobId: job.id, format: job.format, quality: job.quality });

  let child;
  try {
    child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
  } catch (err) {
    if (isMissingBinaryError(err)) {
      onError(new Error(getMissingBinaryMessage(binDir, 'yt-dlp')));
      return;
    }
    onError(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    return;
  }

  activeProcesses.set(job.id, child);

  let stderr = '';
  let lastOutputFile = null;

  child.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const progress = parseProgress(trimmed);
      if (progress) {
        onProgress(progress);
      }

      // Detect output filename
      const destMatch = trimmed.match(/^\[download\] Destination: (.+)$/) ||
                        trimmed.match(/^\[Merger\] Merging formats into "(.+)"$/);
      if (destMatch) {
        lastOutputFile = destMatch[1];
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (err) => {
    activeProcesses.delete(job.id);
    if (isMissingBinaryError(err)) {
      onError(new Error(getMissingBinaryMessage(binDir, 'yt-dlp')));
      return;
    }
    onError(new Error(`yt-dlp process error: ${err.message}`));
  });

  child.on('close', (code, signal) => {
    activeProcesses.delete(job.id);
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      // Cancelled
      return;
    }
    if (code === 0) {
      onComplete(lastOutputFile);
    } else {
      const errText = stderr.trim() || `yt-dlp exited with code ${code}`;
      onError(new Error(errText.slice(0, 500)));
    }
  });
}

/**
 * Parse a yt-dlp progress line into a structured object.
 * yt-dlp progress line example:
 * [download]  45.6% of ~  12.34MiB at    1.23MiB/s ETA 00:05
 */
function parseProgress(line) {
  if (!line.includes('[download]')) return null;

  const percentMatch = line.match(/(\d+\.?\d*)%/);
  const speedMatch = line.match(/at\s+([\d.]+\s*\w+\/s)/);
  const etaMatch = line.match(/ETA\s+([\d:]+)/);
  const sizeMatch = line.match(/of\s+~?\s*([\d.]+\s*\w+iB)/);
  const downloadedMatch = line.match(/(\d+\.?\d*)\s*\w+iB\s+at/);

  if (!percentMatch) return null;

  const percent = parseFloat(percentMatch[1]);
  if (isNaN(percent)) return null;

  let phase = 'downloading';
  if (line.includes('has already been downloaded')) phase = 'cached';
  if (line.includes('Destination:')) phase = 'merging';

  return {
    status: 'downloading',
    progress: Math.min(100, Math.max(0, percent)),
    speed: speedMatch ? speedMatch[1].trim() : null,
    eta: etaMatch ? etaMatch[1].trim() : null,
    totalSize: sizeMatch ? sizeMatch[1].trim() : null,
    phase
  };
}

/**
 * Kill the download process for a given job ID.
 */
function cancelDownload(jobId) {
  const child = activeProcesses.get(jobId);
  if (child) {
    try {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (activeProcesses.has(jobId)) {
          try { child.kill('SIGKILL'); } catch (_) { /* already dead */ }
        }
      }, 3000);
    } catch (_) { /* already dead */ }
    activeProcesses.delete(jobId);
  }
}

module.exports = { checkTool, fetchMetadata, buildArgs, startDownload, parseProgress, cancelDownload };
