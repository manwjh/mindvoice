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
  setPortraitMode: () => ipcRenderer.invoke('window-set-portrait'),
  setLandscapeMode: () => ipcRenderer.invoke('window-set-landscape'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  quitApp: () => ipcRenderer.invoke('app-quit'),
  // IPC 消息监听（修复：避免监听器累积）
  onAsrMessage: (callback: (message: any) => void) => {
    // 先移除所有旧的监听器，避免累积
    ipcRenderer.removeAllListeners('asr-message');
    // 注册新的监听器
    ipcRenderer.on('asr-message', (_event, message) => callback(message));
  },
  removeAllAsrMessageListeners: () => {
    ipcRenderer.removeAllListeners('asr-message');
  },
  // 会员体系API
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
});

