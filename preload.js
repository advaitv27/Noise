const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Desktop Window Controls
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => ipcRenderer.on('window-maximized-change', (event, isMaximized) => callback(isMaximized)),

  // Native Desktop Notifications
  showNotification: (options) => ipcRenderer.send('show-notification', options),

  // File Export
  exportFile: (options) => ipcRenderer.invoke('export-file', options),

  // Auto-Update
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),
  restartToUpdate: () => ipcRenderer.send('restart-to-update'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Platform Info
  platform: process.platform
});

