'use strict';

const path = require('path');
const fs = require('fs');

let winston = null;
let appLogger = null;
let downloadLogger = null;
let initialized = false;

// Lazy-load winston to avoid issues before npm install
function getWinston() {
  if (!winston) {
    try {
      winston = require('winston');
    } catch (_) {
      winston = null;
    }
  }
  return winston;
}

/**
 * Initialize file-based loggers.
 */
function init(appRoot) {
  const w = getWinston();
  if (!w) {
    initialized = false;
    return;
  }

  const logsDir = path.join(appRoot, 'portable', 'logs');
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  } catch (_) {
    /* non-fatal */
  }

  const logFormat = w.format.combine(
    w.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    w.format.errors({ stack: true }),
    w.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  );

  appLogger = w.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
      new w.transports.File({
        filename: path.join(logsDir, 'app.log'),
        maxsize: 5 * 1024 * 1024, // 5MB
        maxFiles: 3,
        tailable: true
      }),
      new w.transports.Console({
        format: w.format.combine(w.format.colorize(), logFormat),
        silent: process.env.NODE_ENV === 'production'
      })
    ]
  });

  downloadLogger = w.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
      new w.transports.File({
        filename: path.join(logsDir, 'downloads.log'),
        maxsize: 5 * 1024 * 1024,
        maxFiles: 5,
        tailable: true
      })
    ]
  });

  initialized = true;
}

/**
 * Log to app.log. Never log raw URLs or tokens.
 */
function appLog(level, message, meta = {}) {
  // Strip URLs from meta for safety
  const safeMeta = sanitizeMeta(meta);
  if (initialized && appLogger) {
    appLogger[level] ? appLogger[level](message, safeMeta) : appLogger.info(message, safeMeta);
  } else {
    const logFn = console[level] || console.log;
    logFn(`[AbyssFetch] ${level.toUpperCase()}: ${message}`, safeMeta);
  }
}

/**
 * Log to downloads.log.
 */
function downloadLog(level, message, meta = {}) {
  const safeMeta = sanitizeMeta(meta);
  if (initialized && downloadLogger) {
    downloadLogger[level]
      ? downloadLogger[level](message, safeMeta)
      : downloadLogger.info(message, safeMeta);
  } else {
    const logFn = console[level] || console.log;
    logFn(`[Downloads] ${level.toUpperCase()}: ${message}`, safeMeta);
  }
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const safe = {};
  for (const [key, value] of Object.entries(meta)) {
    // Never log URL values or sensitive credential fields
    const lk = key.toLowerCase();
    if (
      lk === 'url' ||
      lk.includes('cookie') ||
      lk.includes('token') ||
      lk.includes('password') ||
      lk.includes('auth') ||
      lk.includes('secret') ||
      lk.includes('apikey') ||
      lk.includes('header')
    ) {
      safe[key] = '[REDACTED]';
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

module.exports = { init, appLog, downloadLog };
