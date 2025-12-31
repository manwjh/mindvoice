# 基于时间间隔的Utterance累加模式

## 概述

**日期**: 2025-12-31  
**目标**: 在 ASR Provider 层实现基于时间间隔的智能累加判断，当前句子的开始时间和上一个句子的结束时间间隔 < 800ms 时，自动采用累加模式。

## 设计原则

### 为什么在 ASR Provider 层实现？

1. **数据完整性** ✅
   - ASR 层拥有最准确的时间信息（`start_time`, `end_time`）
   - 可以直接计算时间间隔，不需要依赖文本匹配或前端逻辑

2. **职责清晰** ✅
   - 符合项目架构原则："utterance 合并是数据处理问题，应由 ASR Provider 负责"
   - 前端只需要接收处理好的标志进行展示

3. **逻辑集中** ✅
   - 所有客户端都受益（如果将来有多个前端）
   - 易于维护和测试

4. **性能更好** ✅
   - 在数据源头就处理好，减少网络传输
   - 避免前端处理复杂逻辑

## 技术实现

### 1. ASR Provider 层 (`src/providers/asr/volcano.py`)

#### 新增状态变量

```python
def __init__(self):
    # ... 现有代码 ...
    self._last_utterance_end_time = 0  # 上一个utterance的结束时间（用于判断是否应该累加）
```

#### 核心方法：`_handle_recognition_result`

**功能**: 基于 ASR 返回的时间标签，计算时间间隔并判断是否应该累加

**判断逻辑**:

```python
# 计算时间间隔
current_start = time_info.get('start_time', 0)
last_end = self._last_utterance_end_time
time_gap = current_start - last_end

# 如果间隔小于800ms，则应该累加
should_accumulate = (last_end > 0) and (time_gap < 800)

# 更新最后的结束时间
self._last_utterance_end_time = time_info.get('end_time', 0)
```

**日志输出**:

```
[ASR] 确定utterance: '你说哪个有吸引力?', 2100-3200ms, 间隔=1100ms
[ASR] 确定utterance: '黄山的很多酒店。', 3860-4720ms, 间隔=660ms, [累加模式]
[ASR] 确定utterance: '正在发生这种。', 5060-5920ms, 间隔=340ms, [累加模式]
```

#### 回调签名更新

```python
def set_on_text_callback(self, callback: Optional[Callable[[str, bool, dict, bool], None]]):
    """设置文本回调函数
    
    Args:
        callback: 回调函数 (text, is_definite_utterance, time_info, should_accumulate)
                  should_accumulate: 是否应该累加到上一个utterance
                                    当前句子的开始时间和上一个句子的结束时间间隔<800ms时为True
    """
```

#### 状态重置

在 `start_streaming_recognition()` 中重置状态：

```python
self._last_utterance_end_time = 0  # 重置utterance结束时间
```

### 2. Voice Service 层 (`src/services/voice_service.py`)

#### 回调签名同步更新

```python
def _on_asr_text_received(self, text: str, is_definite_utterance: bool, time_info: dict, should_accumulate: bool):
    """ASR 文本接收回调
    
    Args:
        should_accumulate: 是否应该累加到上一个utterance（间隔<800ms时为True）
    """
    # 传递给前端
    if self._on_text_callback:
        self._on_text_callback(text, is_definite_utterance, time_info, should_accumulate)
```

### 3. API Server 层 (`src/api/server.py`)

#### WebSocket 消息格式

**text_final 消息**（新格式）:

```json
{
  "type": "text_final",
  "text": "黄山的很多酒店。",
  "start_time": 3860,
  "end_time": 4720,
  "should_accumulate": true
}
```

**text_update 消息**（格式不变）:

```json
{
  "type": "text_update",
  "text": "黄山的很多"
}
```

**注意**: 
- 只有 `text_final` 类型的消息才包含 `should_accumulate` 标志
- `text_update` (中间结果) 不包含此标志

#### 回调函数更新

```python
def on_text_callback(text: str, is_definite: bool, time_info: dict, should_accumulate: bool):
    message = {
        "type": "text_final" if is_definite else "text_update",
        "text": text
    }
    # 仅在确定的utterance时添加时间信息和累加标志
    if is_definite and time_info:
        message["start_time"] = time_info.get('start_time', 0)
        message["end_time"] = time_info.get('end_time', 0)
        message["should_accumulate"] = should_accumulate
    broadcast(message)
```

## 前端集成指南

### BlockEditor.tsx 修改建议

前端只需要根据 `should_accumulate` 标志来决定是创建新 Block 还是合并到上一个 Block：

```typescript
// 在 appendAsrText 方法中
const appendAsrText = useCallback(
  (newText: string, isDefiniteUtterance: boolean = false, timeInfo?: { 
    startTime?: number; 
    endTime?: number;
    shouldAccumulate?: boolean;  // 新增参数
  }) => {
    if (!isAsrActive) return;

    setBlocks((prev) => {
      const updated = [...prev];
      
      // 查找当前激活的Block
      let currentIdx = asrWritingBlockIdRef.current
        ? updated.findIndex((b) => b.id === asrWritingBlockIdRef.current)
        : -1;
      
      if (currentIdx < 0) {
        const { blocks: newBlocks, blockId, index } = ensureAsrWritingBlock(updated);
        updated.splice(0, updated.length, ...newBlocks);
        asrWritingBlockIdRef.current = blockId;
        currentIdx = index;
      }

      // 🎯 基于后端返回的 should_accumulate 标志决定是否累加
      if (isDefiniteUtterance) {
        // 清空当前正在写入的block
        updated[currentIdx] = {
          ...updated[currentIdx],
          content: '',
          isAsrWriting: false,
          startTime: timeInfo?.startTime,
          endTime: timeInfo?.endTime,
        };
        
        const prevBlockIdx = currentIdx > 0 ? currentIdx - 1 : -1;
        
        // 如果后端标记为应该累加，则合并到上一个block
        if (timeInfo?.shouldAccumulate && prevBlockIdx >= 0 && !updated[prevBlockIdx].isAsrWriting) {
          console.log('[BlockEditor] 后端标记为累加模式，合并到上一个block');
          
          // 合并到上一个block
          updated[prevBlockIdx] = {
            ...updated[prevBlockIdx],
            content: updated[prevBlockIdx].content + newText,
            endTime: timeInfo?.endTime,
          };
          
          // 删除当前空block
          updated.splice(currentIdx, 1);
          
          // 更新引用到上一个block
          asrWritingBlockIdRef.current = updated[prevBlockIdx].id;
        } else {
          // 创建新block
          const newBlock = createBlock(newText, false, timeInfo?.startTime, timeInfo?.endTime);
          updated.splice(currentIdx, 1, newBlock);
          asrWritingBlockIdRef.current = newBlock.id;
        }
      } else {
        // 中间结果：更新当前block
        updated[currentIdx] = {
          ...updated[currentIdx],
          content: newText,
          isAsrWriting: true,
        };
      }

      return updated;
    });
  },
  [isAsrActive, ensureAsrWritingBlock]
);
```

### WebSocket 消息处理

```typescript
// 在 WebSocket 消息处理中
case 'text_final':
  const timeInfo = {
    startTime: data.start_time,
    endTime: data.end_time,
    shouldAccumulate: data.should_accumulate,  // 新增
  };
  appendAsrText(data.text, true, timeInfo);
  break;
```

## 配置参数

### 配置文件 (config.yml)

```yaml
asr:
  # 智能断句修正配置
  enable_utterance_merge: true  # 是否启用基于时间间隔的utterance累加修正（默认开启）
  merge_threshold_ms: 800  # 累加时间阈值（毫秒），间隔小于此值的句子会自动累加
```

### 参数说明

#### enable_utterance_merge

**类型**: `boolean`  
**默认值**: `true`  
**说明**: 是否启用智能断句修正功能

- `true`: 启用累加修正，间隔<阈值的句子会自动累加
- `false`: 禁用累加修正，保持ASR原始输出（bypass模式）

#### merge_threshold_ms

**类型**: `integer`  
**默认值**: `800`  
**单位**: 毫秒（ms）  
**说明**: 累加时间阈值，当前句子的开始时间和上一个句子的结束时间间隔小于此值时会自动累加

**建议值**:
- **800ms**: 适合正常语速，能有效合并连续的短句（推荐）
- **1000ms**: 适合语速较慢的场景
- **600ms**: 适合语速较快的场景
- **0-500ms**: 仅合并非常紧密的句子

## 优势总结

### 相比前端判断的优势

| 维度 | 前端判断 | 后端判断（当前方案） |
|------|---------|---------------------|
| 数据准确性 | ❌ 依赖文本匹配 | ✅ 使用精确的时间标签 |
| 职责清晰 | ❌ UI层处理数据逻辑 | ✅ 数据层处理数据逻辑 |
| 代码复杂度 | ❌ 前端逻辑复杂 | ✅ 前端逻辑简单 |
| 可维护性 | ❌ 多处维护 | ✅ 单一职责 |
| 可扩展性 | ❌ 每个客户端都要实现 | ✅ 所有客户端受益 |

### 相比文本匹配的优势

| 维度 | 文本匹配 | 时间间隔判断 |
|------|---------|-------------|
| 准确性 | ⚠️ 可能误判 | ✅ 精确可靠 |
| 性能 | ⚠️ 需要字符串比较 | ✅ 简单数值比较 |
| 鲁棒性 | ❌ 依赖文本内容 | ✅ 独立于文本内容 |
| 适用场景 | ⚠️ 仅适用于重叠 | ✅ 适用于所有连续utterance |

## 测试建议

### 测试场景

1. **正常语速连续说话**
   - 预期：间隔 < 800ms 的句子应该合并

2. **停顿后继续说话**
   - 预期：间隔 > 800ms 的句子应该分开

3. **快速连续说话**
   - 预期：所有句子都应该合并

4. **极慢语速说话**
   - 预期：每个句子都应该分开

### 日志验证

查看 ASR 日志，确认时间间隔和累加标志：

```
[ASR] 确定utterance: '第一句', 1000-2000ms, 首句
[ASR] 确定utterance: '第二句', 2100-3000ms, 间隔=100ms, [累加模式]
[ASR] 确定utterance: '第三句', 4000-5000ms, 间隔=1000ms
```

## 相关文档

- [ASR 时间信息增强](./ASR_TIMING_INFO.md)
- [Utterance 合并逻辑重构](./UTTERANCE_MERGE_REFACTOR.md)
- [ASR 可靠性分析](./ASR_RELIABILITY_ANALYSIS.md)
- [优化指南](./OPTIMIZATION_GUIDE.md)

## 使用示例

### 启用累加修正（默认）

```yaml
asr:
  enable_utterance_merge: true
  merge_threshold_ms: 800
```

**效果**: 
```
原始ASR输出: "饮食。" | "早起，早睡。" | "咱们自己努力多活三年"
修正后输出: "饮食。早起，早睡。咱们自己努力多活三年"
```

### 禁用累加修正（bypass模式）

```yaml
asr:
  enable_utterance_merge: false
```

**效果**: 
```
输出: "饮食。" | "早起，早睡。" | "咱们自己努力多活三年"
```
（保持ASR原始切分）

### 调整阈值

```yaml
asr:
  enable_utterance_merge: true
  merge_threshold_ms: 600  # 更严格的合并条件
```

## 版本历史

- **v1.1** (2025-12-31): 添加配置开关 `enable_utterance_merge` 和可调阈值 `merge_threshold_ms`
- **v1.0** (2025-12-31): 初始实现，阈值硬编码为 800ms

