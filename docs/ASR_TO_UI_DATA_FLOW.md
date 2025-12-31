# ASR Client 到 UI 前端显示完整数据流

本文档详细描述从 ASR 客户端接收音频到 UI 前端显示识别结果的完整数据传递链路。

---

## 数据流概览

```
音频输入 → ASR Client → Voice Service → WebSocket → Frontend → BlockEditor → UI显示
   ↓           ↓              ↓              ↓           ↓            ↓
 麦克风    火山引擎ASR    后端服务层    实时通信    React组件   编辑器组件
```

---

## 第一层：音频采集与录音 (Audio Recorder)

### 文件位置
- `src/utils/audio_recorder.py` - `SoundDeviceRecorder` 类

### 核心流程

#### 1. 录音器初始化
```python
# src/api/server.py: 216-239
recorder = SoundDeviceRecorder(
    rate=16000,      # 采样率
    channels=1,      # 单声道
    chunk=1024,      # 音频块大小
    device=audio_device  # 音频设备ID
)
```

#### 2. 开始录音
```python
# src/services/voice_service.py: 139-213
def start_recording(self) -> bool:
    # 1. 启动 ASR 流式识别
    await self.asr_provider.start_streaming_recognition(language)
    
    # 2. 设置音频块回调
    self.recorder.set_on_audio_chunk_callback(self._on_audio_chunk)
    
    # 3. 开始录音
    self.recorder.start_recording()
```

#### 3. 音频数据流
```python
# src/services/voice_service.py: 215-237
def _on_audio_chunk(self, audio_data: bytes):
    """录音器每次采集到音频数据块时调用"""
    # 如果暂停，不发送数据
    if self.recorder.get_state() == RecordingState.PAUSED:
        return
    
    # 异步发送音频数据到 ASR
    asyncio.run_coroutine_threadsafe(
        self.asr_provider.send_audio_chunk(audio_data),
        self._loop
    )
```

**关键细节**：
- 采样率：16000 Hz（火山引擎要求）
- 音频格式：PCM raw 格式
- 数据块大小：1024 字节
- 传输方式：异步流式传输

---

## 第二层：ASR 识别 (Volcano ASR Provider)

### 文件位置
- `src/providers/asr/volcano.py` - `VolcanoASRProvider` 类

### 核心流程

#### 1. 建立 WebSocket 连接
```python
# volcano.py: 302-375
async def _connect(self) -> bool:
    # 1. 构造认证头
    headers = RequestBuilder.new_auth_headers(self.access_key, self.app_key)
    
    # 2. 连接火山引擎 ASR WebSocket 服务
    self.conn = await self.session.ws_connect(self.base_url, headers=headers)
    
    return True
```

**WebSocket URL**：`wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`

#### 2. 发送完整请求（初始化）
```python
# volcano.py: 407-415, 92-125
async def _send_full_request(self):
    """发送完整客户端请求（包含配置信息）"""
    payload = {
        "user": {"uid": "demo_uid"},
        "audio": {
            "format": "pcm",
            "codec": "raw",
            "rate": 16000,
            "bits": 16,
            "channel": 1
        },
        "request": {
            "model_name": "bigmodel",
            "enable_itn": True,           # 启用文本规范化
            "enable_punc": True,          # 启用标点符号
            "enable_ddc": True,           # 启用数字转换
            "show_utterances": True,      # ⭐ 显示 utterance 信息（关键！）
            "result_type": "single",
            "vad_segment_duration": 600,
            "enable_nonstream": False
        }
    }
```

**关键配置**：
- `show_utterances: True` - 必须启用，才能获取 `definite` 字段
- `enable_punc: True` - 启用标点符号
- `enable_itn: True` - 文本规范化（如"一百二十三" → "123"）

#### 3. 流式发送音频数据
```python
# volcano.py: 417-434
async def _send_audio_data(self, audio_data: bytes, is_last: bool = False):
    """发送音频数据包"""
    # 构造音频数据包（使用 GZIP 压缩）
    request = RequestBuilder.new_audio_only_request(self.seq, audio_data, is_last)
    
    # 发送到火山引擎
    await self.conn.send_bytes(request)
    
    # 递增序列号（除非是最后一包）
    if not is_last:
        self.seq += 1
```

**数据包格式**：
```
[协议头(4字节)][序列号(4字节)][payload大小(4字节)][GZIP压缩的音频数据]
```

#### 4. 接收 ASR 识别结果
```python
# volcano.py: 822-878
async def _receive_streaming_results(self):
    """接收流式识别结果"""
    async for msg in self.conn:
        if msg.type == aiohttp.WSMsgType.BINARY:
            # 解析响应
            response = ResponseParser.parse_response(msg.data)
            
            if response.payload_msg:
                result = response.payload_msg.get('result', {})
                # 处理识别结果
                self._handle_recognition_result(result, response.is_last_package)
```

#### 5. 处理识别结果与智能累加
```python
# volcano.py: 725-786
def _handle_recognition_result(self, result: dict, is_last_package: bool):
    """处理识别结果"""
    text = result.get('text', '')
    
    # ⭐ 检测是否为确定的 utterance（基于 ASR 服务的 definite 字段）
    is_definite_utterance, time_info = self._detect_definite_utterance(result, text)
    
    # 🎯 中间层：基于时间间隔判断并累加文本
    if is_definite_utterance and time_info:
        current_start = time_info.get('start_time', 0)
        current_end = time_info.get('end_time', 0)
        last_end = self._last_utterance_end_time
        
        # 计算时间间隔
        time_gap = current_start - last_end
        
        # 判断是否应该累加（默认阈值 800ms）
        if self._enable_utterance_merge:
            should_accumulate = (last_end > 0) and (time_gap < self._merge_threshold_ms)
            
            if should_accumulate:
                # 累加模式：追加到已有文本
                self._accumulated_text += text
                text_to_send = self._accumulated_text
            else:
                # 新句子：重置累积文本
                self._accumulated_text = text
                text_to_send = text
        
        # 更新最后的结束时间
        self._last_utterance_end_time = current_end
    
    # 调用回调函数，传递累加后的文本
    if self._on_text_callback:
        self._on_text_callback(text_to_send, is_definite_utterance, time_info)
```

**Utterance 检测逻辑**：
```python
# volcano.py: 689-723
def _detect_definite_utterance(self, result: dict, text: str) -> tuple[bool, dict]:
    """检测是否为确定的 utterance 并提取时间信息
    
    使用 utterances 中的 definite 字段来判断 utterance 是否确定。
    需要 show_utterances=True 才能获取 utterances 数据。
    """
    utterances = result.get('utterances', [])
    
    if not utterances:
        return False, {}
    
    # 检查是否有 definite=True 的 utterance
    for utterance in utterances:
        if isinstance(utterance, dict):
            is_definite = utterance.get('definite', False)
            if is_definite:
                # 提取时间信息
                start_time = utterance.get('start_time', 0)  # 毫秒
                end_time = utterance.get('end_time', 0)      # 毫秒
                return True, {
                    'start_time': start_time,
                    'end_time': end_time
                }
    
    return False, {}
```

**ASR 响应数据结构示例**：
```json
{
  "result": {
    "text": "今天天气真好",
    "utterances": [
      {
        "text": "今天天气真好",
        "definite": true,          // ⭐ 关键字段：是否为确定的 utterance
        "start_time": 1000,        // 开始时间（毫秒）
        "end_time": 2500,          // 结束时间（毫秒）
        "confidence": 0.95
      }
    ]
  }
}
```

**关键细节**：
- **中间结果**（`definite=false`）：实时更新，会被后续结果覆盖
- **确定结果**（`definite=true`）：一个完整的语音识别单元，包含时间信息
- **智能累加**：间隔 < 800ms 的 utterance 会被自动累加成一个句子
- **时间信息**：仅在 `definite=true` 时提供，用于显示时间线

---

## 第三层：语音服务 (Voice Service)

### 文件位置
- `src/services/voice_service.py` - `VoiceService` 类

### 核心流程

#### 1. 设置 ASR 回调
```python
# voice_service.py: 116-129
def set_on_text_callback(self, callback: Callable[[str, bool, dict], None]):
    """设置文本回调函数
    
    Args:
        callback: 回调函数 (text: str, is_definite_utterance: bool, time_info: dict)
                  text: 识别的文本（已在后端累加处理）
                  is_definite_utterance: 是否为确定的utterance
                  time_info: 时间信息字典，包含 start_time, end_time（毫秒）
    """
    self._on_text_callback = callback
```

#### 2. 接收 ASR 文本回调
```python
# voice_service.py: 239-261
def _on_asr_text_received(self, text: str, is_definite_utterance: bool, time_info: dict):
    """ASR 文本接收回调"""
    # 只在确定的 utterance 时输出日志
    if is_definite_utterance:
        logger.info(f"[语音服务] 收到确定utterance: '{text}', "
                   f"start_time={time_info.get('start_time', 0)}ms, "
                   f"end_time={time_info.get('end_time', 0)}ms")
    
    self._current_text = text
    
    # 调用回调函数，传递给上层（API Server）
    if self._on_text_callback:
        self._on_text_callback(text, is_definite_utterance, time_info)
```

**数据流转**：
```
ASR Provider → Voice Service → API Server → WebSocket → Frontend
```

---

## 第四层：API 服务器 (FastAPI Server)

### 文件位置
- `src/api/server.py` - FastAPI 应用

### 核心流程

#### 1. 初始化语音服务并设置回调
```python
# server.py: 216-271
def setup_voice_service():
    """初始化语音服务"""
    # 创建语音服务
    voice_service = VoiceService(config)
    
    # 设置文本回调 - 直接通过 WebSocket 广播
    def on_text_callback(text: str, is_definite: bool, time_info: dict):
        message = {
            "type": "text_final" if is_definite else "text_update",
            "text": text
        }
        # 仅在确定的 utterance 时添加时间信息
        if is_definite and time_info:
            message["start_time"] = time_info.get('start_time', 0)
            message["end_time"] = time_info.get('end_time', 0)
        
        # 广播到所有 WebSocket 连接
        broadcast(message)
    
    voice_service.set_on_text_callback(on_text_callback)
```

**消息类型定义**：
- `text_update` - 中间识别结果（实时更新，无时间信息）
- `text_final` - 确定的完整 utterance（包含时间信息）

#### 2. WebSocket 广播函数
```python
# server.py: 166-211
async def broadcast_safe(message: dict):
    """安全的广播，保证消息顺序和可靠性"""
    if not active_connections:
        return
    
    disconnected = set()
    tasks = []
    
    # 为每个连接创建发送任务
    for connection in list(active_connections):
        task = connection.send_json(message)
        tasks.append((connection, task))
    
    # 等待所有发送完成
    results = await asyncio.gather(*[t for _, t in tasks], return_exceptions=True)
    
    # 处理发送结果
    for (conn, _), result in zip(tasks, results):
        if isinstance(result, Exception):
            disconnected.add(conn)
    
    # 移除失败的连接
    if disconnected:
        active_connections.difference_update(disconnected)

def broadcast(message: dict):
    """向所有 WebSocket 连接广播消息（同步接口）"""
    try:
        loop = asyncio.get_running_loop()
        asyncio.create_task(broadcast_safe(message))
    except RuntimeError:
        logger.warning("无法广播消息：没有运行的事件循环")
```

**关键细节**：
- 使用 `asyncio.gather` 并行发送，提高性能
- 错误处理：自动移除断开的连接
- 线程安全：使用 `asyncio.create_task`

#### 3. WebSocket 端点
```python
# server.py: 955-1010
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 端点 - 用于实时文本和状态更新
    
    消息类型：
    1. initial_state - 初始状态
       { "type": "initial_state", "state": "idle|recording|stopping", "text"?: "..." }
    
    2. text_update - 中间识别结果（实时更新）
       { "type": "text_update", "text": "..." }
    
    3. text_final - 确定的完整 utterance（包含时间信息）
       { "type": "text_final", "text": "...", "start_time": 1234, "end_time": 5678 }
    
    4. state_change - 状态变更
       { "type": "state_change", "state": "idle|recording|stopping" }
    
    5. error - 错误消息
       { "type": "error", "error_type": "...", "message": "..." }
    """
    await websocket.accept()
    active_connections.add(websocket)
    
    try:
        # 发送初始状态
        if voice_service:
            state = voice_service.get_state()
            current_text = getattr(voice_service, '_current_text', '')
            initial_state_msg = {
                "type": "initial_state",
                "state": state.value
            }
            if current_text:
                initial_state_msg["text"] = current_text
            await websocket.send_json(initial_state_msg)
        
        # 保持连接
        while True:
            data = await websocket.receive_json()
    except WebSocketDisconnect:
        pass
    finally:
        active_connections.discard(websocket)
```

**WebSocket 消息格式**：
```json
// 中间结果
{
  "type": "text_update",
  "text": "今天天气"
}

// 确定结果（包含时间信息）
{
  "type": "text_final",
  "text": "今天天气真好",
  "start_time": 1000,  // 毫秒
  "end_time": 2500     // 毫秒
}
```

---

## 第五层：前端 React 应用

### 文件位置
- `electron-app/src/App.tsx` - 主应用
- `electron-app/src/components/apps/VoiceNote/VoiceNote.tsx` - 语音笔记组件
- `electron-app/src/components/apps/VoiceNote/BlockEditor.tsx` - 块编辑器组件

### 核心流程

#### 1. 建立 WebSocket 连接
```typescript
// App.tsx: 237-329
const connectWebSocket = () => {
  const ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setError(null);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'initial_state':
        setAsrState(data.state);
        if (data.text) setText(data.text);
        break;
        
      case 'text_update':
        // 中间结果（实时更新）
        blockEditorRef.current?.appendAsrText(
          data.text || '',
          false  // is_definite_utterance = false
        );
        break;
        
      case 'text_final':
        // 确定的结果（完整 utterance）- 包含时间信息
        blockEditorRef.current?.appendAsrText(
          data.text || '',
          true,  // is_definite_utterance = true
          {
            startTime: data.start_time,
            endTime: data.end_time
          }
        );
        break;
        
      case 'state_change':
        setAsrState(data.state);
        break;
        
      case 'error':
        setError(`${data.error_type || '错误'}: ${data.message || '未知错误'}`);
        break;
    }
  };

  ws.onclose = () => {
    // 3秒后自动重连
    setTimeout(() => connectWebSocket(), 3000);
  };

  wsRef.current = ws;
};
```

**WebSocket URL**：`ws://127.0.0.1:8765/ws`

**连接管理**：
- 自动重连：连接断开后 3 秒自动重连
- 心跳检测：定期检查 API 连接状态（5秒间隔）

#### 2. BlockEditor 接收文本
```typescript
// BlockEditor.tsx: 176-227
const appendAsrText = useCallback(
  (newText: string, isDefiniteUtterance: boolean = false, timeInfo?: { startTime?: number; endTime?: number }) => {
    if (!isAsrActive) return;

    setBlocks((prev) => {
      const updated = [...prev];
      
      // 查找当前激活的 Block
      let currentIdx = asrWritingBlockIdRef.current
        ? updated.findIndex((b) => b.id === asrWritingBlockIdRef.current)
        : -1;
      
      // 如果找不到，确保有一个 ASR 写入 block
      if (currentIdx < 0) {
        const { blocks: newBlocks, blockId, index } = ensureAsrWritingBlock(updated);
        updated.splice(0, updated.length, ...newBlocks);
        asrWritingBlockIdRef.current = blockId;
        currentIdx = index;
      }

      // 简化的逻辑：直接显示 ASR 返回的文本，不做去重处理
      if (isDefiniteUtterance) {
        // 确定的 utterance：固化到当前 block，并创建新的空 block
        updated[currentIdx] = {
          ...updated[currentIdx],
          content: newText,
          isAsrWriting: false,  // 取消 ASR 写入标记
          startTime: timeInfo?.startTime,  // 保存时间信息
          endTime: timeInfo?.endTime,
        };
        
        // 创建新的空 block 用于下一个输入
        const nextBlock = createEmptyBlock(true);
        updated.push(nextBlock);
        asrWritingBlockIdRef.current = nextBlock.id;
      } else {
        // 中间结果：继续更新当前 block
        updated[currentIdx] = {
          ...updated[currentIdx],
          content: newText,
        };
      }
      
      // 触发回调
      const content = blocksToContent(updated);
      onContentChange?.(content, isDefiniteUtterance);
      
      return updated;
    });
  },
  [isAsrActive, ensureAsrWritingBlock, onContentChange]
);
```

**Block 数据结构**：
```typescript
interface Block {
  id: string;
  type: BlockType;
  content: string;
  isAsrWriting?: boolean;  // 是否正在被 ASR 写入
  // ASR 时间信息（仅对 ASR 识别的文本）
  startTime?: number;  // 开始时间（毫秒）
  endTime?: number;    // 结束时间（毫秒）
}
```

#### 3. UI 渲染
```typescript
// BlockEditor.tsx: 353-451
const renderBlock = (block: Block) => {
  const Tag = getTagName(block.type) as 'p' | 'h1' | 'h2' | 'h3' | 'pre';
  const canEdit = !block.isAsrWriting;  // ASR 正在写入的 block 不能编辑
  const hasTimeInfo = block.startTime !== undefined && block.endTime !== undefined;

  return (
    <div key={block.id} className={`block ${block.isAsrWriting ? 'block-asr-writing-container' : ''}`}>
      <div className="block-handle">
        <span className="handle-icon">⋮⋮</span>
      </div>
      <div className="block-content-wrapper">
        <Tag
          className={getClassName(block)}
          contentEditable={canEdit}
          suppressContentEditableWarning
          onInput={(e) => {
            if (canEdit) {
              handleBlockChange(block.id, e.currentTarget.textContent || '');
            }
          }}
          data-placeholder={block.isAsrWriting ? '>' : getPlaceholder(block.type)}
          style={block.isAsrWriting ? { cursor: 'not-allowed', opacity: 0.7 } : undefined}
        >
          {block.content}
        </Tag>
        {/* 时间线指示器（仅在有时间信息时显示） */}
        {hasTimeInfo && (
          <TimelineIndicator startTime={block.startTime} endTime={block.endTime} />
        )}
      </div>
    </div>
  );
};
```

**视觉效果**：
- **中间结果**：光标闪烁的 block，内容实时更新
- **确定结果**：普通 block，包含时间线指示器
- **可编辑性**：ASR 正在写入的 block 不可编辑

---

## 完整数据流时序图

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌─────────────┐     ┌──────────────┐
│  麦克风输入  │────▶│ Audio Recorder│────▶│ ASR Provider  │────▶│Voice Service│────▶│ API Server   │
│ (16kHz PCM) │     │  (录音器)     │     │ (火山引擎)    │     │  (业务层)   │     │  (FastAPI)   │
└─────────────┘     └──────────────┘     └───────────────┘     └─────────────┘     └──────────────┘
                           │                     │                     │                     │
                           │ 音频数据块           │ ASR识别请求          │ 文本回调            │ WebSocket广播
                           │ (1024字节)          │ (流式)              │ (含时间信息)        │ (JSON消息)
                           ▼                     ▼                     ▼                     ▼
                    ┌──────────────┐     ┌───────────────┐     ┌─────────────┐     ┌──────────────┐
                    │_on_audio_chunk│────▶│send_audio_chunk│────▶│_on_asr_text_│────▶│  broadcast   │
                    │   (回调)      │     │  (WebSocket)   │     │  received   │     │   (异步)     │
                    └──────────────┘     └───────────────┘     └─────────────┘     └──────────────┘
                                                                                            │
                                                                                            │ WebSocket
                                                                                            │ (实时推送)
                                                                                            ▼
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌─────────────────────────────────────┐
│  UI 显示    │◀────│ BlockEditor   │◀────│ VoiceNote     │◀────│     WebSocket Client (App.tsx)      │
│ (用户界面)  │     │ (编辑器组件)  │     │ (应用组件)    │     │ ws.onmessage → blockEditorRef       │
└─────────────┘     └──────────────┘     └───────────────┘     └─────────────────────────────────────┘
```

---

## 关键时间节点

### 1. 音频采集延迟
- **延迟**：~64ms (1024字节 / 16000Hz = 0.064秒)
- **影响**：录音器每 64ms 产生一个音频块

### 2. 网络传输延迟
- **WebSocket 往返延迟**：通常 < 50ms（本地网络）
- **影响**：音频数据到达 ASR 服务器的时间

### 3. ASR 识别延迟
- **中间结果**：通常 < 200ms
- **确定结果**：通常 500ms - 1000ms（取决于 VAD 检测）
- **影响**：用户看到文本的延迟

### 4. UI 渲染延迟
- **React 重渲染**：通常 < 16ms (60fps)
- **影响**：文本显示到屏幕的延迟

### 总延迟估算
```
音频采集 (64ms) + 网络传输 (50ms) + ASR识别 (200-1000ms) + UI渲染 (16ms)
= 330ms - 1130ms（从说话到看到文本）
```

---

## 消息类型与数据格式

### 1. text_update（中间结果）
```json
{
  "type": "text_update",
  "text": "今天天气"
}
```
- **触发条件**：ASR 返回中间识别结果（`definite=false`）
- **特征**：实时更新，会被后续结果覆盖
- **时间信息**：无
- **前端处理**：更新当前激活的 block，不固化

### 2. text_final（确定结果）
```json
{
  "type": "text_final",
  "text": "今天天气真好",
  "start_time": 1000,
  "end_time": 2500
}
```
- **触发条件**：ASR 返回确定的 utterance（`definite=true`）
- **特征**：固化的完整句子，已包含后端累加处理
- **时间信息**：包含 start_time 和 end_time（毫秒）
- **前端处理**：固化当前 block，创建新 block 用于下一个输入

### 3. state_change（状态变更）
```json
{
  "type": "state_change",
  "state": "recording"
}
```
- **状态值**：`idle` | `recording` | `paused` | `stopping`
- **触发条件**：录音状态改变时
- **前端处理**：更新 UI 状态，显示对应的控制按钮

### 4. error（错误消息）
```json
{
  "type": "error",
  "error_type": "ASR启动失败",
  "message": "无法连接到ASR服务"
}
```
- **触发条件**：任何错误发生时
- **前端处理**：显示错误横幅或 Toast 提示

---

## 智能断句修正机制

### 问题背景
ASR 服务有时会将一个完整的句子错误地拆分成多个 utterance，例如：
```
原句："今天天气真好"
ASR 错误拆分：
  - utterance 1: "今天天气" (0-800ms)
  - utterance 2: "真好" (850-1200ms)
```

### 解决方案：基于时间间隔的累加修正

#### 后端实现
```python
# volcano.py: 744-776
if is_definite_utterance and time_info:
    current_start = time_info.get('start_time', 0)
    current_end = time_info.get('end_time', 0)
    last_end = self._last_utterance_end_time
    
    # 计算时间间隔
    time_gap = current_start - last_end
    
    # 判断是否应该累加（默认阈值 800ms）
    if self._enable_utterance_merge:
        should_accumulate = (last_end > 0) and (time_gap < self._merge_threshold_ms)
        
        if should_accumulate:
            # 累加模式：追加到已有文本
            self._accumulated_text += text
            text_to_send = self._accumulated_text
        else:
            # 新句子：重置累积文本
            self._accumulated_text = text
            text_to_send = text
    
    # 更新最后的结束时间
    self._last_utterance_end_time = current_end
```

#### 配置参数
```yaml
# config.yml
asr:
  enable_utterance_merge: true  # 启用智能累加
  merge_threshold_ms: 800       # 累加时间阈值（毫秒）
```

#### 累加逻辑
```
utterance 1: "今天天气" (end_time=800ms)
utterance 2: "真好" (start_time=850ms)

time_gap = 850 - 800 = 50ms < 800ms
→ 累加：self._accumulated_text = "今天天气" + "真好" = "今天天气真好"
→ 发送给前端："今天天气真好"
```

#### 新句子检测
```
utterance 1: "今天天气真好" (end_time=2500ms)
utterance 2: "明天呢" (start_time=5000ms)

time_gap = 5000 - 2500 = 2500ms > 800ms
→ 新句子：self._accumulated_text = "明天呢"
→ 发送给前端："明天呢"
```

### 前端处理
```typescript
// BlockEditor.tsx: 197-210
if (isDefiniteUtterance) {
  // 确定的 utterance：固化到当前 block
  updated[currentIdx] = {
    ...updated[currentIdx],
    content: newText,  // 已包含后端累加的完整文本
    isAsrWriting: false,
    startTime: timeInfo?.startTime,
    endTime: timeInfo?.endTime,
  };
  
  // 创建新的空 block 用于下一个输入
  const nextBlock = createEmptyBlock(true);
  updated.push(nextBlock);
}
```

**前端不需要去重处理**：后端已经处理了 utterance 累加，前端直接显示即可。

---

## 错误处理与容错机制

### 1. WebSocket 连接断开
```typescript
// App.tsx: 315-328
ws.onclose = () => {
  wsRef.current = null;
  if (apiConnected && !reconnectTimeoutRef.current) {
    // 3秒后自动重连
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connectWebSocket();
    }, 3000);
  }
};
```

### 2. ASR 服务错误
```python
# volcano.py: 836-854
if response.code != 0:
    # 45000081 错误码处理（连接超时）
    if response.code == 45000081:
        if self._stopping:
            logger.info("连接关闭，用户主动停止，正常结束")
        else:
            logger.warning("连接超时，可能是暂停录音导致，继续等待...")
        # 设置事件以允许正常结束流程
        if self._recognition_event:
            self._recognition_event.set()
    else:
        self._handle_error_response(response.code)
```

### 3. 网络传输失败
```python
# server.py: 186-197
# 等待所有发送完成
results = await asyncio.gather(*[t for _, t in tasks], return_exceptions=True)

# 处理发送结果
for (conn, _), result in zip(tasks, results):
    if isinstance(result, Exception):
        logger.error(f"[API] 广播失败: {result}")
        disconnected.add(conn)

# 移除失败的连接
if disconnected:
    active_connections.difference_update(disconnected)
```

---

## 性能优化要点

### 1. 音频数据压缩
```python
# volcano.py: 145
compressed_segment = gzip.compress(segment)
```
- 使用 GZIP 压缩，减少网络传输量
- 压缩比：通常 30%-50%

### 2. 异步并行发送
```python
# server.py: 186
results = await asyncio.gather(*[t for _, t in tasks], return_exceptions=True)
```
- 使用 `asyncio.gather` 并行发送到所有 WebSocket 连接
- 避免串行发送导致的延迟累积

### 3. 前端状态批量更新
```typescript
// BlockEditor.tsx: 180
setBlocks((prev) => {
  const updated = [...prev];
  // ... 批量更新所有 blocks
  return updated;
});
```
- 使用函数式 setState，减少重渲染次数
- 批量更新，避免多次 DOM 操作

### 4. 连接复用
```python
# volcano.py: 325-327
if self.session and not self.session.closed:
    await self.session.close()
self.session = aiohttp.ClientSession(timeout=timeout)
```
- 复用 aiohttp ClientSession，减少连接开销

---

## 调试与监控

### 1. 日志级别
```python
# api_server.py: 34
parser.add_argument("--log-level", default="INFO", 
                   choices=["DEBUG", "INFO", "WARNING", "ERROR"])
```

### 2. 关键日志点
```python
# volcano.py
logger.info(f"[ASR] 收到确定utterance: '{text}', start_time={start_time}ms, end_time={end_time}ms")
logger.info(f"[ASR] 累加utterance: '{text}' (间隔={time_gap}ms), 累积文本: '{self._accumulated_text}'")
logger.info(f"[ASR] 新utterance: '{text}' (间隔={time_gap}ms)")
```

### 3. WebSocket 连接监控
```python
# server.py: 979, 1010
logger.info(f"[API] WebSocket连接已建立，当前连接数: {len(active_connections)}")
logger.info(f"[API] WebSocket连接已断开，当前连接数: {len(active_connections)}")
```

### 4. 前端控制台
```typescript
// App.tsx: 301
console.warn('未知的WebSocket消息类型:', data.type);
```

---

## 常见问题排查

### 1. 文本显示延迟过高
**可能原因**：
- 网络延迟过高
- ASR 服务响应慢
- 前端渲染性能问题

**排查步骤**：
1. 检查网络延迟：`ping 127.0.0.1`
2. 查看 ASR 日志：检查识别耗时
3. 查看浏览器性能：Chrome DevTools Performance

### 2. 文本重复或缺失
**可能原因**：
- WebSocket 消息丢失
- 前端状态同步问题
- 后端累加逻辑错误

**排查步骤**：
1. 查看 WebSocket 消息：Chrome DevTools Network → WS
2. 查看 ASR 日志：检查 utterance 累加逻辑
3. 查看前端日志：检查 block 更新逻辑

### 3. ASR 连接失败
**可能原因**：
- 认证信息错误
- 网络连接问题
- 火山引擎服务异常

**排查步骤**：
1. 检查配置：`config.yml` 中的 `access_key` 和 `app_key`
2. 查看错误日志：ASR 连接日志
3. 测试网络：`curl -I https://openspeech.bytedance.com`

---

## 总结

整个数据流的核心特点：

1. **流式处理**：从音频采集到 UI 显示，全程流式处理，实时性强
2. **异步架构**：使用 asyncio 和 WebSocket，支持高并发
3. **智能累加**：后端基于时间间隔的 utterance 累加，解决 ASR 错误拆分问题
4. **容错机制**：多层错误处理，自动重连，保证系统稳定性
5. **性能优化**：数据压缩、并行发送、批量更新，保证低延迟

**数据流传递链路**：
```
麦克风 → 录音器 → ASR Provider → Voice Service → API Server → WebSocket → Frontend → BlockEditor → UI
```

每一层都有明确的职责和接口定义，保证了系统的模块化和可维护性。

