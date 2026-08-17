const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseIssuer', {
  status: () => ipcRenderer.invoke('license:status'),
  issue: (machineId) => ipcRenderer.invoke('license:issue', machineId),
  copy: (text) => ipcRenderer.invoke('license:copy', text),
});
