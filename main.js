'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isPacked = app.isPackaged;
const APP_ROOT = isPacked ? path.dirname(process.execPath) : app.getAppPath();

global.APP_ROOT = APP_ROOT;

// Add bin directory to PATH in packaged mode so yt-dlp/ffmpeg are found
if (isPacked) {
  const binDir = path.join(APP_ROOT, 'bin');
  process.env.PATH = binDir + path.delimiter + (process.env.PATH || '');
}

let mainWindow = null;
let serverStarted = false;

function createWindow() {
  let windowIcon;
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.ico');
    if (fs.existsSync(iconPath)) {
      windowIcon = iconPath;
    } else if (!isPacked) {
      console.log('[AbyssFetch] Icon not found at assets/icon.ico (optional)');
    }
  } catch (_) {
    /* icon is optional */
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0e1a',
    frame: true,
    show: false,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !isPacked
    },
    titleBarStyle: 'default',
    title: 'AbyssFetch'
  });

  mainWindow.loadFile(path.join(__dirname, 'app', 'frontend', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (!isPacked) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

async function startBackend() {
  if (serverStarted) return;
  try {
    const { start } = require('./app/backend/server');
    await start(APP_ROOT, 57315);
    serverStarted = true;
  } catch (err) {
    console.error('Failed to start backend server:', err);
  }
}

app.whenReady().then(async () => {
  await startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC: open a folder in the OS file explorer
ipcMain.handle('openFolder', async (_event, folderPath) => {
  try {
    // Security: Only allow opening folders within APP_ROOT to prevent arbitrary path access
    if (!folderPath || typeof folderPath !== 'string') {
      return { success: false, error: 'Invalid folder path' };
    }

    const resolved = path.resolve(folderPath);
    const appRootResolved = path.resolve(APP_ROOT);

    // Check if the resolved path is within APP_ROOT
    const relative = path.relative(appRootResolved, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return { success: false, error: 'Folder path must be within application directory' };
    }

    // Create folder if it doesn't exist
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }

    await shell.openPath(resolved);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: open an external URL in the OS browser
ipcMain.handle('openExternal', async (_event, targetUrl) => {
  try {
    // Security: Only allow https: URLs from expected domains
    if (!targetUrl || typeof targetUrl !== 'string') {
      return { success: false, error: 'Invalid URL' };
    }

    const trimmed = targetUrl.trim();

    // Parse and validate URL
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch (_) {
      return { success: false, error: 'Invalid URL format' };
    }

    // Only allow https: protocol
    if (parsed.protocol !== 'https:') {
      return { success: false, error: 'Only HTTPS URLs are allowed' };
    }

    // Whitelist of allowed domains for external links
    const ALLOWED_DOMAINS = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtu.be',
      'music.youtube.com',
      'github.com',
      'www.github.com'
    ];

    const hostname = parsed.hostname.toLowerCase();
    const isAllowed = ALLOWED_DOMAINS.includes(hostname);

    if (!isAllowed) {
      return { success: false, error: 'Domain not in whitelist' };
    }

    await shell.openExternal(parsed.toString());
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: return the app root path
ipcMain.handle('getAppRoot', async () => {
  return APP_ROOT;
});

// IPC: return the platform
ipcMain.handle('getPlatform', async () => {
  return process.platform;
});
