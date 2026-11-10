// preload: renderer 격리 유지, 필요시 안전한 API만 노출 (sandbox 환경 호환을 위해 외부 파일 require 금지)
const { contextBridge, ipcRenderer } = require('electron');

const argVersion = (process.argv || [])
  .find((arg) => typeof arg === 'string' && arg.startsWith('--app-version='))
  ?.split('=')[1];

let resolvedVersion = argVersion || '';
if (!resolvedVersion) {
  try {
    resolvedVersion = require('../package.json').version || '';
  } catch {
    resolvedVersion = '';
  }
}

contextBridge.exposeInMainWorld('bullsNote', {
  platform: process.platform,
  version: resolvedVersion,
  setTitleBarTheme: (isDark) => ipcRenderer.invoke('window:setTitleBarTheme', Boolean(isDark)),
  notification: {
    show: (data) => ipcRenderer.invoke('notification:show', data),
    onOpenNote: (callback) => {
      const handler = (_event, noteId) => callback(noteId);
      ipcRenderer.on('alarm:openNote', handler);
      return () => ipcRenderer.removeListener('alarm:openNote', handler);
    },
  },
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
  print: {
    exportPdf: (title) => ipcRenderer.invoke('print:exportPdf', { title }),
  },
  mcp: {
    status: () => ipcRenderer.invoke('mcp:status'),
    connect: (id) => ipcRenderer.invoke('mcp:connect', id),
    disconnect: (id) => ipcRenderer.invoke('mcp:disconnect', id),
  },
  googleAuth: {
    startLogin: (opts) => ipcRenderer.invoke('googleAuth:startLogin', opts),
    refreshToken: (opts) => ipcRenderer.invoke('googleAuth:refreshToken', opts),
  },
});
