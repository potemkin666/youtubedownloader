'use strict';

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const validator = require('./validator');
const config = require('./config');
const QueueManager = require('./queue');
const downloader = require('./downloader');
const diskcheck = require('./diskcheck');
const logger = require('./logger');

let appRoot = '';
let queue = null;

function start(root, port = 57315) {
  appRoot = root;
  logger.init(appRoot);
  config.ensureFolders(appRoot);
  queue = new QueueManager(appRoot);

  const app = express();

  // Restrict to localhost only
  app.use((req, res, next) => {
    // Server is bound to 127.0.0.1, but double-check connection origin
    const remoteAddr = req.socket.remoteAddress || '';
    const isLocalhost = 
      remoteAddr === '127.0.0.1' ||
      remoteAddr === '::1' ||
      remoteAddr === '::ffff:127.0.0.1';
    
    if (!isLocalhost) {
      logger.appLog('warn', 'Rejected non-localhost request', { remoteAddr });
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // GET /api/status
  app.get('/api/status', async (req, res) => {
    try {
      const cfg = config.load(appRoot);
      const binDir = path.join(appRoot, 'bin');
      const [ytdlp, ffmpeg, ffprobe] = await Promise.all([
        downloader.checkTool(binDir, 'yt-dlp'),
        downloader.checkTool(binDir, 'ffmpeg'),
        downloader.checkTool(binDir, 'ffprobe')
      ]);
      res.json({ ytdlp, ffmpeg, ffprobe, config: cfg });
    } catch (err) {
      logger.appLog('error', 'Status check failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/fetch
  app.post('/api/fetch', async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing URL' });
    }
    const validation = validator.validateYouTubeUrl(url.trim());
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    try {
      const binDir = path.join(appRoot, 'bin');
      const normalizedUrl = validator.normalizeYouTubeUrl(url.trim(), validation.type);
      const metadata = await downloader.fetchMetadata(normalizedUrl, binDir, { requestedType: validation.type });
      logger.appLog('info', 'Metadata fetched successfully');
      res.json(Object.assign({}, metadata, {
        requestedType: validation.type,
        normalizedUrl
      }));
    } catch (err) {
      logger.appLog('error', 'Fetch metadata failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/download
  app.post('/api/download', async (req, res) => {
    const { url, format, quality, saveThumbnail, saveInfoJson, saveSubtitles, outputFolder } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing URL' });
    }
    const validation = validator.validateYouTubeUrl(url.trim());
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const cfg = config.load(appRoot);
    const normalizedUrl = validator.normalizeYouTubeUrl(url.trim(), validation.type);
    const requestedPlaylistLimit = Number.parseInt(req.body && req.body.playlistLimit, 10);
    // Clamp playlist limit to 0-500 range
    const playlistLimit = Number.isInteger(requestedPlaylistLimit) && requestedPlaylistLimit >= 0
      ? Math.min(requestedPlaylistLimit, 500)
      : Math.min(cfg.playlistLimit, 500);
    let resolvedOutput = config.resolveFolder(appRoot, cfg.videoFolder);
    if (outputFolder && typeof outputFolder === 'string') {
      const sanitized = validator.sanitizeOutputPath(outputFolder, config.resolveFolder(appRoot, cfg.downloadRoot));
      if (sanitized) resolvedOutput = sanitized;
    }
    if (format === 'mp3' || format === 'm4a') {
      resolvedOutput = config.resolveFolder(appRoot, cfg.audioFolder);
    }
    if (validation.type === 'shorts') {
      resolvedOutput = config.resolveFolder(appRoot, cfg.shortsFolder);
    }

    const jobId = uuidv4();
    const job = {
      id: jobId,
      url: normalizedUrl,
      urlType: validation.type,
      title: req.body.title || 'Fetching...',
      status: 'queued',
      format: format || cfg.defaultFormat || 'mp4',
      quality: quality || cfg.defaultQuality || 'best',
      playlistLimit,
      outputPath: resolvedOutput,
      saveThumbnail: !!saveThumbnail,
      saveInfoJson: !!saveInfoJson,
      saveSubtitles: !!saveSubtitles,
      progress: 0,
      speed: null,
      eta: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    queue.add(job);
    queue.processQueue();
    logger.appLog('info', 'Download job queued', { jobId });
    res.json({ jobId, status: 'queued' });
  });

  // GET /api/queue
  app.get('/api/queue', (req, res) => {
    res.json(queue.getAll());
  });

  // DELETE /api/queue/:id
  app.delete('/api/queue/:id', (req, res) => {
    const { id } = req.params;
    const job = queue.getById(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status === 'downloading') {
      downloader.cancelDownload(id);
      queue.updateStatus(id, 'cancelled');
    } else {
      queue.cancel(id);
    }
    res.json({ success: true });
  });

  // POST /api/queue/clear-completed
  app.post('/api/queue/clear-completed', (req, res) => {
    try {
      queue.clearCompleted();
      res.json({ success: true });
    } catch (err) {
      logger.appLog('error', 'Failed to clear completed jobs', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/progress/:id - SSE
  app.get('/api/progress/:id', (req, res) => {
    const { id } = req.params;
    const job = queue.getById(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (data) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (_) { /* stream closed */ }
    };

    // Send current state immediately
    sendEvent(queue.getById(id));

    const onProgress = (updatedJob) => {
      if (updatedJob.id === id) {
        sendEvent(updatedJob);
        if (['completed', 'failed', 'cancelled'].includes(updatedJob.status)) {
          queue.removeListener('progress', onProgress);
          try { res.end(); } catch (_) { /* already closed */ }
        }
      }
    };

    queue.on('progress', onProgress);

    req.on('close', () => {
      queue.removeListener('progress', onProgress);
    });
  });

  // GET /api/config
  app.get('/api/config', (req, res) => {
    try {
      const cfg = config.load(appRoot);
      res.json(cfg);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/config
  app.post('/api/config', (req, res) => {
    try {
      const current = config.load(appRoot);
      const body = req.body || {};
      
      // Validate folder paths (must be strings, no dangerous patterns)
      const folderFields = ['downloadRoot', 'videoFolder', 'audioFolder', 'shortsFolder', 'tempFolder'];
      for (const field of folderFields) {
        if (body[field] !== undefined) {
          if (typeof body[field] !== 'string') {
            return res.status(400).json({ error: `${field} must be a string` });
          }
          // Check for path traversal attempts
          if (body[field].includes('..') || /[<>:"|?*\x00-\x1f]/g.test(body[field])) {
            return res.status(400).json({ error: `${field} contains invalid characters` });
          }
        }
      }
      
      // Validate format enum
      if (body.defaultFormat !== undefined) {
        const validFormats = ['mp4', 'webm', 'mp3', 'm4a'];
        if (!validFormats.includes(body.defaultFormat)) {
          return res.status(400).json({ error: 'defaultFormat must be one of: ' + validFormats.join(', ') });
        }
      }
      
      // Validate quality enum
      if (body.defaultQuality !== undefined) {
        const validQualities = ['best', '2160p', '4k', '1440p', '1080p', '720p', '480p', '360p', 'audio only'];
        if (!validQualities.includes(body.defaultQuality)) {
          return res.status(400).json({ error: 'defaultQuality must be one of: ' + validQualities.join(', ') });
        }
      }
      
      // Validate playlist limit (0-500)
      if (body.playlistLimit !== undefined) {
        const limit = Number(body.playlistLimit);
        if (!Number.isInteger(limit) || limit < 0 || limit > 500) {
          return res.status(400).json({ error: 'playlistLimit must be an integer between 0 and 500' });
        }
        body.playlistLimit = limit;
      }
      
      // Validate boolean toggles
      const boolFields = ['clipboardWatcher', 'saveThumbnail', 'saveInfoJson', 'saveSubtitles', 'advancedMode'];
      for (const field of boolFields) {
        if (body[field] !== undefined && typeof body[field] !== 'boolean') {
          return res.status(400).json({ error: `${field} must be a boolean` });
        }
      }
      
      const updated = Object.assign({}, current, body);
      config.save(appRoot, updated);
      config.ensureFolders(appRoot);
      res.json({ success: true, config: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/diskspace
  app.get('/api/diskspace', async (req, res) => {
    try {
      const cfg = config.load(appRoot);
      const folder = config.resolveFolder(appRoot, cfg.downloadRoot);
      const info = await diskcheck.checkSpace(folder);
      res.json(info);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/checkdrive - always uses config-sourced path, not user input
  app.post('/api/checkdrive', async (req, res) => {
    try {
      const cfg = config.load(appRoot);
      const target = config.resolveFolder(appRoot, cfg.downloadRoot);
      const result = await diskcheck.checkDrivePresent(target);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', (err) => {
      if (err) return reject(err);
      logger.appLog('info', `AbyssFetch backend listening on 127.0.0.1:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { start };
