// preload: renderer 격리 유지, 필요시 안전한 API만 노출
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bullsNote', {
  platform: process.platform,
  version: '0.1.0',
  vault: {
    getPath: () => ipcRenderer.invoke('vault:getPath'),
    setPath: (p) => ipcRenderer.invoke('vault:setPath', p),
    pickDir: () => ipcRenderer.invoke('vault:pickDir'),
    list: () => ipcRenderer.invoke('vault:list'),
    read: (id) => ipcRenderer.invoke('vault:read', id),
    write: (id, text) => ipcRenderer.invoke('vault:write', id, text),
    delete: (id) => ipcRenderer.invoke('vault:delete', id),
    writeAsset: (name, base64) => ipcRenderer.invoke('vault:writeAsset', name, base64),
    readAsset: (name) => ipcRenderer.invoke('vault:readAsset', name),
    readSidecar: () => ipcRenderer.invoke('vault:readSidecar'),
    writeSidecar: (data) => ipcRenderer.invoke('vault:writeSidecar', data),
  },
});
