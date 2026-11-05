const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  wordToPdf: (name, data) => ipcRenderer.invoke('word-to-pdf', { name, data }),
  pdfToDocx: (data) => ipcRenderer.invoke('pdf-to-docx', { data }),
  save: (defaultName, data, ext) => ipcRenderer.invoke('save', { defaultName, data, ext }),
  show: (p) => ipcRenderer.invoke('show', p)
});
