// 渲染进程与主进程的桥,只暴露桌宠需要的几个通道
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  onNotify: (cb) => ipcRenderer.on('pet-notify', (_e, payload) => cb(payload)),
  onAssets: (cb) => ipcRenderer.on('pet-assets', (_e, manifest) => cb(manifest)),
  onState: (cb) => ipcRenderer.on('pet-state', (_e, state) => cb(state)),
  onEffect: (cb) => ipcRenderer.on('pet-effect', (_e, effect) => cb(effect)),
  onDismiss: (cb) => ipcRenderer.on('pet-dismiss', () => cb()),
  openUrl: (u) => ipcRenderer.send('pet-open-url', u),
  drag: (dx, dy) => ipcRenderer.send('pet-drag', { dx, dy }),
  dragEnd: (vel) => ipcRenderer.send('pet-drag-end', vel),
  onMotion: (cb) => ipcRenderer.on('pet-motion', (_e, m) => cb(m)),
  busy: (busy, sleeping) => ipcRenderer.send('pet-busy', { busy, sleeping }),
  contextMenu: () => ipcRenderer.send('pet-context'),
  hover: (over) => ipcRenderer.send('pet-hover', over),
});
