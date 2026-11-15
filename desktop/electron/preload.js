// Ponte mínima entre o app instalado e a página do Vetra.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('vetraDesktop', {
  // PDFs abertos pelo "Abrir com", por duplo clique ou arrastados para o ícone
  onOpenFile: cb => ipcRenderer.on('open-file', (_e, f) => cb(f)),
  ready: () => ipcRenderer.send('renderer-ready'),
  openExternal: url => ipcRenderer.send('open-external', url),
  // converte um EPUB em PDF (devolve { ok, pdf, title } ou { ok:false, error })
  epubToPdf: bytes => ipcRenderer.invoke('epub-to-pdf', bytes),
  // atualizações (baixa a versão nova do site e reabre)
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  applyUpdate: () => ipcRenderer.invoke('update-apply'),
  shellVersion: () => process.versions && process.versions.electron,
});
