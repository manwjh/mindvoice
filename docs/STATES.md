# 系统状态清单

本文档列出了语音桌面助手系统中所有层面的状态。

## 目录

1. [后端状态](#后端状态)
2. [前端状态](#前端状态)
3. [通信层状态](#通信层状态)
4. [数据层状态](#数据层状态)

---

## 后端状态

### 1. 录音状态（RecordingState）

**位置**：`src/core/base.py`

**枚举值**：
- `IDLE` - 空闲状态，未进行录音
- `RECORDING` - 录音中，正在捕获音频流
- `PAUSED` - 暂停状态，录音已暂停但未停止
- `STOPPING` - 正在停止，录音正在关闭过程中

**使用位置**：
- `AudioRecorder`（音频录制器）
- `VoiceService`（语音服务）

---

### 2. 语音服务（VoiceService）状态

**位置**：`src/services/voice_service.py`

**状态变量**：

#### 2.1 服务实例状态
- `recorder: Optional[AudioRecorder]` - 录音器实例（None表示未设置）
- `asr_provider: Optional[VolcanoASRProvider]` - ASR提供商实例（None表示未初始化）
- `storage_provider: Optional[SQLiteStorageProvider]` - 存储提供商实例（None表示未初始化）

#### 2.2 回调函数状态
- `_on_text_callback: Optional[Callable]` - 文本回调函数（None表示未设置）
- `_on_state_change_callback: Optional[Callable]` - 状态变化回调函数（None表示未设置）
- `_on_error_callback: Optional[Callable]` - 错误回调函数（None表示未设置）

#### 2.3 流式识别状态
- `_streaming_active: bool` - 流式识别是否激活（True/False）
- `_loop: Optional[asyncio.AbstractEventLoop]` - 异步事件循环（None表示未设置）

#### 2.4 会话和文本状态
- `_current_text: str` - 当前识别的文本内容（空字符串表示无文本）
- `_current_session_id: Optional[str]` - 当前会话ID（None表示无活动会话）

#### 2.5 录音状态（通过recorder获取）
- `get_state() -> RecordingState` - 返回当前录音状态（IDLE/RECORDING/PAUSED/STOPPING）

---

### 3. 音频录制器（SoundDeviceRecorder）状态

**位置**：`src/utils/audio_recorder.py`

**状态变量**：

#### 3.1 配置状态
- `rate: int` - 采样率（默认16000）
- `channels: int` - 声道数（默认1）
- `chunk: int` - 每次读取的帧数（默认1024）
- `device: Optional[int]` - 音频设备ID（None表示使用默认设备）

#### 3.2 录音状态
- `state: RecordingState` - 当前录音状态（IDLE/RECORDING/PAUSED/STOPPING）
- `stream: Optional[sd.InputStream]` - 音频输入流（None表示未启动）
- `running: bool` - 录音线程是否运行中（True/False）
- `paused: bool` - 是否暂停（True/False）

#### 3.3 音频数据状态
- `audio_buffer: bytearray` - 音频数据缓冲区
- `audio_queue: queue.Queue` - 音频数据队列
- `thread: Optional[threading.Thread]` - 音频消费线程（None表示未启动）

#### 3.4 回调状态
- `on_audio_chunk: Optional[Callable]` - 音频数据块回调函数（None表示未设置）

#### 3.5 统计信息状态
- `_chunk_count: int` - 已采集的音频块数量
- `_total_bytes: int` - 已采集的总字节数
- `_callback_errors: int` - 回调错误次数

---

### 4. ASR提供商（VolcanoASRProvider）状态

**位置**：`src/providers/asr/volcano.py`

**状态变量**：

#### 4.1 连接状态
- `_ws: Optional[aiohttp.ClientWebSocketResponse]` - WebSocket连接（None表示未连接）
- `_connected: bool` - 是否已连接到ASR服务（True/False）
- `_session_id: Optional[str]` - 会话ID（None表示无活动会话）

#### 4.2 识别状态
- `_streaming: bool` - 是否正在流式识别（True/False）
- `_sequence: int` - 消息序列号
- `_final_text: Optional[str]` - 最终识别结果（None表示未获取）

#### 4.3 回调状态
- `_on_text_callback: Optional[Callable]` - 文本回调函数（None表示未设置）

#### 4.4 配置状态
- `_config: Optional[Dict]` - ASR配置（None表示未初始化）
- `_language: str` - 识别语言（默认"zh-CN"）

---

### 5. 存储提供商（SQLiteStorageProvider）状态

**位置**：`src/providers/storage/sqlite.py`

**状态变量**：

#### 5.1 数据库连接状态
- `_db_path: str` - 数据库文件路径
- `_conn: Optional[sqlite3.Connection]` - 数据库连接（None表示未连接）

#### 5.2 初始化状态
- `_initialized: bool` - 是否已初始化（True/False）

---

### 6. API服务器（FastAPI）状态

**位置**：`src/api/server.py`

**状态变量**：

#### 6.1 服务实例状态
- `voice_service: Optional[VoiceService]` - 语音服务实例（None表示未初始化）
- `config: Optional[Config]` - 配置对象（None表示未初始化）
- `recorder: Optional[SoundDeviceRecorder]` - 录音器实例（None表示未初始化）

#### 6.2 WebSocket连接状态
- `active_connections: Set[WebSocket]` - 活跃的WebSocket连接集合（空集合表示无连接）

---

### 7. 配置管理（Config）状态

**位置**：`src/core/config.py`

**状态变量**：

#### 7.1 配置源状态
- `_config_source: str` - 当前ASR配置源（"user"表示用户配置，"vendor"表示厂商配置）

#### 7.2 配置数据状态
- `_config: Dict` - 配置数据字典
- `_user_asr_config: Optional[Dict]` - 用户自定义ASR配置（None表示未设置）

---

## 前端状态

### 8. App组件状态

**位置**：`electron-app/src/App.tsx`

**状态变量**：

#### 8.1 ASR状态
- `asrState: RecordingState` - ASR录音状态（'idle' | 'recording' | 'paused' | 'stopping'）

#### 8.2 文本状态
- `text: string` - 当前文本内容（空字符串表示无文本）

#### 8.3 连接状态
- `apiConnected: boolean` - API服务器连接状态（true/false）
- `error: string | null` - 错误信息（null表示无错误）

#### 8.4 视图状态
- `activeView: 'workspace' | 'history' | 'settings'` - 当前活动视图

#### 8.5 历史记录状态
- `records: Record[]` - 历史记录列表（空数组表示无记录）
- `loadingRecords: boolean` - 是否正在加载记录（true/false）
- `recordsTotal: number` - 记录总数（0表示无记录）
- `currentPage: number` - 当前页码（从1开始）

#### 8.6 UI状态
- `toast: { message: string; type: 'success' | 'error' | 'info' } | null` - Toast提示消息（null表示无提示）

#### 8.7 WebSocket状态
- `wsRef: React.RefObject<WebSocket | null>` - WebSocket连接引用（null表示未连接）
- `reconnectTimeoutRef: React.RefObject<NodeJS.Timeout | null>` - 重连定时器引用（null表示无定时器）

#### 8.8 组件引用状态
- `blockEditorRef: React.RefObject<BlockEditorHandle>` - BlockEditor组件引用

---

### 9. BlockEditor组件状态

**位置**：`electron-app/src/components/BlockEditor.tsx`

**状态变量**：

#### 9.1 Block列表状态
- `blocks: Block[]` - Block列表（空数组表示无内容）

#### 9.2 ASR写入状态
- `asrWritingBlockIdRef: React.RefObject<string | null>` - 当前ASR写入的Block ID（null表示无活动写入）

#### 9.3 暂停状态
- `prevIsPausedRef: React.RefObject<boolean>` - 上一次是否暂停（用于检测恢复）

#### 9.4 ASR激活状态
- `isAsrActive: boolean` - ASR是否激活（isRecording || isPaused）

#### 9.5 Block类型
- `BlockType: 'paragraph' | 'h1' | 'h2' | 'h3' | 'bulleted-list' | 'numbered-list' | 'code'`

#### 9.6 Block属性
- `Block.isAsrWriting: boolean` - Block是否正在ASR写入（true/false）

---

### 10. Workspace组件状态

**位置**：`electron-app/src/components/Workspace.tsx`

**状态变量**：

#### 10.1 工具栏状态
- `showToolbar: boolean` - 是否显示格式化工具栏（true/false）
- `toolbarPosition: { top: number; left: number }` - 工具栏位置坐标

#### 10.2 组件引用状态
- `workspaceContentRef: React.RefObject<HTMLDivElement>` - 工作区内容引用

---

### 11. HistoryView组件状态

**位置**：`electron-app/src/components/HistoryView.tsx`

**状态变量**：

#### 11.1 选择状态
- `selectedIds: Set<string>` - 选中的记录ID集合（空集合表示无选中）

#### 11.2 计算状态
- `isAllSelected: boolean` - 是否全选（true/false）
- `hasSelected: boolean` - 是否有选中项（true/false）
- `totalPages: number` - 总页数（从1开始）

---

### 12. SettingsView组件状态

**位置**：`electron-app/src/components/SettingsView.tsx`

**状态变量**：

#### 12.1 音频设备状态
- `devices: AudioDevice[]` - 音频设备列表（空数组表示无设备）
- `currentDevice: number | null` - 当前选中的设备ID（null表示使用默认设备）
- `loading: boolean` - 是否正在加载设备列表（true/false）
- `saving: boolean` - 是否正在保存设备设置（true/false）

#### 12.2 ASR配置状态
- `asrConfigSource: 'user' | 'vendor'` - ASR配置源（'user'表示用户配置，'vendor'表示厂商配置）
- `currentAsrConfig: ASRConfig | null` - 当前ASR配置（null表示未加载）
- `vendorAsrConfig: ASRConfig | null` - 厂商ASR配置（null表示未加载）
- `userAsrConfig: ASRConfig` - 用户ASR配置对象
- `asrLoading: boolean` - 是否正在加载ASR配置（true/false）
- `asrSaving: boolean` - 是否正在保存ASR配置（true/false）

#### 12.3 消息状态
- `message: { text: string; type: 'success' | 'error' } | null` - 操作消息（null表示无消息）

---

### 13. Electron主进程状态

**位置**：`electron-app/electron/main.ts`

**状态变量**：

#### 13.1 窗口状态
- `mainWindow: BrowserWindow | null` - 主窗口实例（null表示未创建）
- `isQuitting: boolean` - 是否正在退出应用（true/false）

#### 13.2 系统托盘状态
- `tray: Tray | null` - 系统托盘实例（null表示未创建）

#### 13.3 Python进程状态
- `pythonProcess: ChildProcess | null` - Python API服务器进程（null表示未启动）

---

## 通信层状态

### 14. WebSocket连接状态

**后端**：`src/api/server.py`
- `active_connections: Set[WebSocket]` - 活跃连接集合

**前端**：`electron-app/src/App.tsx`
- `wsRef.current?.readyState` - WebSocket就绪状态
  - `WebSocket.CONNECTING` (0) - 连接中
  - `WebSocket.OPEN` (1) - 已连接
  - `WebSocket.CLOSING` (2) - 正在关闭
  - `WebSocket.CLOSED` (3) - 已关闭

---

### 15. HTTP API状态

**后端**：`src/api/server.py`
- API服务器运行状态（通过FastAPI应用生命周期管理）

**前端**：`electron-app/src/App.tsx`
- `apiConnected: boolean` - API连接状态（通过定期检查`/api/status`端点）

---

## 数据层状态

### 16. 数据库状态

**位置**：`src/providers/storage/sqlite.py`

**状态变量**：

#### 16.1 连接状态
- `_conn: Optional[sqlite3.Connection]` - 数据库连接（None表示未连接）

#### 16.2 初始化状态
- `_initialized: bool` - 是否已初始化（True/False）

#### 16.3 数据库文件状态
- `_db_path: str` - 数据库文件路径

---

### 17. 配置文件状态

**位置**：`src/core/config.py`

**配置文件位置**：
- 项目配置：`config.yml`（项目根目录）
- 用户ASR配置：`~/.voice_assistant/user_asr_config.yml`
- 数据库：`~/.voice_assistant/history.db`

**配置源状态**：
- `_config_source: str` - 当前配置源（"user"或"vendor"）

---

## 状态流转图

### 录音状态流转

```
IDLE ──[start_recording()]──> RECORDING
  ↑                              │
  │                              │
  │                              ▼
  └──[stop_recording()]──< STOPPING
  │                              │
  │                              │
  └──────────────────────────────┘
  
RECORDING ──[pause_recording()]──> PAUSED
    ↑                              │
    │                              │
    └──[resume_recording()]────────┘
```

### ASR流式识别状态流转

```
未初始化 ──[initialize()]──> 已初始化
    │                            │
    │                            │
    └──[start_streaming_recognition()]──> 流式识别中
                                        │
                                        │
                                        └──[stop_streaming_recognition()]──> 已停止
```

### WebSocket连接状态流转

```
未连接 ──[connect()]──> CONNECTING ──> OPEN
  ↑                                        │
  │                                        │
  └──[disconnect()]──< CLOSING <───────────┘
                          │
                          │
                          └──> CLOSED
```

---

## 状态同步机制

### 后端到前端的状态同步

1. **WebSocket实时推送**：
   - `state_change` - 状态变化通知
   - `text_update` - 文本更新通知
   - `initial_state` - 初始状态同步
   - `error` - 错误通知

2. **HTTP REST API轮询**：
   - `GET /api/status` - 获取当前状态（前端定期检查）

### 前端内部状态同步

1. **React状态管理**：
   - 使用`useState`管理组件内部状态
   - 使用`useEffect`同步外部状态变化

2. **组件间通信**：
   - Props传递状态
   - Ref引用调用方法
   - 回调函数通知状态变化

---

## 状态持久化

### 持久化的状态

1. **配置状态**：
   - ASR配置（用户配置或厂商配置）
   - 音频设备设置
   - 保存到配置文件或数据库

2. **历史记录**：
   - 识别文本记录
   - 元数据（时间戳、语言等）
   - 保存到SQLite数据库

### 不持久化的状态

1. **运行时状态**：
   - 录音状态
   - WebSocket连接状态
   - 当前文本内容（除非用户保存）

2. **UI状态**：
   - 视图切换
   - 选中状态
   - Toast提示

---

**文档版本**：1.0.0  
**最后更新**：2024年

