'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isPacked = app.isPackaged;
const APP_ROOT = isPacked
  ? path.dirname(process.execPath)
  : app.getAppPath();

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
  } catch (_) { /* icon is optional */ }

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
      sandbox: false,
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
    const resolved = path.resolve(folderPath);
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
    await shell.openExternal(String(targetUrl || ''));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: return the app root path
ipcMain.handle('getAppRoot', async () => {
  return APP_ROOT;
});
