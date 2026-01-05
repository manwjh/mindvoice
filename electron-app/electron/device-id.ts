/**
 * 设备ID生成模块
 * 
 * 功能：
 * - 基于硬件信息生成稳定的设备ID
 * - 支持跨平台（macOS、Windows、Linux）
 * - 使用SHA-256哈希保证唯一性和安全性
 * - 持久化存储到用户数据目录
 */

import { createHash } from 'crypto';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

/**
 * 设备信息接口
 */
export interface DeviceInfo {
  deviceId: string;
  machineId: string;
  platform: string;
  firstInstallTime: string;
  lastActiveTime: string;
  installCount: number;
}

/**
 * 设备ID管理器
 */
export class DeviceIdManager {
  private static instance: DeviceIdManager;
  private deviceInfoPath: string;
  private deviceInfo: DeviceInfo | null = null;

  private constructor() {
    // 设备信息存储路径（用户数据目录，重装不删除）
    const userDataPath = app.getPath('userData');
    this.deviceInfoPath = path.join(userDataPath, 'device.json');
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): DeviceIdManager {
    if (!DeviceIdManager.instance) {
      DeviceIdManager.instance = new DeviceIdManager();
    }
    return DeviceIdManager.instance;
  }

  /**
   * 获取机器唯一标识（基于硬件）
   */
  private getMachineId(): string {
    const platform = process.platform;

    try {
      if (platform === 'darwin') {
        // macOS: 使用硬件UUID
        try {
          const uuid = execSync(
            "ioreg -rd1 -c IOPlatformExpertDevice | grep -E 'IOPlatformUUID' | awk '{print $3}' | tr -d '\"'",
            { encoding: 'utf-8' }
          ).trim();
          if (uuid && uuid.length > 0) {
            return uuid;
          }
        } catch (e) {
          // 降级：尝试系统序列号
          try {
            const serial = execSync(
              "ioreg -l | grep IOPlatformSerialNumber | awk '{print $4}' | tr -d '\"'",
              { encoding: 'utf-8' }
            ).trim();
            if (serial && serial.length > 0) {
              return serial;
            }
          } catch (e2) {
            // 忽略
          }
        }
      } else if (platform === 'win32') {
        // Windows: 使用机器GUID
        try {
          const guid = execSync(
            'wmic csproduct get uuid',
            { encoding: 'utf-8' }
          ).split('\n')[1].trim();
          if (guid && guid.length > 0) {
            return guid;
          }
        } catch (e) {
          // 忽略
        }
      } else if (platform === 'linux') {
        // Linux: 使用 /etc/machine-id
        try {
          const machineId = fs.readFileSync('/etc/machine-id', 'utf-8').trim();
          if (machineId && machineId.length > 0) {
            return machineId;
          }
        } catch (e) {
          // 降级：尝试 /var/lib/dbus/machine-id
          try {
            const dbusId = fs.readFileSync('/var/lib/dbus/machine-id', 'utf-8').trim();
            if (dbusId && dbusId.length > 0) {
              return dbusId;
            }
          } catch (e2) {
            // 忽略
          }
        }
      }
    } catch (error) {
      console.error('[设备ID] 获取硬件信息失败:', error);
    }

    // 降级方案：生成并持久化随机ID
    return this.generateFallbackId();
  }

  /**
   * 生成降级ID（随机UUID + 时间戳）
   */
  private generateFallbackId(): string {
    const randomBytes = createHash('sha256')
      .update(Date.now().toString() + Math.random().toString())
      .digest('hex');
    return `fallback-${randomBytes.substring(0, 32)}`;
  }

  /**
   * 生成设备ID（从机器ID派生）
   */
  private generateDeviceId(machineId: string): string {
    // SHA-256哈希 + 盐值
    const salt = 'MindVoice-Device-Salt-2026';
    const hash = createHash('sha256')
      .update(machineId + salt)
      .digest('hex');

    // 格式化为UUID样式 (8-4-4-4-12)
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      hash.substring(12, 16),
      hash.substring(16, 20),
      hash.substring(20, 32)
    ].join('-');
  }

  /**
   * 加载或创建设备信息
   */
  public async initialize(): Promise<DeviceInfo> {
    console.log('[设备ID] 正在初始化设备ID管理器...');

    // 检查是否已有设备信息
    if (fs.existsSync(this.deviceInfoPath)) {
      try {
        const data = fs.readFileSync(this.deviceInfoPath, 'utf-8');
        const info = JSON.parse(data) as DeviceInfo;

        // 验证设备ID是否与当前机器匹配
        const currentMachineId = this.getMachineId();
        if (info.machineId === currentMachineId) {
          // 同一机器，恢复设备信息
          info.lastActiveTime = new Date().toISOString();
          info.platform = process.platform;
          this.deviceInfo = info;
          this.saveDeviceInfo();

          console.log('[设备ID] 欢迎回来！设备信息已恢复');
          console.log('[设备ID] 设备ID:', info.deviceId);
          console.log('[设备ID] 首次安装:', info.firstInstallTime);
          console.log('[设备ID] 安装次数:', info.installCount);

          return info;
        } else {
          // 不同机器，可能是迁移或硬件更换
          console.log('[设备ID] 检测到硬件变化，将创建新的设备ID');
          // 注意：会员信息需要重新激活（通过后端验证）
        }
      } catch (error) {
        console.error('[设备ID] 读取设备信息失败:', error);
      }
    }

    // 创建新设备信息
    return this.createNewDevice();
  }

  /**
   * 创建新设备信息
   */
  private createNewDevice(): DeviceInfo {
    console.log('[设备ID] 创建新设备...');

    const machineId = this.getMachineId();
    const deviceId = this.generateDeviceId(machineId);
    const now = new Date().toISOString();

    const info: DeviceInfo = {
      deviceId,
      machineId,
      platform: process.platform,
      firstInstallTime: now,
      lastActiveTime: now,
      installCount: 1
    };

    this.deviceInfo = info;
    this.saveDeviceInfo();

    console.log('[设备ID] 新设备已创建');
    console.log('[设备ID] 设备ID:', deviceId);
    console.log('[设备ID] 平台:', process.platform);

    return info;
  }

  /**
   * 保存设备信息到磁盘
   */
  private saveDeviceInfo(): void {
    if (!this.deviceInfo) {
      return;
    }

    try {
      // 确保目录存在
      const dir = path.dirname(this.deviceInfoPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(
        this.deviceInfoPath,
        JSON.stringify(this.deviceInfo, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[设备ID] 保存设备信息失败:', error);
    }
  }

  /**
   * 获取当前设备信息
   */
  public getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo;
  }

  /**
   * 获取设备ID
   */
  public getDeviceId(): string | null {
    return this.deviceInfo?.deviceId || null;
  }

  /**
   * 更新最后活跃时间
   */
  public updateLastActiveTime(): void {
    if (this.deviceInfo) {
      this.deviceInfo.lastActiveTime = new Date().toISOString();
      this.saveDeviceInfo();
    }
  }

  /**
   * 检测是否为重装
   */
  public isReinstall(): boolean {
    return this.deviceInfo !== null && this.deviceInfo.installCount > 1;
  }
}

/**
 * 导出便捷函数
 */
export async function initializeDeviceId(): Promise<DeviceInfo> {
  const manager = DeviceIdManager.getInstance();
  return await manager.initialize();
}

export function getDeviceId(): string | null {
  const manager = DeviceIdManager.getInstance();
  return manager.getDeviceId();
}

export function getDeviceInfo(): DeviceInfo | null {
  const manager = DeviceIdManager.getInstance();
  return manager.getDeviceInfo();
}

