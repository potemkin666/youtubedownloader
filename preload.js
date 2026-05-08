'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: (folderPath) => ipcRenderer.invoke('openFolder', folderPath),
  openExternal: (targetUrl) => ipcRenderer.invoke('openExternal', targetUrl),
  getAppRoot: () => ipcRenderer.invoke('getAppRoot')
});
