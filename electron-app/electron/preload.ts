/**
 * Preload脚本
 * 在渲染进程中运行，提供安全的API访问
 */
import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  getApiUrl: () => ipcRenderer.invoke('get-api-url'),
  checkApiServer: () => ipcRenderer.invoke('check-api-server'),
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  restoreDefaultSize: () => ipcRenderer.invoke('window-restore-default'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  quitApp: () => ipcRenderer.invoke('app-quit'),
});

