'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: (folderPath) => ipcRenderer.invoke('openFolder', folderPath),
  getAppRoot: () => ipcRenderer.invoke('getAppRoot')
});
