# ASR 时间信息增强

## 概述

为 `text_final` 消息添加了开始时间和结束时间信息，方便前端显示语音识别的时间范围。

## 变更说明

### 1. ASR Provider 层 (`volcano.py`)

#### 修改的方法

**`_detect_definite_utterance()`**
- **返回值变更**: 从 `bool` 改为 `tuple[bool, dict]`
- **提取信息**: 从 ASR 服务的 `utterances` 数组中提取时间信息
- **时间字段**: 
  - `start_time`: utterance 开始时间（毫秒）
  - `end_time`: utterance 结束时间（毫秒）

```python
# 修改前
def _detect_definite_utterance(self, result: dict, text: str) -> bool:
    ...
    return True  # 或 False

# 修改后
def _detect_definite_utterance(self, result: dict, text: str) -> tuple[bool, dict]:
    ...
    return True, {'start_time': 1234, 'end_time': 5678}
```

**`_handle_recognition_result()`**
- 调用回调函数时传递时间信息

**`set_on_text_callback()`**
- **回调签名变更**: 从 `Callable[[str, bool], None]` 改为 `Callable[[str, bool, dict], None]`
- **新参数**: `time_info: dict` - 包含 `start_time` 和 `end_time`

### 2. Voice Service 层 (`voice_service.py`)

#### 修改的方法

**`_on_asr_text_received()`**
- 新增参数: `time_info: dict`
- 日志输出包含时间信息

**`set_on_text_callback()`**
- 回调签名同步更新

### 3. API Server 层 (`server.py`)

#### WebSocket 消息格式变更

**text_final 消息**（新格式）
```json
{
  "type": "text_final",
  "text": "这十年过来。",
  "start_time": 1234,
  "end_time": 5678
}
```

**text_update 消息**（格式不变）
```json
{
  "type": "text_update",
  "text": "这十年过来"
}
```

**注意**: 
- 只有 `text_final` 类型的消息才包含时间信息
- `text_update` (中间结果) 不包含时间信息

## 时间信息说明

### 时间单位
- 单位：**毫秒 (ms)**
- 基准：相对于当前音频流的开始时间

### 示例计算

```python
start_time = 1234  # 1.234 秒
end_time = 5678    # 5.678 秒
duration = end_time - start_time  # 4.444 秒（utterance 持续时间）
```

### 前端使用示例

```typescript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'text_final') {
    const text = data.text;
    const startTime = data.start_time;  // 毫秒
    const endTime = data.end_time;      // 毫秒
    
    // 转换为秒
    const startSec = (startTime / 1000).toFixed(2);
    const endSec = (endTime / 1000).toFixed(2);
    
    console.log(`[${startSec}s - ${endSec}s] ${text}`);
    
    // 或者显示在 UI 上
    displayTextWithTimestamp(text, startSec, endSec);
  }
};
```

## 兼容性说明

### 向后兼容
- ❌ **不兼容**: 回调函数签名已变更，需要更新所有使用 `set_on_text_callback` 的地方
- ✅ **前端兼容**: 前端可以选择忽略 `start_time` 和 `end_time` 字段

### 迁移指南

**旧代码**:
```python
voice_service.set_on_text_callback(
    lambda text, is_definite: print(f"{text}, definite={is_definite}")
)
```

**新代码**:
```python
voice_service.set_on_text_callback(
    lambda text, is_definite, time_info: print(
        f"{text}, definite={is_definite}, "
        f"time={time_info.get('start_time', 0)}-{time_info.get('end_time', 0)}ms"
    )
)
```

## API 文档更新

### WebSocket 消息类型

#### text_final
确定的完整 utterance（当 ASR 服务返回 `definite=True` 时）

**字段**:
- `type`: "text_final"
- `text`: 识别的文本内容
- `start_time`: utterance 开始时间（毫秒）
- `end_time`: utterance 结束时间（毫秒）

**示例**:
```json
{
  "type": "text_final",
  "text": "这十年过来。",
  "start_time": 0,
  "end_time": 4440
}
```

#### text_update
中间识别结果（实时更新）

**字段**:
- `type`: "text_update"
- `text`: 识别的文本内容

**示例**:
```json
{
  "type": "text_update",
  "text": "这十年过来"
}
```

## 测试建议

1. **验证时间信息提取**: 检查 ASR 日志，确认 `start_time` 和 `end_time` 被正确提取
2. **验证 WebSocket 消息**: 前端连接后，检查 `text_final` 消息是否包含时间字段
3. **验证时间合理性**: 
   - `end_time` 应该大于 `start_time`
   - 时间值应该是正数
   - 持续时间应该合理（通常几秒内）

## 已知限制

1. **仅限确定 utterance**: 只有 `text_final` 类型的消息包含时间信息
2. **依赖 ASR 服务**: 时间信息来自火山引擎 ASR 服务，如果服务不返回时间信息，字段值为 0
3. **相对时间**: 时间是相对于当前音频流开始的相对时间，不是绝对时间戳

## 相关文件

- `src/providers/asr/volcano.py` - ASR Provider 实现
- `src/services/voice_service.py` - Voice Service 实现
- `src/api/server.py` - API Server 实现
- `docs/STATES.md` - 状态管理文档
- `docs/ARCHITECTURE.md` - 架构文档

