/**
 * 统一的自动保存服务
 * 
 * 支持所有应用类型：voice-note, smart-chat, voice-zen
 * 提供统一的保存触发、临时数据管理、数据库交互
 */

export type AppType = 'voice-note' | 'smart-chat' | 'voice-zen';

export type SaveTrigger = 
  | 'block_confirmed'
  | 'edit_complete'
  | 'view_switch'
  | 'summary'
  | 'manual'
  | 'periodic';

export interface VolatileData {
  appType: AppType;
  sessionId: string;
  timestamp: number;
  data: any;  // app 特定的临时数据
}

export interface SaveData {
  text: string;
  app_type: AppType;
  metadata: Record<string, any>;
}

/**
 * App 特定适配器接口
 */
export interface AppAdapter {
  /**
   * 获取当前应用的所有数据
   */
  getAllData(): any;
  
  /**
   * 判断数据项是否处于临时状态
   */
  isVolatile(item: any): boolean;
  
  /**
   * 获取稳定的数据（排除临时状态）
   */
  getStableData(): any;
  
  /**
   * 将应用数据转换为保存格式
   */
  toSaveData(stableData: any): SaveData;
  
  /**
   * 检查是否有内容可保存
   */
  hasContent(data: any): boolean;
}

/**
 * 自动保存服务配置
 */
export interface AutoSaveConfig {
  // localStorage 保存间隔
  localStorageInterval: number;
  
  // 数据库保存防抖延迟
  dbSaveDebounce: number;
  
  // 兜底保存阈值
  longEditThreshold: number;
  
  // 定期保存间隔
  periodicSaveInterval: number;
  
  // 临时数据优先时限
  volatileDataPriority: number;
}

const DEFAULT_CONFIG: AutoSaveConfig = {
  localStorageInterval: 1000,        // 1秒
  dbSaveDebounce: 3000,              // 3秒
  longEditThreshold: 30000,          // 30秒
  periodicSaveInterval: 60000,       // 60秒
  volatileDataPriority: 300000,      // 5分钟
};

/**
 * 统一的自动保存服务类
 */
export class AutoSaveService {
  private appType: AppType;
  private adapter: AppAdapter;
  private config: AutoSaveConfig;
  
  private currentRecordId: string | null = null;
  private currentSessionId: string;
  
  private localStorageTimer: NodeJS.Timeout | null = null;
  private dbSaveTimer: NodeJS.Timeout | null = null;
  private periodicSaveTimer: NodeJS.Timeout | null = null;
  private longEditTimer: NodeJS.Timeout | null = null;
  
  private editingItemId: string | null = null;
  
  // 回调：当 recordId 首次创建时通知外部
  private onRecordIdCreated?: (recordId: string) => void;
  
  constructor(
    appType: AppType,
    adapter: AppAdapter,
    config?: Partial<AutoSaveConfig>,
    callbacks?: {
      onRecordIdCreated?: (recordId: string) => void;
    }
  ) {
    this.appType = appType;
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentSessionId = this.generateSessionId();
    this.onRecordIdCreated = callbacks?.onRecordIdCreated;
  }
  
  /**
   * 通知外部 recordId 已创建
   */
  private notifyRecordIdCreated(recordId: string) {
    if (this.onRecordIdCreated) {
      this.onRecordIdCreated(recordId);
    }
  }
  
  /**
   * 设置 recordId（用于从外部恢复）
   */
  setCurrentRecordId(recordId: string | null) {
    console.log(`[AutoSave-${this.appType}] 设置 recordId:`, recordId);
    this.currentRecordId = recordId;
  }
  
  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `${this.appType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  /**
   * 获取 localStorage 键名
   */
  private getLocalStorageKey(): string {
    return `volatile_${this.appType}`;
  }
  
  /**
   * 启动自动保存
   * @param autoRecover 是否自动恢复（默认false，由外部控制恢复时机）
   */
  start(autoRecover: boolean = false) {
    console.log(`[AutoSave-${this.appType}] 启动自动保存服务`);
    
    // 启动 localStorage 临时保存
    this.startLocalStorageSave();
    
    // 启动定期保存
    this.startPeriodicSave();
    
    // 可选：自动恢复（通常由外部控制）
    if (autoRecover) {
      this.recover();
    }
  }
  
  /**
   * 停止自动保存
   */
  stop() {
    console.log(`[AutoSave-${this.appType}] 停止自动保存服务`);
    
    if (this.localStorageTimer) {
      clearInterval(this.localStorageTimer);
      this.localStorageTimer = null;
    }
    
    if (this.dbSaveTimer) {
      clearTimeout(this.dbSaveTimer);
      this.dbSaveTimer = null;
    }
    
    if (this.periodicSaveTimer) {
      clearInterval(this.periodicSaveTimer);
      this.periodicSaveTimer = null;
    }
    
    if (this.longEditTimer) {
      clearTimeout(this.longEditTimer);
      this.longEditTimer = null;
    }
  }
  
  /**
   * 启动 localStorage 临时保存（每1秒）
   */
  private startLocalStorageSave() {
    this.localStorageTimer = setInterval(() => {
      this.saveVolatileToLocalStorage();
    }, this.config.localStorageInterval);
  }
  
  /**
   * 保存临时数据到 localStorage
   */
  private saveVolatileToLocalStorage() {
    try {
      const allData = this.adapter.getAllData();
      
      // 找出临时状态的数据项
      const volatileItems = Array.isArray(allData)
        ? allData.filter(item => this.adapter.isVolatile(item))
        : (this.adapter.isVolatile(allData) ? [allData] : []);
      
      // 如果没有临时数据，清除 localStorage
      if (volatileItems.length === 0) {
        localStorage.removeItem(this.getLocalStorageKey());
        return;
      }
      
      const volatileData: VolatileData = {
        appType: this.appType,
        sessionId: this.currentSessionId,
        timestamp: Date.now(),
        data: volatileItems,
      };
      
      localStorage.setItem(
        this.getLocalStorageKey(),
        JSON.stringify(volatileData)
      );
      
      console.log(`[AutoSave-${this.appType}] 临时保存:`, {
        itemCount: volatileItems.length,
      });
      
    } catch (e) {
      console.error(`[AutoSave-${this.appType}] 临时保存失败:`, e);
    }
  }
  
  /**
   * 保存到数据库
   */
  async saveToDatabase(
    trigger: SaveTrigger,
    immediate: boolean = false
  ): Promise<void> {
    console.log(`[AutoSave-${this.appType}] 💾 saveToDatabase 调用`, {
      trigger,
      immediate,
      currentRecordId: this.currentRecordId,
      hasPendingTimer: !!this.dbSaveTimer,
      timestamp: new Date().toLocaleTimeString(),
    });

    const performSave = async () => {
      const saveStartTime = Date.now();
      console.log(`[AutoSave-${this.appType}] 🚀 开始执行保存`, {
        trigger,
        timestamp: new Date().toLocaleTimeString(),
      });

      try {
        // 获取稳定数据
        const stableData = this.adapter.getStableData();
        
        // 检查是否有内容
        if (!this.adapter.hasContent(stableData)) {
          console.log(`[AutoSave-${this.appType}] ⚠️  没有内容可保存`);
          return;
        }
        
        // 转换为保存格式
        const saveData = this.adapter.toSaveData(stableData);
        
        // 添加触发信息
        saveData.metadata = {
          ...saveData.metadata,
          trigger,
          timestamp: Date.now(),
          sessionId: this.currentSessionId,
        };
        
        console.log(`[AutoSave-${this.appType}] 📝 准备保存:`, {
          trigger,
          textLength: saveData.text.length,
          hasMetadata: !!saveData.metadata,
          isUpdate: !!this.currentRecordId,
          metadataKeys: Object.keys(saveData.metadata || {}),
        });
        
        console.log(`[AutoSave-${this.appType}] 🔍 stableData 检查:`, {
          stableDataType: typeof stableData,
          stableDataKeys: Object.keys(stableData || {}),
          hasBlocks: !!(stableData as any)?.blocks,
          blocksLength: (stableData as any)?.blocks?.length,
          hasNoteInfo: !!(stableData as any)?.noteInfo,
        });
        
        console.log(`[AutoSave-${this.appType}] 💾 saveData.metadata:`, JSON.stringify(saveData.metadata, null, 2));
        
        // 更新或创建记录
        if (this.currentRecordId) {
          // 更新现有记录
          const response = await fetch(
            `http://127.0.0.1:8765/api/records/${this.currentRecordId}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(saveData),
            }
          );
          
          const saveEndTime = Date.now();
          const duration = saveEndTime - saveStartTime;

          if (response.ok) {
            console.log(`[AutoSave-${this.appType}] ✅ 更新记录成功`, {
              recordId: this.currentRecordId,
              duration: `${duration}ms`,
              trigger,
            });
            this.resetPeriodicTimer();
          } else {
            const errorResult = await response.json().catch(() => ({}));
            console.error(`[AutoSave-${this.appType}] ❌ 更新记录失败`, {
              status: response.status,
              message: errorResult.message,
              error: errorResult.error,
              duration: `${duration}ms`,
            });
          }
        } else {
          // 创建新记录
          const response = await fetch('http://127.0.0.1:8765/api/text/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(saveData),
          });
          
          const saveEndTime = Date.now();
          const duration = saveEndTime - saveStartTime;
          const result = await response.json();

          if (result.success) {
            console.log(`[AutoSave-${this.appType}] ✅ 创建记录成功`, {
              recordId: result.record_id,
              duration: `${duration}ms`,
              trigger,
            });
            this.currentRecordId = result.record_id;
            this.resetPeriodicTimer();
            
            // 通知外部：记录ID已生成
            this.notifyRecordIdCreated(result.record_id);
          } else {
            console.error(`[AutoSave-${this.appType}] ❌ 创建记录失败`, {
              message: result.message,
              error: result.error,
              duration: `${duration}ms`,
              saveData: {
                textLength: saveData.text.length,
                app_type: saveData.app_type,
              },
            });
          }
        }
        
      } catch (error) {
        const saveEndTime = Date.now();
        const duration = saveEndTime - saveStartTime;
        console.error(`[AutoSave-${this.appType}] ❌ 数据库保存异常`, {
          error,
          duration: `${duration}ms`,
          trigger,
        });
      }
    };
    
    // 立即保存或防抖保存
    if (immediate) {
      console.log(`[AutoSave-${this.appType}] ⚡ 立即保存 (immediate=true)`);
      await performSave();
    } else {
      if (this.dbSaveTimer) {
        console.log(`[AutoSave-${this.appType}] ⏱️  防抖：清除旧定时器，重新计时 ${this.config.dbSaveDebounce}ms`);
        clearTimeout(this.dbSaveTimer);
      } else {
        console.log(`[AutoSave-${this.appType}] ⏱️  防抖：启动定时器 ${this.config.dbSaveDebounce}ms`);
      }
      this.dbSaveTimer = setTimeout(() => {
        console.log(`[AutoSave-${this.appType}] ⏰ 防抖时间到，执行保存`);
        performSave();
      }, this.config.dbSaveDebounce);
    }
  }
  
  /**
   * 启动定期保存（每60秒）
   */
  private startPeriodicSave() {
    this.periodicSaveTimer = setInterval(() => {
      const stableData = this.adapter.getStableData();
      if (this.adapter.hasContent(stableData)) {
        console.log(`[AutoSave-${this.appType}] 定期保存触发（60秒）`);
        this.saveToDatabase('periodic', false);
      }
    }, this.config.periodicSaveInterval);
  }
  
  /**
   * 重置定期保存计时器
   * 在任何保存成功后调用，确保定期保存从上次保存点开始倒计时
   */
  private resetPeriodicTimer() {
    if (this.periodicSaveTimer) {
      clearInterval(this.periodicSaveTimer);
    }
    
    this.periodicSaveTimer = setInterval(() => {
      const stableData = this.adapter.getStableData();
      if (this.adapter.hasContent(stableData)) {
        console.log(`[AutoSave-${this.appType}] 定期保存触发（60秒，从上次保存重置）`);
        this.saveToDatabase('periodic', false);
      }
    }, this.config.periodicSaveInterval);
    
    console.log(`[AutoSave-${this.appType}] ⏲️  定期保存计时器已重置（60秒）`);
  }
  
  /**
   * 设置正在编辑的项目ID（用于长时间编辑兜底保存）
   */
  setEditingItemId(itemId: string | null) {
    this.editingItemId = itemId;
    
    // 清除旧的定时器
    if (this.longEditTimer) {
      clearTimeout(this.longEditTimer);
      this.longEditTimer = null;
    }
    
    // 如果有新的编辑项，启动兜底定时器
    if (itemId) {
      this.longEditTimer = setTimeout(() => {
        console.log(`[AutoSave-${this.appType}] 长时间编辑兜底保存`);
        this.saveToDatabase('periodic', false);
      }, this.config.longEditThreshold);
    }
  }
  
  /**
   * 从数据库恢复指定记录
   * @param recordId 要恢复的记录ID（必需参数）
   */
  async recover(recordId: string): Promise<any | null> {
    try {
      console.log(`[AutoSave-${this.appType}] 恢复指定记录:`, recordId);
      
      // 直接获取指定记录（不限时间）
      const response = await fetch(`http://127.0.0.1:8765/api/records/${recordId}`);
      
      if (!response.ok) {
        console.warn(`[AutoSave-${this.appType}] 记录不存在:`, recordId);
        return null;
      }
      
      const record = await response.json();
      
      // 检查 localStorage 临时数据（可能有未保存的编辑）
      const volatileDataStr = localStorage.getItem(this.getLocalStorageKey());
      if (volatileDataStr) {
        const volatileData: VolatileData = JSON.parse(volatileDataStr);
        const volatileAge = Date.now() - volatileData.timestamp;
        const recordTime = new Date(record.created_at).getTime();
        
        // 如果临时数据更新且在5分钟内，优先使用临时数据
        if (
          volatileAge < this.config.volatileDataPriority &&
          volatileData.timestamp > recordTime
        ) {
          console.log(`[AutoSave-${this.appType}] 使用更新的临时数据`);
          this.currentRecordId = recordId;
          return volatileData.data;
        }
      }
      
      // 恢复数据库记录
      console.log(`[AutoSave-${this.appType}] 从数据库恢复:`, record.id);
      this.currentRecordId = record.id;
      
      return record.metadata;
      
    } catch (e) {
      console.error(`[AutoSave-${this.appType}] 恢复失败:`, e);
      return null;
    }
  }
  
  /**
   * 重置（创建新笔记/对话时）
   */
  reset() {
    console.log(`[AutoSave-${this.appType}] 重置会话`);
    this.currentRecordId = null;
    this.currentSessionId = this.generateSessionId();
    localStorage.removeItem(this.getLocalStorageKey());
  }
  
  /**
   * 获取当前记录ID
   */
  getCurrentRecordId(): string | null {
    return this.currentRecordId;
  }
}

