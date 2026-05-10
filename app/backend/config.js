'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  downloadRoot: './downloads',
  videoFolder: './downloads/video',
  audioFolder: './downloads/audio',
  shortsFolder: './downloads/shorts',
  tempFolder: './downloads/temp',
  theme: 'abyss',
  defaultFormat: 'mp4',
  defaultQuality: 'best',
  clipboardWatcher: false,
  saveThumbnail: false,
  saveInfoJson: false,
  saveSubtitles: false,
  playlistLimit: 10,
  advancedMode: false
};

function getDefaults() {
  return Object.assign({}, DEFAULTS);
}

function getConfigPath(appRoot) {
  return path.join(appRoot, 'portable', 'config.json');
}

function load(appRoot) {
  const configPath = getConfigPath(appRoot);
  let fileConfig = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      fileConfig = JSON.parse(raw);
    }
  } catch (err) {
    // Corrupt config - fall back to defaults
    fileConfig = {};
  }
  return Object.assign({}, DEFAULTS, fileConfig);
}

function save(appRoot, cfg) {
  const configPath = getConfigPath(appRoot);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const safe = Object.assign({}, DEFAULTS, cfg);
  fs.writeFileSync(configPath, JSON.stringify(safe, null, 2), 'utf8');
}

/**
 * Resolve a potentially-relative folder path against appRoot.
 */
function resolveFolder(appRoot, relPath) {
  if (!relPath) return path.join(appRoot, 'downloads');
  if (path.isAbsolute(relPath)) return relPath;
  return path.resolve(appRoot, relPath);
}

/**
 * Ensure all required download folders exist.
 */
function ensureFolders(appRoot) {
  const cfg = load(appRoot);
  const folders = [
    cfg.downloadRoot,
    cfg.videoFolder,
    cfg.audioFolder,
    cfg.shortsFolder,
    cfg.tempFolder
  ];
  for (const folder of folders) {
    const resolved = resolveFolder(appRoot, folder);
    try {
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }
    } catch (_) {
      /* non-fatal */
    }
  }
  // Also ensure portable/logs and portable/cache
  for (const subdir of ['portable/logs', 'portable/cache']) {
    const resolved = path.join(appRoot, subdir);
    try {
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }
    } catch (_) {
      /* non-fatal */
    }
  }
}

module.exports = { load, save, getDefaults, resolveFolder, ensureFolders };
