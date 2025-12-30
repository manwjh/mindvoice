# ASR is_definite_utterance 可靠性分析

## 背景

通过实际测试log和UI对比，发现火山引擎ASR的`is_definite_utterance`标识存在可靠性问题。

## 测试数据分析

### Log示例（2025-12-31 03:16:20-03:17:00）

#### 问题1：Definite Utterance触发过于频繁

```
03:16:29 - definite #1: '那我们士兵的只有百分之五十几，查的标准太。那你这样的话怎么去应对基层变成头'
           ⚠️ 快速连续definite: 上次长度=36, 当前长度=37, 变化=1字符

03:16:36 - definite #2: '那你这样的话怎么去应对基层变成头重脚轻是很重要，为什么打仗？打基层上面是指挥、是管理、是计划下面'
           ⚠️ 快速连续definite: 上次长度=46, 当前长度=48, 变化=2字符
           
03:16:45 - definite #3: '打基层上面是指挥、是管理、是计划，下面就在在仔细作战中，在作战中我认为这个问题非常严重。然后另外一，我们有没有办法？因为时间非常'
           ⚠️ 快速连续definite: 上次长度=62, 当前长度=64, 变化=2字符
```

**特征**：每次definite utterance相比前一次只增加1-3个字符，说明ASR判断过于激进。

#### 问题2：Utterance之间存在文本重叠

**Log中的definite utterance序列**：
1. `...应对基层变成头` (结尾)
2. `那你这样的话怎么去应对基层变成头重脚轻...` (开头)

**UI实际显示**：
```
Block 1: 那我们士兵的只有百分之五十几，查的标准太。那你这样的话怎么去应对基层变成头

Block 2: 那你这样的话怎么去应对基层变成头重脚轻是很重要，为什么打仗？打基层上面是指挥、是管理、是计划下面
```

**重叠分析**：
- 重叠部分：`那你这样的话怎么去应对基层变成头`（19个字符）
- 重叠率：Block 1结尾的43% / Block 2开头的38%

#### 问题3：Definite Utterance之间的时间间隔很长

```
03:16:29 - definite #1
03:16:29-03:16:35 - 持续收到中间结果（is_definite_utterance=False）
03:16:36 - definite #2（间隔7秒）

03:16:36 - definite #2
03:16:36-03:16:44 - 持续收到中间结果
03:16:45 - definite #3（间隔9秒）
```

**问题**：在两个definite utterance之间，ASR会持续发送中间结果更新（每个都是完整的累积文本）。这导致：
- 基于时间间隔的overlap detection失效（间隔 > 3秒阈值）
- 新的definite utterance实际上是在收到第一个中间结果时就包含了重叠内容

## 结论

### `is_definite_utterance` 可信度评估

**总体可信度：30-40%**

| 维度 | 表现 | 可信度 |
|------|------|--------|
| 语义完整性 | 经常将完整句子拆分 | ❌ 低 (20%) |
| 切分边界准确性 | 存在大量重叠和重复 | ❌ 低 (30%) |
| 触发时机合理性 | 过于频繁，变化1-3字符就触发 | ❌ 低 (10%) |
| 与实际语音停顿的对应 | 不明确，可能受其他因素影响 | ⚠️ 中 (50%) |

**不推荐依赖场景**：
1. ❌ 直接用于UI分段（会导致碎片化）
2. ❌ 用于判断用户是否说完一句话
3. ❌ 用于触发下游处理逻辑（会导致过度触发）

**可以参考的场景**：
1. ⚠️ 作为"可能的切分点"之一（需结合其他信号）
2. ⚠️ 用于触发某些非关键的后台处理

## 解决方案

### 方案1：移除时间限制的overlap detection（已实施）

**核心思路**：不依赖时间间隔，总是检测并合并重叠的utterance。

**实现**：
```typescript
// electron-app/src/components/BlockEditor.tsx
// 移除了 timeSinceLastDefinite < 3000 的限制
if (prevBlockIdx >= 0 && !updated[prevBlockIdx].isAsrWriting) {
  // 检测overlap（最小3个字符）
  // 找到最长公共后缀/前缀
  // 如果有重叠，合并到上一个block
}
```

**优点**：
- ✅ 简单直接
- ✅ 能有效移除重叠文本
- ✅ 保留了definite utterance作为"可能的分段点"

**缺点**：
- ⚠️ 依然依赖ASR的定义标识，只是修复了副作用
- ⚠️ 如果ASR完全不返回重叠，这个逻辑就失效了

### 方案2：基于静音期的自动分段（备选）

**核心思路**：完全忽略`is_definite_utterance`，基于文本更新的时间间隔来判断。

**实现思路**：
```typescript
const lastUpdateTimeRef = useRef<number>(0);
const AUTO_SPLIT_THRESHOLD = 2500; // 2.5秒无更新自动分段

// 每次收到ASR文本（不管是否definite）
const now = Date.now();
const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

if (timeSinceLastUpdate > AUTO_SPLIT_THRESHOLD && currentBlock.content.length > 0) {
  // 结束当前block，创建新block
}
```

**优点**：
- ✅ 完全不依赖ASR的unreliable标识
- ✅ 更符合用户的实际语音停顿
- ✅ 逻辑简单清晰

**缺点**：
- ⚠️ 需要调优阈值（不同用户说话节奏不同）
- ⚠️ 可能在长句中间误分段

### 方案3：用户手动分段 + 智能建议（终极方案）

**核心思路**：UI默认不分段，所有ASR文本都累积在一个block中。用户可以：
1. 手动按Enter分段
2. 点击"智能分段"按钮，根据标点符号和停顿自动分段

**优点**：
- ✅ 用户体验最好
- ✅ 不依赖不可靠的ASR标识
- ✅ 灵活性最高

**缺点**：
- ⚠️ 需要UI改动
- ⚠️ 增加用户操作步骤

## 建议

**短期（当前实施）**：
- 方案1：移除时间限制，总是检测overlap
- 添加详细的console日志，便于调试

**中期（如果方案1效果不佳）**：
- 方案2：改用基于静音期的自动分段
- 可以在设置中让用户调整阈值

**长期（体验优化）**：
- 方案3：用户手动分段为主，智能辅助为辅
- 考虑提供"合并多个block"的快捷操作

## 测试验证

运行测试后，检查console输出：

```bash
# 应该看到类似的日志：
[BlockEditor] 检测到utterance重叠，合并block {
  prevText: "...应对基层变成头",
  overlap: "那你这样的话怎么去应对基层变成头",
  newText: "那你这样的话怎么去应对基层变成头重脚轻...",
  overlapLength: 19,
  gap: "7234ms"  # 注意：间隔可能很长
}
[BlockEditor] ✅ 已合并，移除19字符重叠
```

如果依然看到重复文本，说明overlap detection逻辑需要进一步优化。

