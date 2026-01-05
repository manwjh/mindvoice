/**
 * Electron API 类型定义
 */

export interface ElectronAPI {
  // 现有API
  onAsrMessage: (callback: (data: any) => void) => void;
  getApiUrl: () => Promise<string>;
  windowClose: () => Promise<void>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowToggleOrientation: () => Promise<void>;
  
  // 会员体系API
  getDeviceId: () => Promise<string | null>;
  getDeviceInfo: () => Promise<DeviceInfo | null>;
}

export interface DeviceInfo {
  deviceId: string;
  machineId: string;
  platform: string;
  firstInstallTime: string;
  lastActiveTime: string;
  installCount: number;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};

