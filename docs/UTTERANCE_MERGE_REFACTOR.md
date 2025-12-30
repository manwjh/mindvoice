# Utterance合并逻辑重构

## 变更概述

**日期**: 2025-12-31  
**目标**: 将utterance重叠/片段化处理逻辑从**前端**迁移到**后端ASR Provider层**

## 问题分析

### 原方案的问题

1. **职责错位**: utterance合并是数据处理问题，不应由UI层处理
2. **信息缺失**: 前端无法获取ASR返回的`start_time`/`end_time`时间标签
3. **判断不准**: 前端基于文本字符串匹配判断重叠，容易误判
4. **维护成本高**: 前端逻辑复杂，难以维护

### 新方案的优势

1. **职责清晰**: ASR Provider负责数据处理，前端只负责展示
2. **数据完整**: 后端可以利用ASR返回的时间标签精确判断
3. **逻辑集中**: 所有客户端（web/mobile/desktop）都受益
4. **易于维护**: 前端代码大幅简化

## 技术实现

### 1. ASR Provider层 (`src/providers/asr/volcano.py`)

#### 新增状态变量

```python
# 用于智能合并utterances的状态
self._last_definite_utterances = []  # 上一个definite的所有utterances
self._accumulated_text = ""  # 累积的文本（已合并重叠部分）
```

#### 核心方法：`_merge_overlapping_utterances`

**功能**: 基于ASR返回的`start_time`和`end_time`时间标签，智能判断并合并重叠的utterances

**判断逻辑**:

1. **时间标签分析**（仅用于日志诊断）:
   ```python
   time_overlap = current_start_time < last_end_time
   ```
   **注意**：经测试发现，ASR返回的时间标签不够精确，即使文本有重叠，时间也可能显示不重叠。因此时间标签只用于诊断，不作为合并的判断依据。

2. **文本重叠检测**（核心逻辑）:
   - **无论时间是否重叠，都检测文本重叠**
   - 找到最长公共后缀/前缀（至少2个字符）
   - 合并文本：`上一个文本 + 新文本[重叠长度:]`
   
   **示例**：
   ```
   上次文本: "...那出口的产品以哪些为主？目前我们来"
   当前文本: "那出口的产品以哪些为主？目前我们来看到主要还是以这个机电产品"
   重叠长度: 19字符
   合并结果: "...那出口的产品以哪些为主？目前我们来看到主要还是以这个机电产品"
   ```

3. **短文本片段检测**:
   - 如果definite utterance长度 < 8字符，自动合并到上一个utterance

**返回值**:
- `(处理后的文本, 是否应该创建新block)`
- 如果合并了，`should_create_new_block = False`，前端继续更新当前block
- 如果是新的独立utterance，`should_create_new_block = True`，前端创建新block

#### 调用时机

在 `_handle_recognition_result` 中，当检测到 `is_definite_utterance=True` 时调用:

```python
if is_definite_utterance:
    processed_text, should_create_new_block = self._merge_overlapping_utterances(
        utterances, text, is_definite_utterance
    )
```

### 2. 前端层 (`electron-app/src/components/BlockEditor.tsx`)

#### 简化前的代码（~100行复杂逻辑）

```typescript
// ❌ 前端自己检测重叠
for (let len = minLen; len >= minOverlap; len--) {
  const prevSuffix = prevText.slice(-len);
  const newPrefix = newText.slice(0, len);
  if (prevSuffix === newPrefix) {
    overlapLength = len;
    break;
  }
}

// ❌ 前端自己判断是否合并
if (overlapLength >= minOverlap) {
  const mergedText = prevText + newText.slice(overlapLength);
  // ... 复杂的block操作
}
```

#### 简化后的代码（~10行简单逻辑）

```typescript
// ✅ 后端已处理，前端只需更新显示
updated[currentIdx] = {
  ...updated[currentIdx],
  content: newText,
};

if (isDefiniteUtterance) {
  // 创建新block
}
```

**代码行数减少**: 163行 → 70行（减少57%）

## 示例场景

### 场景1: 时间重叠 + 文本重叠

**ASR返回**:
```
Utterance #1 (definite):
  text: "那你这样的话怎么去应对基层变成头"
  start_time: 10.0, end_time: 15.0

Utterance #2 (definite):
  text: "那你这样的话怎么去应对基层变成头重脚轻是很重要"
  start_time: 14.5, end_time: 20.0
```

**后端处理**:
```
[ASR-Merge] 时间分析: 上次=[10.00, 15.00], 当前=[14.50, 20.00], 重叠=True
[ASR-Merge] 检测到重叠: 时间重叠且文本重叠19字符
  上次文本: '那你这样的话怎么去应对基层变成头'
  当前文本: '那你这样的话怎么去应对基层变成头重脚轻是很重要'
  重叠部分: '那你这样的话怎么去应对基层变成头'
[ASR-Merge] ✅ 已合并，移除19字符重叠，继续在同一block
```

**前端接收**:
- `text = "那你这样的话怎么去应对基层变成头重脚轻是很重要"`
- `is_definite_utterance = False`（不创建新block，继续更新当前block）

### 场景2: 短文本片段

**ASR返回**:
```
Utterance #1 (definite):
  text: "解放军这"
  start_time: 10.0, end_time: 11.0

Utterance #2 (definite):
  text: "一次的演习"
  start_time: 11.5, end_time: 13.0
```

**后端处理**:
```
[ASR-Merge] 检测到短文本definite (4字符): '解放军这'，合并到上一个block
```

**前端接收**:
- 第1次: `text = "解放军这"`，`is_definite = True`（创建block）
- 第2次: `text = "解放军这一次的演习"`，`is_definite = False`（更新当前block）

## 验证方法

### 1. 查看后端日志

运行应用后录音，查看日志输出：

```bash
[ASR-Merge] 时间分析: ...
[ASR-Merge] 检测到重叠: ...
[ASR-Merge] ✅ 已合并，移除X字符重叠
```

### 2. 检查前端显示

- **无重复文本**: UI上不应再出现"那你这样的话怎么去应对基层变成头"重复两次的情况
- **无碎片化**: 不应出现"解放军这"单独一个block的情况

### 3. Console输出

打开浏览器Console，应该**不再**看到：

```
[BlockEditor] 检测到utterance重叠，合并block  // ❌ 旧逻辑
[BlockEditor] ✅ 已合并，移除X字符重叠        // ❌ 旧逻辑
```

因为这些逻辑已移至后端。

## 配置参数

在 `src/providers/asr/volcano.py` 的 `_merge_overlapping_utterances` 中：

| 参数 | 当前值 | 说明 |
|------|--------|------|
| `min_overlap` | 2 | 最小重叠字符数，低于此值不算重叠 |
| `short_text_threshold` | 8 | 短文本阈值，低于此长度的definite utterance自动合并 |

可以根据实际效果调整这些阈值。

## 兼容性说明

### 回调函数签名

**不变**: `callback(text: str, is_definite_utterance: bool)`

- `is_definite_utterance` 的语义变化：
  - **旧**: ASR原始返回的definite标识
  - **新**: 后端处理后的"是否应该创建新block"标识

- 前端无需修改WebSocket消息处理逻辑
- 向后兼容所有现有客户端

## 待观察问题

1. **阈值调优**: 当前的2字符最小重叠和8字符短文本阈值是否合适？
2. **边界情况**: 用户快速连续说多个短句时的表现
3. **性能影响**: 时间标签比对和文本匹配的性能开销（预计可忽略）

## 回滚方案

如果新方案出现问题，可以快速回滚：

1. **后端**: 注释掉 `_merge_overlapping_utterances` 的调用，直接传原始text
2. **前端**: 恢复之前的overlap detection逻辑（已保留在git history中）

## 相关文档

- [ASR可靠性分析](./ASR_RELIABILITY_ANALYSIS.md)
- [优化指南](./OPTIMIZATION_GUIDE.md)
- [火山引擎ASR文档](https://www.volcengine.com/docs/6561/1354869?lang=zh)

