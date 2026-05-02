'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const downloader = require('./downloader');
const config = require('./config');
const logger = require('./logger');

const SAVE_DEBOUNCE_MS = 500;

class QueueManager extends EventEmitter {
  constructor(appRoot) {
    super();
    this.appRoot = appRoot;
    this.jobs = [];
    this._saveTimer = null;
    this._activeJobId = null;
    this.load();
    // Reset any in-progress jobs from a previous session
    for (const job of this.jobs) {
      if (job.status === 'downloading') {
        job.status = 'failed';
        job.error = 'Interrupted by restart';
        job.updatedAt = new Date().toISOString();
      }
    }
    this._persistNow();
  }

  getQueuePath() {
    return path.join(this.appRoot, 'portable', 'queue.json');
  }

  load() {
    try {
      const queuePath = this.getQueuePath();
      if (fs.existsSync(queuePath)) {
        const raw = fs.readFileSync(queuePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.jobs = Array.isArray(parsed) ? parsed : [];
      }
    } catch (_) {
      this.jobs = [];
    }
  }

  _persistNow() {
    try {
      const queuePath = this.getQueuePath();
      const dir = path.dirname(queuePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(queuePath, JSON.stringify(this.jobs, null, 2), 'utf8');
    } catch (err) {
      logger.appLog('warn', 'Failed to persist queue', { error: err.message });
    }
  }

  save() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._persistNow(), SAVE_DEBOUNCE_MS);
  }

  add(job) {
    this.jobs.push(job);
    this.save();
    this.emit('progress', job);
  }

  remove(id) {
    this.jobs = this.jobs.filter(j => j.id !== id);
    this.save();
  }

  cancel(id) {
    const job = this.getById(id);
    if (!job) return;
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return;
    job.status = 'cancelled';
    job.updatedAt = new Date().toISOString();
    this.save();
    this.emit('progress', job);
  }

  getAll() {
    return this.jobs.slice();
  }

  getById(id) {
    return this.jobs.find(j => j.id === id) || null;
  }

  updateProgress(id, progressData) {
    const job = this.getById(id);
    if (!job) return;
    Object.assign(job, progressData, { updatedAt: new Date().toISOString() });
    this.emit('progress', job);
    this.save();
  }

  updateStatus(id, status, error = null) {
    const job = this.getById(id);
    if (!job) return;
    job.status = status;
    job.updatedAt = new Date().toISOString();
    if (error !== null) job.error = error;
    if (status === 'completed') job.progress = 100;
    this.emit('progress', job);
    this.save();
  }

  clearCompleted() {
    this.jobs = this.jobs.filter(j => !['completed', 'cancelled', 'failed'].includes(j.status));
    this.save();
  }

  processQueue() {
    if (this._activeJobId) return;
    const next = this.jobs.find(j => j.status === 'queued');
    if (!next) return;

    this._activeJobId = next.id;
    this.updateStatus(next.id, 'downloading');

    const cfg = config.load(this.appRoot);

    downloader.startDownload(
      next,
      cfg,
      this.appRoot,
      (progressData) => {
        this.updateProgress(next.id, progressData);
      },
      (outputFile) => {
        this.updateProgress(next.id, {
          status: 'completed',
          progress: 100,
          outputFile: outputFile || null,
          speed: null,
          eta: null
        });
        logger.appLog('info', 'Download completed', { jobId: next.id });
        this._activeJobId = null;
        this.processQueue();
      },
      (err) => {
        const errMsg = err && err.message ? err.message : String(err);
        this.updateProgress(next.id, {
          status: 'failed',
          error: errMsg,
          speed: null,
          eta: null
        });
        logger.appLog('error', 'Download failed', { jobId: next.id, error: errMsg });
        this._activeJobId = null;
        this.processQueue();
      }
    );
  }
}

module.exports = QueueManager;
