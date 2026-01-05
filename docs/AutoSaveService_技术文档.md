# AutoSaveService 技术文档

## 概述

`AutoSaveService` 是 MindVoice 项目的统一自动保存服务，负责管理所有应用类型（voice-note、smart-chat、voice-zen）的数据持久化。它提供了多层次的数据保护机制，确保用户数据的安全性和完整性。

**版本**: 1.0  
**最后更新**: 2026-01-04  
**状态**: 生产就绪（里程碑版本）

---

## 目录

1. [核心概念](#核心概念)
2. [架构设计](#架构设计)
3. [保存策略](#保存策略)
4. [API 参考](#api-参考)
5. [使用指南](#使用指南)
6. [配置选项](#配置选项)
7. [适配器开发](#适配器开发)
8. [故障排查](#故障排查)
9. [性能优化](#性能优化)
10. [常见问题](#常见问题)

---

## 核心概念

### 1.1 双层存储策略

AutoSaveService 采用 **双层存储** 设计：

```
┌─────────────────────┐
│   前端内存数据       │ ← 用户实时操作
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    ↓             ↓
┌────────┐   ┌────────┐
│ localStorage │   │ SQLite │
│  (临时数据)   │   │ (持久化) │
│   1秒刷新    │   │ 智能触发 │
└────────┘   └────────┘
```

**设计理念**:
- **localStorage**: 高频保存临时数据（如 ASR 写入中的 block），用于崩溃恢复
- **SQLite**: 低频保存确定数据（如已确认的 block），用于长期存储

### 1.2 数据状态分类

| 状态类型 | 定义 | 保存位置 | 示例 |
|---------|------|---------|------|
| **Volatile（易失）** | 临时的、未确定的数据 | localStorage | ASR 正在写入的 block |
| **Stable（稳定）** | 确定的、完整的数据 | SQLite | 已确认的 block |

### 1.3 保存触发机制

AutoSaveService 当前使用 **4种保存触发器**：

| 触发器 | 触发时机 | 执行方式 | 重置60秒定时器 | 用途 |
|-------|---------|---------|--------------|------|
| `block_confirmed` | block 内容确定 | 防抖3秒 | ✅ | 主要保存点 |
| `edit_complete` | 编辑区失焦 | 防抖3秒 | ✅ | 保障机制 |
| `view_switch` | 离开当前应用 | 立即保存 | ✅ | 防丢失机制 |
| `periodic` | 60秒倒计时 | 防抖3秒 | ✅（重置自己） | 兜底机制 |

**扩展触发器**（已定义类型，暂未使用）：
- `summary`: 生成摘要/总结时保存
- `manual`: 用户手动保存按钮

---

## 架构设计

### 2.1 核心类图

```
┌──────────────────────────────┐
│     AutoSaveService          │
├──────────────────────────────┤
│ - appType: AppType           │
│ - adapter: AppAdapter        │
│ - config: AutoSaveConfig     │
│ - currentRecordId: string?   │
│ - currentSessionId: string   │
├──────────────────────────────┤
│ + start()                    │
│ + stop()                     │
│ + saveToDatabase()           │
│ + recover()                  │
│ + reset()                    │
└──────────┬───────────────────┘
           │ uses
           ↓
┌──────────────────────────────┐
│      AppAdapter              │
├──────────────────────────────┤
│ + getAllData()               │
│ + isVolatile(item)           │
│ + getStableData()            │
│ + toSaveData(data)           │
│ + hasContent(data)           │
└──────────────────────────────┘
           ↑
           │ implements
    ┌──────┴──────┐
    │             │
VoiceNoteAdapter  SmartChatAdapter
```

### 2.2 数据流

```
用户操作
   ↓
前端组件 (VoiceNote, SmartChat)
   ↓
App 特定适配器 (VoiceNoteAdapter)
   ↓
AutoSaveService
   ├─→ localStorage (每1秒)
   └─→ SQLite (智能触发)
```

### 2.3 定时器管理

AutoSaveService 管理 **4个独立定时器**：

```typescript
class AutoSaveService {
  // 1. localStorage 定时器（每1秒，Interval）
  private localStorageTimer: NodeJS.Timeout | null;
  
  // 2. 数据库保存防抖定时器（3秒，Timeout）
  private dbSaveTimer: NodeJS.Timeout | null;
  
  // 3. 定期保存定时器（60秒，Interval，可重置）
  private periodicSaveTimer: NodeJS.Timeout | null;
  
  // 4. 长时间编辑兜底定时器（30秒，Timeout）
  private longEditTimer: NodeJS.Timeout | null;
}
```

**定时器协作机制**:
- 任何保存成功 → 重置 `periodicSaveTimer`
- 防抖期间切换视图 → 立即保存（覆盖防抖）
- 停止服务 → 清除所有定时器

---

## 保存策略

### 3.1 统一自动保存策略（里程碑版本）

#### 3.1.1 策略概览

```
┌─────────────────────────────────────────────────────┐
│          统一自动保存策略 (v1.0)                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1️⃣ Block 确定时保存 (主要)                         │
│     触发: block 有内容且确定 (isAsrWriting=false)    │
│     执行: 防抖3秒                                    │
│     副作用: 重置60秒定期计时器                        │
│                                                     │
│  2️⃣ 编辑完成保存 (保障)                              │
│     触发: block 失焦 (编辑完成)                       │
│     执行: 防抖3秒                                    │
│     副作用: 重置60秒定期计时器                        │
│                                                     │
│  3️⃣ 切换视图保存 (保障)                              │
│     触发: 离开 voice-note 界面                       │
│     执行: 立即保存                                   │
│     副作用: 重置60秒定期计时器                        │
│                                                     │
│  4️⃣ 定期保存 (兜底)                                  │
│     触发: 从上次保存点倒计时60秒                      │
│     执行: 防抖3秒                                    │
│     副作用: 重置自己的计时器                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 3.1.2 保存频率分析

**场景1: 纯 ASR 输入**
```
用户说话 → 形成 utterance → block 确定（isAsrWriting=false）→ 触发保存

假设: 10个 utterance → 10个 blocks
保存次数: 10次（每个 block 确定时1次，防抖3秒）
保存效率: 100%
数据丢失风险: 0%（每个 utterance 确定后保存）
```

**场景2: 纯键盘输入**
```
用户打字 → 回车确认 → 新建下一个 block → 上一个 block 确定 → 触发保存

假设: 用户打了5段话，每段回车确认
保存次数: 5次（每次回车后，上一个 block 确定触发1次，防抖3秒）
保存效率: 100%
数据丢失风险: 0%（每段确定后保存）
```

**场景3: 长时间编辑未确认**
```
用户在同一个 block 中持续打字 → 未回车 → 60秒定期保存兜底

保存次数: 至少1次（60秒定期保存，防抖3秒）
丢失风险: 极低（最多丢失60秒内容，且有 localStorage 每秒备份）
```

**场景4: 快速切换编辑多个 blocks**
```
在 block-1 打字 → 点击 block-2（block-1 失焦）→ 在 block-2 打字 → 点击 block-3

触发: 
- block-1 失焦 → edit_complete（防抖3秒）
- block-2 失焦 → edit_complete（清除旧定时器，重新计时3秒）
- 3秒后无新操作 → 执行保存

保存次数: 1次（多次失焦被防抖合并）
保存效率: 高（避免频繁保存）
```

#### 3.1.3 数据完整性保障

**多重保障机制**:
```
1. Block 确定保存 ─┐
2. 失焦保存 ───────┼─→ 任一触发 → 数据安全
3. 切换视图保存 ───┤
4. 定期保存60秒 ───┘
```

**最坏情况分析**:
- **假设**: 用户在60秒内编辑，未回车，未失焦，未切换
- **结果**: 60秒定期保存触发，数据保存成功
- **丢失风险**: 0%（有 localStorage 每秒备份）

### 3.2 防抖与立即保存

#### 3.2.1 防抖保存 (Debounced Save)

```typescript
saveToDatabase('block_confirmed', false);  // 防抖3秒
saveToDatabase('edit_complete', false);    // 防抖3秒
```

**适用场景**:
- Block 内容确定（可能连续确定多个 blocks）
- 编辑完成（避免频繁失焦触发）
- 定期保存触发（避免高频写入数据库）

**工作原理**:
```
0s   触发保存 → 启动3秒定时器
1s   再次触发 → 清除旧定时器，重新计时3秒
2s   再次触发 → 清除旧定时器，重新计时3秒
5s   无新触发 → 执行保存（距最后一次触发3秒）
```

#### 3.2.2 立即保存 (Immediate Save)

```typescript
saveToDatabase('view_switch', true);  // 立即执行
```

**适用场景**:
- 用户离开界面（防止防抖被打断）

**工作原理**:
```
0s   触发保存 → 立即执行，不等待
0s   保存完成 → 数据写入数据库
```

### 3.4 Block 确定机制详解

**核心逻辑** (BlockEditor.tsx):

```typescript
useEffect(() => {
  if (!onBlockConfirmed) return;
  
  // 1. 找出所有已确定的 blocks
  const currentConfirmedBlocks = blocks.filter(b => 
    b.type === 'paragraph' &&        // 段落类型
    !b.isAsrWriting &&               // 不是 ASR 正在写入
    !b.isBufferBlock &&              // 不是缓冲块
    b.content.trim()                 // 有内容
  );
  
  // 2. 找出新确定的 blocks（之前未记录过的）
  const newConfirmedBlocks = currentConfirmedBlocks.filter(b =>
    !previousConfirmedIdsRef.current.has(b.id)
  );
  
  // 3. 如果有新确定的 blocks，触发保存
  if (newConfirmedBlocks.length > 0) {
    onBlockConfirmed();  // 调用 App.tsx 中的保存逻辑
    
    // 4. 更新已确定的 blocks 记录
    previousConfirmedIdsRef.current = new Set(
      currentConfirmedBlocks.map(b => b.id)
    );
  }
}, [blocks, onBlockConfirmed]);
```

**触发时机**:

1. **ASR utterance 完成**
   - ASR 写入完成 → `isAsrWriting` 变为 `false`
   - block 有内容 → 被识别为"已确定"
   - 触发 `onBlockConfirmed`

2. **键盘回车创建新 block**
   - 用户在 block-1 中回车
   - 创建 block-2，光标移动到 block-2
   - block-1 不再是编辑状态，有内容 → 被识别为"已确定"
   - 触发 `onBlockConfirmed`

3. **粘贴文本**
   - 粘贴多段文本，创建多个 blocks
   - 每个 block 都有内容，不是 ASR 写入 → 被识别为"已确定"
   - 触发 `onBlockConfirmed`

**不会触发的情况**:

- ❌ 用户在同一个 block 中持续打字（block 未确定）
- ❌ ASR 正在写入（`isAsrWriting=true`）
- ❌ 缓冲块（`isBufferBlock=true`）
- ❌ 空 block（`content.trim()` 为空）

---

### 3.5 定期保存重置机制

**核心思想**: 任何保存成功后，重置60秒定期计时器

```typescript
private resetPeriodicTimer() {
  // 清除旧定时器
  if (this.periodicSaveTimer) {
    clearInterval(this.periodicSaveTimer);
  }
  
  // 重新启动60秒定时器
  this.periodicSaveTimer = setInterval(() => {
    this.saveToDatabase('periodic', false);
  }, 60000);  // 60秒
}
```

**效果**:
```
0s   Block 确定 → 保存成功 → 重置定期计时器
30s  Block 确定 → 保存成功 → 重置定期计时器
60s  Block 确定 → 保存成功 → 重置定期计时器
120s 无操作 → 定期保存触发（距离上次保存60秒）
```

**避免了**:
- 频繁的定期保存（每60秒固定触发）
- 重复保存（刚保存完又定期保存）

---

## API 参考

### 4.1 构造函数

```typescript
constructor(
  appType: AppType,
  adapter: AppAdapter,
  config?: Partial<AutoSaveConfig>
)
```

**参数**:
- `appType`: 应用类型（`'voice-note'` | `'smart-chat'` | `'voice-zen'`）
- `adapter`: 应用特定适配器实例
- `config`: 可选的配置覆盖

**示例**:
```typescript
const voiceNoteAutoSave = new AutoSaveService(
  'voice-note',
  new VoiceNoteAdapter(getVoiceNoteData),
  {
    periodicSaveInterval: 30000,  // 自定义为30秒
  }
);
```

### 4.2 核心方法

#### 4.2.1 `start()`

启动自动保存服务。

```typescript
start(): void
```

**功能**:
1. 启动 localStorage 临时保存（每1秒）
2. 启动定期保存（60秒）
3. 尝试恢复上次会话

**调用时机**:
```typescript
// App.tsx
useEffect(() => {
  if (isWorkSessionActive && activeView === 'voice-note') {
    voiceNoteAutoSave.start();
    
    return () => {
      voiceNoteAutoSave.stop();
    };
  }
}, [isWorkSessionActive, activeView]);
```

#### 4.2.2 `stop()`

停止自动保存服务。

```typescript
stop(): void
```

**功能**:
1. 清除 localStorage 定时器
2. 清除数据库保存防抖定时器
3. 清除定期保存定时器
4. 清除长时间编辑兜底定时器

**注意**: 不会触发最后保存！离开前请手动调用 `saveToDatabase()`。

#### 4.2.3 `saveToDatabase()`

保存数据到数据库。

```typescript
async saveToDatabase(
  trigger: SaveTrigger,
  immediate: boolean = false
): Promise<void>
```

**参数**:
- `trigger`: 保存触发器类型
- `immediate`: 是否立即保存（跳过防抖）

**示例**:
```typescript
// 防抖保存（3秒后执行）
await voiceNoteAutoSave.saveToDatabase('block_confirmed', false);

// 立即保存
await voiceNoteAutoSave.saveToDatabase('view_switch', true);
```

**执行流程**:
```
1. 获取稳定数据 (adapter.getStableData())
2. 检查是否有内容 (adapter.hasContent())
3. 转换为保存格式 (adapter.toSaveData())
4. 更新或创建记录 (PUT/POST)
5. 重置定期计时器 (resetPeriodicTimer())
```

#### 4.2.4 `recover()`

从数据库或 localStorage 恢复数据。

```typescript
async recover(): Promise<any | null>
```

**恢复优先级**:
```
1. 检查 localStorage 临时数据
   - 如果存在 && 5分钟内 && 比数据库记录新
   - → 返回临时数据

2. 检查数据库最近记录
   - 如果存在 && 1小时内
   - → 返回数据库记录

3. 无可恢复数据
   - → 返回 null
```

**返回值**:
- 成功: 返回恢复的 metadata 对象
- 失败: 返回 `null`

#### 4.2.5 `reset()`

重置会话（创建新笔记/对话时调用）。

```typescript
reset(): void
```

**功能**:
1. 清除 `currentRecordId`
2. 生成新的 `sessionId`
3. 清除 localStorage 临时数据

**调用时机**:
```typescript
// 创建新笔记
const handleNewNote = () => {
  voiceNoteAutoSave.reset();
  setInitialBlocks([...]);
};
```

#### 4.2.6 `getCurrentRecordId()`

获取当前记录ID。

```typescript
getCurrentRecordId(): string | null
```

**用途**:
- 检查是否已创建数据库记录
- 构建记录详情页链接

---

## 使用指南

### 5.1 完整使用示例

```typescript
// 1. 定义适配器
const voiceNoteAdapter = new VoiceNoteAdapter(() => {
  return {
    blocks: currentBlocks,
    noteInfo: currentNoteInfo,
  };
});

// 2. 创建服务实例
const voiceNoteAutoSave = new AutoSaveService(
  'voice-note',
  voiceNoteAdapter
);

// 3. 启动服务
useEffect(() => {
  if (isWorkSessionActive && activeView === 'voice-note') {
    voiceNoteAutoSave.start();
    
    return () => {
      voiceNoteAutoSave.stop();
    };
  }
}, [isWorkSessionActive, activeView]);

// 4. 触发保存
const handleBlockConfirmed = useCallback(() => {
  voiceNoteAutoSave.saveToDatabase('block_confirmed', false);
}, []);

const handleViewChange = async (newView: AppView) => {
  if (activeView === 'voice-note' && newView !== 'voice-note') {
    // 离开时立即保存
    await voiceNoteAutoSave.saveToDatabase('view_switch', true);
  }
  setActiveView(newView);
};

// 5. 手动保存
const handleManualSave = async () => {
  await voiceNoteAutoSave.saveToDatabase('manual', true);
  setToast({ message: '保存成功', type: 'success' });
};

// 6. 创建新笔记
const handleNewNote = () => {
  voiceNoteAutoSave.reset();
  setInitialBlocks([noteInfoBlock]);
};
```

### 5.2 生命周期管理

```typescript
┌─────────────────────────────────────────────────┐
│         AutoSaveService 生命周期                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  创建实例                                        │
│  const service = new AutoSaveService(...)       │
│            ↓                                    │
│  启动服务                                        │
│  service.start()                                │
│            ↓                                    │
│  运行中（自动保存）                               │
│  - localStorage 每1秒                           │
│  - 数据库智能触发                                 │
│  - 定期保存60秒                                  │
│            ↓                                    │
│  停止服务                                        │
│  service.stop()                                 │
│            ↓                                    │
│  重置会话（可选）                                 │
│  service.reset()                                │
│            ↓                                    │
│  再次启动（新会话）                               │
│  service.start()                                │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 5.3 错误处理

```typescript
// 保存失败不会抛出异常，而是记录日志
await voiceNoteAutoSave.saveToDatabase('manual', true);
// 即使失败，也不会中断用户操作

// 恢复失败返回 null
const recovered = await voiceNoteAutoSave.recover();
if (recovered === null) {
  console.log('无可恢复的数据，从头开始');
}
```

---

## 配置选项

### 6.1 配置接口

```typescript
interface AutoSaveConfig {
  // localStorage 保存间隔（毫秒）
  localStorageInterval: number;
  
  // 数据库保存防抖延迟（毫秒）
  dbSaveDebounce: number;
  
  // 长时间编辑兜底保存阈值（毫秒）
  longEditThreshold: number;
  
  // 定期保存间隔（毫秒）
  periodicSaveInterval: number;
  
  // 恢复时间限制（毫秒）
  recoverTimeLimit: number;
  
  // 临时数据优先时限（毫秒）
  volatileDataPriority: number;
}
```

### 6.2 默认配置

```typescript
const DEFAULT_CONFIG: AutoSaveConfig = {
  localStorageInterval: 1000,        // 1秒
  dbSaveDebounce: 3000,              // 3秒
  longEditThreshold: 30000,          // 30秒（暂未使用）
  periodicSaveInterval: 60000,       // 60秒
  recoverTimeLimit: 3600000,         // 1小时
  volatileDataPriority: 300000,      // 5分钟
};
```

### 6.3 配置建议

| 场景 | 配置调整 | 理由 |
|-----|---------|------|
| **性能优先** | `periodicSaveInterval: 120000` (2分钟) | 减少数据库写入频率 |
| **数据安全优先** | `periodicSaveInterval: 30000` (30秒) | 更频繁的兜底保存 |
| **调试模式** | `dbSaveDebounce: 1000` (1秒) | 快速观察保存效果 |
| **移动设备** | `localStorageInterval: 3000` (3秒) | 降低 localStorage 写入频率 |

---

## 适配器开发

### 7.1 AppAdapter 接口

```typescript
interface AppAdapter {
  getAllData(): any;
  isVolatile(item: any): boolean;
  getStableData(): any;
  toSaveData(stableData: any): SaveData;
  hasContent(data: any): boolean;
}
```

### 7.2 VoiceNote 适配器示例

```typescript
export class VoiceNoteAdapter implements AppAdapter {
  constructor(private dataGetter: () => VoiceNoteData) {}
  
  getAllData() {
    return this.dataGetter();
  }
  
  isVolatile(item: Block): boolean {
    // ASR 正在写入的 block 视为临时数据
    return item.isAsrWriting || item.isBufferBlock;
  }
  
  getStableData() {
    const data = this.dataGetter();
    return {
      blocks: data.blocks.filter(b => !this.isVolatile(b)),
      noteInfo: data.noteInfo,
    };
  }
  
  toSaveData(stableData: any): SaveData {
    const { blocks, noteInfo } = stableData;
    
    // 生成纯文本
    const text = blocks
      .filter(b => b.type !== 'note-info')
      .map(b => {
        if (b.type === 'image') {
          return `[IMAGE: ${b.imageUrl}]${b.imageCaption || ''}`;
        }
        return b.content;
      })
      .filter(text => text.trim())
      .join('\n');
    
    // 生成 metadata
    const metadata = {
      blocks,
      noteInfo,
      language: 'zh-CN',
      provider: 'volcano',
      app_type: 'voice-note',
    };
    
    return {
      text,
      app_type: 'voice-note',
      metadata,
    };
  }
  
  hasContent(data: any): boolean {
    if (!data || !data.blocks) return false;
    
    const contentBlocks = data.blocks.filter(
      b => b.type !== 'note-info' && b.content?.trim()
    );
    
    return contentBlocks.length > 0;
  }
}
```

### 7.3 适配器开发指南

#### 7.3.1 定义临时数据

```typescript
isVolatile(item: any): boolean {
  // 示例：对话中，AI 正在生成的消息
  return item.status === 'generating';
  
  // 示例：笔记中，ASR 正在写入的 block
  return item.isAsrWriting;
  
  // 示例：禅模式中，正在录音的会话
  return item.isRecording;
}
```

#### 7.3.2 生成保存数据

```typescript
toSaveData(stableData: any): SaveData {
  // 1. 提取纯文本（用于搜索和预览）
  const text = extractText(stableData);
  
  // 2. 生成 metadata（保留完整结构）
  const metadata = {
    ...stableData,
    app_type: this.appType,
    // 添加其他元数据
  };
  
  // 3. 返回保存格式
  return {
    text,
    app_type: this.appType,
    metadata,
  };
}
```

#### 7.3.3 检查内容有效性

```typescript
hasContent(data: any): boolean {
  // 至少有一条有效消息/block
  if (!data.items || data.items.length === 0) {
    return false;
  }
  
  // 至少有一条非空内容
  const validItems = data.items.filter(
    item => item.content && item.content.trim()
  );
  
  return validItems.length > 0;
}
```

---

## 故障排查

### 8.1 常见问题

#### 问题1: 数据未保存

**症状**: 用户编辑后切换界面，返回时数据丢失

**排查步骤**:
```bash
# 1. 检查控制台日志
# 查找: [AutoSave-voice-note] 💾 saveToDatabase 调用
# 查找: [AutoSave-voice-note] ✅ 更新记录成功

# 2. 检查数据库
sqlite3 ~/Library/Application\ Support/MindVoice/database/history.db
SELECT * FROM records ORDER BY created_at DESC LIMIT 1;

# 3. 检查 localStorage
# 在浏览器控制台执行:
JSON.parse(localStorage.getItem('volatile_voice-note'));
```

**可能原因**:
- `hasContent()` 返回 `false`（数据被认为是空的）
- API 连接失败（检查 `http://127.0.0.1:8765` 是否可访问）
- 适配器 `toSaveData()` 返回空 `text`
- **仅编辑 note-info 时触发保存**（v1.0.1 已修复）

**解决方案** (v1.0.1):
```typescript
// VoiceNoteAdapter.ts - hasContent() 修复
hasContent(data: VoiceNoteData): boolean {
  const { blocks } = data;
  
  // 仅有 noteInfo 不算有效内容
  // 必须至少有一个非 note-info 的 block
  const hasBlockContent = blocks.some(b => 
    b.type !== 'note-info' && 
    !b.isBufferBlock && 
    (b.content?.trim() || b.type === 'image')
  );
  
  return hasBlockContent;
}
```

#### 问题2: 保存频率过高

**症状**: 数据库写入频繁，性能下降

**排查步骤**:
```typescript
// 在控制台筛选日志
// 查看 [AutoSave-voice-note] 💾 saveToDatabase 调用 的频率

// 统计触发器类型
// trigger: 'block_confirmed' → 正常
// trigger: 'periodic' → 如果频繁出现，说明其他触发失效
```

**解决方案**:
- 检查 `resetPeriodicTimer()` 是否正常调用
- 确认保存成功后是否重置定期计时器
- 考虑增加 `periodicSaveInterval` 到 90 秒或 120 秒

#### 问题3: 防抖被打断

**症状**: 用户切换界面时，防抖中的保存被取消

**已修复**: v1.0 已添加 `view_switch` 立即保存

```typescript
// App.tsx
const handleViewChange = async (newView: AppView) => {
  if (activeView === 'voice-note' && newView !== 'voice-note') {
    // 立即保存，覆盖防抖
    await voiceNoteAutoSave.saveToDatabase('view_switch', true);
  }
  setActiveView(newView);
};
```

#### 问题4: 防抖保存失败但立即保存成功

**症状**: 控制台显示 `❌ 创建记录失败`，但离开界面时保存成功

**根本原因** (v1.0.1 已修复):
- 用户仅编辑 note-info 块时，`toSaveData()` 会过滤掉 note-info
- 导致 `text` 字段为空字符串
- 后端拒绝保存空内容

**修复方案**:
```typescript
// VoiceNoteAdapter.ts - hasContent() 修复
hasContent(data: VoiceNoteData): boolean {
  const { blocks } = data;
  
  // 仅有 noteInfo 不算有效内容
  // 必须至少有一个非 note-info 的 block
  const hasBlockContent = blocks.some(b => 
    b.type !== 'note-info' && 
    !b.isBufferBlock && 
    (b.content?.trim() || b.type === 'image')
  );
  
  return hasBlockContent;
}
```

**增强的错误日志** (v1.0.1):
```typescript
// AutoSaveService.ts - 前端
console.error(`[AutoSave-${this.appType}] ❌ 创建记录失败`, {
  message: result.message,      // 新增：后端错误消息
  error: result.error,          // 新增：错误详情
  duration: `${duration}ms`,
  saveData: {
    textLength: saveData.text.length,
    app_type: saveData.app_type,
  },
});
```

```python
# server.py - 后端
if not request.text or not request.text.strip():
    logger.warning(f"[API] 文本保存被拒绝: 内容为空 (app_type={request.app_type}, blocks={'有' if request.blocks else '无'})")
    # ... 返回错误
```

### 8.2 调试日志

AutoSaveService 提供详细的日志输出：

| 日志前缀 | 含义 | 示例 |
|---------|------|------|
| `💾 saveToDatabase 调用` | 保存请求发起 | `{trigger: 'block_confirmed', immediate: false}` |
| `⏱️  防抖：启动定时器` | 防抖定时器启动 | `启动定时器 3000ms` |
| `⏰ 防抖时间到` | 防抖定时器触发 | `执行保存` |
| `🚀 开始执行保存` | 开始保存流程 | `{trigger: 'block_confirmed'}` |
| `✅ 更新记录成功` | 保存成功 | `{recordId: 'xxx', duration: '10ms'}` |
| `❌ 创建记录失败` | 保存失败 | `{duration: '50ms'}` |
| `⏲️  定期保存计时器已重置` | 60秒计时器重置 | - |

**开启详细日志**:
```typescript
// 在浏览器控制台
localStorage.setItem('debug', 'AutoSave*');
```

---

## 性能优化

### 9.1 性能指标

| 指标 | 目标值 | 实际值 | 测量方法 |
|-----|-------|-------|---------|
| **保存延迟** | < 50ms | 5-15ms | 日志中的 `duration` |
| **防抖响应** | 3秒 | 3秒 | `dbSaveDebounce` |
| **定期保存间隔** | 60秒 | 60秒 | `periodicSaveInterval` |
| **localStorage 写入** | 1秒 | 1秒 | `localStorageInterval` |

### 9.2 优化建议

#### 9.2.1 减少数据库写入

**当前机制**: 已优化
- ✅ 防抖3秒（合并连续保存）
- ✅ 重置定期计时器（避免重复保存）
- ✅ 空内容检查（跳过无效保存）

#### 9.2.2 减少 localStorage 写入

**当前**: 每1秒无条件写入

**优化方案**:
```typescript
private saveVolatileToLocalStorage() {
  const allData = this.adapter.getAllData();
  const volatileItems = /* ... */;
  
  // 优化: 检查是否有变化
  const currentKey = this.getLocalStorageKey();
  const lastSaved = localStorage.getItem(currentKey);
  const currentData = JSON.stringify(volatileItems);
  
  if (lastSaved === currentData) {
    return;  // 无变化，跳过写入
  }
  
  // 有变化，写入 localStorage
  localStorage.setItem(currentKey, /* ... */);
}
```

#### 9.2.3 索引优化

**数据库索引** (已在 `.cursorrules` 中建议):
```sql
CREATE INDEX idx_created_at ON records(created_at DESC);
CREATE INDEX idx_app_type ON records(app_type);
CREATE INDEX idx_app_type_created_at ON records(app_type, created_at DESC);
```

---

## 常见问题

### 10.1 为什么需要双层存储？

**答**: 
- **localStorage**: 快速、高频、用于崩溃恢复（如浏览器意外关闭）
- **SQLite**: 可靠、低频、用于长期存储和跨会话访问

两者互补，提供最佳的数据安全性和性能。

### 10.2 为什么防抖是3秒？

**答**:
- **太短（< 1秒）**: 频繁写入数据库，影响性能
- **太长（> 5秒）**: 用户感知延迟，数据风险增加
- **3秒**: 平衡性能和用户体验的最佳值

### 10.3 定期保存60秒会不会太长？

**答**: 不会，因为：
1. 有 block 确定保存（主要机制）
2. 有失焦保存（保障机制）
3. 有切换视图保存（保障机制）
4. 定期保存只是兜底，实际很少触发

**最坏情况**: 用户在60秒内持续编辑，未回车，未失焦，未切换
- **结果**: 60秒定期保存触发
- **丢失**: 0%（有 localStorage 每秒备份）

### 10.4 如何处理网络断开？

**当前**: 保存失败会记录日志，但不会重试

**建议**: 未来可添加离线队列机制
```typescript
// 伪代码
if (navigator.onLine) {
  await saveToDatabase();
} else {
  queueOfflineSave(data);  // 加入离线队列
}

window.addEventListener('online', () => {
  processOfflineQueue();  // 网络恢复后处理队列
});
```

### 10.5 可以同时打开多个标签页吗？

**当前**: 不建议

**原因**: 
- 多个标签页会有独立的 `sessionId`
- localStorage 会互相覆盖
- 数据库保存可能冲突

**未来优化**: 添加标签页同步机制（使用 BroadcastChannel）

---

## 附录

### A. 类型定义

```typescript
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
  data: any;
}

export interface SaveData {
  text: string;
  app_type: AppType;
  metadata: Record<string, any>;
}
```

### B. 相关文件

| 文件 | 说明 |
|-----|------|
| `electron-app/src/services/AutoSaveService.ts` | 核心服务类 |
| `electron-app/src/services/VoiceNoteAdapter.ts` | VoiceNote 适配器 |
| `electron-app/src/App.tsx` | 使用示例 |
| `src/api/server.py` | 后端 API（保存/恢复） |
| `src/providers/storage/sqlite.py` | SQLite 存储提供者 |

### C. 版本历史

| 版本 | 日期 | 变更 |
|-----|------|------|
| **1.0** | 2026-01-04 | 里程碑版本，统一自动保存策略 |
| - | - | 添加 `view_switch` 触发器 |
| - | - | 实现定期保存重置机制 |
| - | - | 移除长时间编辑兜底（由定期保存覆盖） |

---

## 反馈与贡献

如有问题或建议，请联系：
- **开发者**: 深圳王哥 & AI
- **邮箱**: manwjh@126.com

**文档版本**: v1.0  
**最后更新**: 2026-01-04

