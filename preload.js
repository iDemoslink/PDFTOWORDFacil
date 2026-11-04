const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  info: () => ipcRenderer.invoke('info'),
  wordToPdf: (name, data, engine) => ipcRenderer.invoke('word-to-pdf', { name, data, engine }),
  save: (defaultName, data, ext) => ipcRenderer.invoke('save', { defaultName, data, ext }),
  show: (p) => ipcRenderer.invoke('show', p)
});
