# MindVoice 系统架构说明文档

> 版本：1.8.1  
> 更新日期：2026-01-05  
> 基于实际代码分析生成

---

## 目录

1. [系统概述](#系统概述)
2. [技术栈](#技术栈)
3. [整体架构](#整体架构)
4. [前端架构](#前端架构)
5. [后端架构](#后端架构)
6. [核心模块详解](#核心模块详解)
7. [数据流设计](#数据流设计)
8. [存储架构](#存储架构)
9. [通信机制](#通信机制)
10. [部署架构](#部署架构)

---

## 系统概述

MindVoice 是一个智能语音桌面助手，结合了实时语音识别(ASR)和大语言模型(LLM)能力，提供语音笔记、智能对话、知识库等功能。

### 核心特性

- **实时语音识别**：基于火山引擎ASR，支持流式识别和VAD
- **多应用支持**：语音笔记、智能助手、禅（AI辅导）、知识库
- **跨平台**：支持macOS、Windows、Linux
- **本地优先**：数据存储在本地，保护隐私
- **可扩展**：Provider模式支持多个ASR/LLM提供商

### 设计原则

1. **前后端分离**：Electron前端 + FastAPI后端，职责清晰
2. **模块化设计**：Provider模式实现可插拔组件
3. **异步优先**：大量使用异步I/O提升性能
4. **错误容错**：完善的错误处理和自动恢复机制
5. **性能优化**：音频流处理、消息缓冲、队列管理

---

## 技术栈

### 前端技术栈

| 技术 | 版本 | 用途 |
|-----|------|-----|
| **Electron** | ^28.0.0 | 桌面应用框架，提供跨平台能力 |
| **React** | ^18.2.0 | UI框架，组件化开发 |
| **TypeScript** | ^5.0.0 | 类型安全的JavaScript |
| **Vite** | ^5.0.0 | 构建工具，快速HMR |
| **CSS** | - | 样式设计，采用模块化CSS |

### 后端技术栈

| 技术 | 版本 | 用途 |
|-----|------|-----|
| **Python** | ^3.9 | 后端语言 |
| **FastAPI** | ^0.104.0 | 异步Web框架，提供REST API |
| **Uvicorn** | ^0.24.0 | ASGI服务器 |
| **SQLite** | 3 | 本地数据库，存储历史记录 |
| **aiohttp** | ^3.9.0 | 异步HTTP客户端，用于WebSocket |
| **sounddevice** | ^0.4.6 | 音频录制库 |
| **webrtcvad** | ^2.0.10 | 语音活动检测(VAD) |
| **numpy** | ^1.24.0 | 音频数据处理 |

### 外部服务

| 服务 | 提供商 | 用途 |
|-----|--------|-----|
| **ASR** | 火山引擎 | 语音识别 |
| **LLM** | 多提供商 | 大语言模型（支持OpenAI/豆包等） |

---

## 整体架构

### 架构层次

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Shell                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Electron 主进程                       │  │
│  │  - 窗口管理 (BrowserWindow)                       │  │
│  │  - Python进程管理 (spawn)                         │  │
│  │  - 系统托盘 (Tray)                                │  │
│  │  - IPC通信 (ipcMain)                              │  │
│  │  - 消息轮询 (pollMessages - 100ms间隔)            │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↕ IPC                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │              React 渲染进程                        │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  App.tsx (主应用容器)                       │  │  │
│  │  │  - 状态管理 (useState/useRef)               │  │  │
│  │  │  - 路由切换 (视图管理)                      │  │  │
│  │  │  - 自动保存服务 (AutoSaveService)           │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  应用组件 (Apps)                            │  │  │
│  │  │  - VoiceNote (语音笔记)                     │  │  │
│  │  │  - SmartChat (智能助手)                     │  │  │
│  │  │  - VoiceZen (AI辅导)                        │  │  │
│  │  │  - KnowledgeBase (知识库)                   │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕ HTTP REST API / 轮询
┌─────────────────────────────────────────────────────────┐
│                 FastAPI 后端服务                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              API 服务层 (server.py)                │  │
│  │  - REST API端点 (/api/*)                          │  │
│  │  - 消息缓冲区 (MessageBuffer)                     │  │
│  │  - 请求验证 (Pydantic)                            │  │
│  │  - CORS中间件                                     │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │              业务服务层 (services/)                │  │
│  │  - VoiceService (语音服务)                        │  │
│  │  - LLMService (LLM服务)                           │  │
│  │  - KnowledgeService (知识库服务)                  │  │
│  │  - CleanupService (清理服务)                      │  │
│  │  - ExportService (导出服务)                       │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │              提供商层 (providers/)                 │  │
│  │  - ASR (asr/volcano.py)                           │  │
│  │  - LLM (llm/base.py)                              │  │
│  │  - Storage (storage/sqlite.py)                    │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │              核心层 (core/)                        │  │
│  │  - Config (配置管理)                              │  │
│  │  - Logger (日志系统)                              │  │
│  │  - ErrorCodes (错误定义)                          │  │
│  │  - Base (基础抽象类)                              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│                    外部服务                              │
│  - 火山引擎 ASR (WebSocket)                             │
│  - LLM API (HTTP)                                       │
│  - 本地 SQLite 数据库                                   │
└─────────────────────────────────────────────────────────┘
```

### 进程模型

1. **Electron 主进程**
   - 负责应用生命周期管理
   - 管理Python子进程
   - 处理系统级操作（托盘、窗口）
   - 轮询后端消息并通过IPC转发

2. **Electron 渲染进程**
   - React应用运行环境
   - UI渲染和用户交互
   - 通过IPC与主进程通信
   - 通过HTTP与后端通信

3. **Python 后端进程**
   - FastAPI服务器
   - 处理业务逻辑
   - 管理ASR/LLM连接
   - 数据持久化

---

## 前端架构

### 目录结构

```
electron-app/
├── electron/                   # Electron 主进程
│   ├── main.ts                # 主进程入口
│   └── preload.ts             # 预加载脚本
├── src/                       # React 应用
│   ├── App.tsx                # 主应用组件
│   ├── main.tsx               # React 入口
│   ├── version.ts             # 版本管理 ⭐
│   ├── components/
│   │   ├── apps/              # 应用组件
│   │   │   ├── VoiceNote/     # 语音笔记
│   │   │   ├── SmartChat/     # 智能助手
│   │   │   ├── VoiceZen/      # AI辅导
│   │   │   └── KnowledgeBase/ # 知识库
│   │   └── shared/            # 共享组件
│   │       ├── Sidebar.tsx    # 侧边栏
│   │       ├── Toast.tsx      # 提示组件
│   │       ├── ErrorBanner.tsx# 错误展示
│   │       └── HistoryView.tsx# 历史记录
│   ├── services/              # 前端服务
│   │   ├── AutoSaveService.ts # 自动保存
│   │   └── adapters/          # 数据适配器
│   └── utils/                 # 工具函数
└── assets/                    # 静态资源
```

### Electron 主进程 (main.ts)

**职责**：
1. 应用启动和生命周期管理
2. Python后端进程管理
3. 窗口和托盘管理
4. 消息轮询和IPC通信

**关键功能**：

```typescript
// 1. Python进程管理
async function startPythonServer(): Promise<void> {
  // 启动Python API服务器
  // 支持开发环境(python3)和生产环境(打包可执行文件)
}

async function stopPythonServer(): Promise<void> {
  // 优雅停止Python服务器
  // 先发送SIGTERM，超时后SIGKILL
}

// 2. 消息轮询 (替代WebSocket)
async function pollMessages() {
  // 每100ms轮询一次后端消息
  // 获取新消息并通过IPC发送到渲染进程
  const response = await fetch(`${API_URL}/api/messages?after_id=${lastMessageId}`);
  messages.forEach(item => {
    mainWindow?.webContents.send('asr-message', item.message);
  });
}

// 3. 窗口管理
function createWindow(): void {
  // 创建主窗口 (450x800, 手机竖屏比例)
  // 支持横屏/竖屏/最大化切换
}

function createTray(): void {
  // 创建系统托盘
  // 提供快捷操作菜单
}
```

**配置参数**：
- API端口: 8765
- 轮询间隔: 100ms
- 启动超时: 15秒
- 停止超时: 3秒

### React 应用架构 (App.tsx)

**状态管理**：

```typescript
// 核心状态
const [asrState, setAsrState] = useState<RecordingState>('idle');
const [text, setText] = useState('');
const [apiConnected, setApiConnected] = useState(false);
const [activeView, setActiveView] = useState<AppView>('voice-note');

// 工作会话状态
const [currentWorkingRecordId, setCurrentWorkingRecordId] = useState<string | null>(null);
const [workSessionState, setWorkSessionState] = useState<WorkSessionState>('idle');
const [isWorkSessionActive, setIsWorkSessionActive] = useState(false);

// ASR互斥控制
const [asrOwner, setAsrOwner] = useState<AppView | null>(null);
```

**自动保存机制**：

```typescript
// 使用 AutoSaveService 管理自动保存
const voiceNoteAutoSave = useMemo(() => {
  return new AutoSaveService('voice-note', voiceNoteAdapter, undefined, {
    onRecordIdCreated: (recordId) => {
      setCurrentWorkingRecordId(recordId);
    }
  });
}, [voiceNoteAdapter]);

// 触发保存的时机：
// 1. 编辑完成 (edit_complete)
// 2. Block确认 (block_confirmed)
// 3. 视图切换 (view_switch)
// 4. 手动保存 (manual)
// 5. 退出保存 (exit_with_all_data)
```

**视图切换逻辑**：

```typescript
const handleViewChange = async (newView: AppView) => {
  // 1. 检查ASR状态（录音中不允许切换）
  if (asrState === 'recording') {
    setToast({ message: '请先停止录音再切换界面', type: 'warning' });
    return;
  }
  
  // 2. 离开语音笔记时保存
  if (activeView === 'voice-note' && currentWorkingRecordId) {
    await voiceNoteAutoSave.saveToDatabase('view_switch', true);
    pauseWorkSession();
  }
  
  // 3. 返回语音笔记时恢复
  if (newView === 'voice-note' && workSessionState === 'paused') {
    const recoveredData = await voiceNoteAutoSave.recover(currentWorkingRecordId);
    setInitialBlocks(recoveredData.blocks);
  }
  
  setActiveView(newView);
};
```

### 组件架构

#### VoiceNote 组件

**功能**：
- 实时语音识别显示
- 块编辑器（Block Editor）
- 笔记信息管理
- 时间轴指示器
- 导出功能

**核心组件**：

```typescript
// BlockEditor: 块编辑器
interface Block {
  id: string;
  type: 'paragraph' | 'image' | 'note-info' | 'summary';
  content: string;
  imageUrl?: string;
  imageCaption?: string;
  startTime?: number;
  endTime?: number;
  isAsrWriting?: boolean;
  isSummary?: boolean;
}

// appendAsrText: ASR文本追加逻辑
function appendAsrText(text: string, isDefiniteUtterance: boolean, timeInfo?: any) {
  if (isDefiniteUtterance) {
    // 确定的utterance: 创建新block
    const newBlock = {
      id: `block-${Date.now()}`,
      type: 'paragraph',
      content: text,
      startTime: timeInfo?.startTime,
      endTime: timeInfo?.endTime,
      isAsrWriting: false,
    };
    setBlocks(prev => [...prev, newBlock]);
  } else {
    // 中间结果: 更新缓冲block
    setBlocks(prev => {
      const bufferBlockIndex = prev.findIndex(b => b.isBufferBlock);
      if (bufferBlockIndex >= 0) {
        prev[bufferBlockIndex].content = text;
      } else {
        prev.push({ 
          id: `buffer-${Date.now()}`, 
          type: 'paragraph', 
          content: text, 
          isBufferBlock: true 
        });
      }
      return [...prev];
    });
  }
}
```

#### SmartChat 组件

**功能**：
- 多轮对话
- 知识库检索
- 流式响应显示

**消息处理**：

```typescript
const handleSendMessage = async (userMessage: string) => {
  // 1. 添加用户消息到对话历史
  setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
  
  // 2. 发送到后端
  const response = await fetch(`${API_BASE_URL}/api/smartchat/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      stream: true,
      use_knowledge: true,
    }),
  });
  
  // 3. 处理流式响应
  const reader = response.body?.getReader();
  let assistantMessage = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = new TextDecoder().decode(value);
    const lines = chunk.split('\n\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (data.chunk) {
          assistantMessage += data.chunk;
          // 实时更新UI
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last.role === 'assistant') {
              last.content = assistantMessage;
              return [...prev];
            } else {
              return [...prev, { role: 'assistant', content: assistantMessage }];
            }
          });
        }
      }
    }
  }
};
```

---

## 后端架构

### 目录结构

```
src/
├── api/
│   └── server.py              # FastAPI应用入口 ⭐
├── core/
│   ├── config.py              # 配置管理
│   ├── logger.py              # 日志系统
│   ├── error_codes.py         # 错误码定义
│   └── base.py                # 基础抽象类
├── services/
│   ├── voice_service.py       # 语音服务 ⭐
│   ├── llm_service.py         # LLM服务
│   ├── knowledge_service.py   # 知识库服务
│   ├── cleanup_service.py     # 清理服务
│   └── export_service.py      # 导出服务
├── providers/
│   ├── asr/
│   │   ├── base_asr.py        # ASR基类
│   │   └── volcano.py         # 火山引擎ASR ⭐
│   ├── llm/
│   │   └── base.py            # LLM基类
│   └── storage/
│       ├── base_storage.py    # 存储基类
│       └── sqlite.py          # SQLite存储 ⭐
├── agents/
│   ├── summary_agent.py       # 小结Agent
│   ├── smart_chat_agent.py    # 智能对话Agent
│   └── translation_agent.py   # 翻译Agent
└── utils/
    ├── audio_recorder.py      # 音频录制 ⭐
    ├── audio_processor.py     # 音频处理(AGC+NS)
    └── audio_asr_gateway.py   # 音频到ASR的网关
```

### FastAPI 服务器 (server.py)

**服务初始化**：

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时
    setup_logging()
    setup_voice_service()
    setup_llm_service()
    setup_cleanup_service()
    
    # 启动知识库后台加载
    if knowledge_service:
        knowledge_service.start_background_load()
    
    # 启动清理服务
    if cleanup_service:
        await cleanup_service.start()
    
    yield
    
    # 关闭时
    if voice_service:
        voice_service.cleanup()
    if cleanup_service:
        await cleanup_service.stop()

app = FastAPI(
    title="语音桌面助手 API",
    version="1.0.0",
    lifespan=lifespan
)
```

**消息缓冲区** (替代WebSocket):

```python
class MessageBuffer:
    """消息缓冲区 - 用于轮询方案"""
    def __init__(self):
        self.messages = []
        self.counter = 0
        self.max_size = 100  # 保留最近100条
    
    def add(self, message: dict):
        """添加消息"""
        self.counter += 1
        self.messages.append({
            "id": self.counter,
            "message": message,
            "timestamp": time.time()
        })
        # 只保留最近的消息
        if len(self.messages) > self.max_size:
            self.messages = self.messages[-self.max_size:]
    
    def get_after(self, after_id: int):
        """获取指定ID之后的所有消息"""
        return [m for m in self.messages if m["id"] > after_id]

# 广播消息到缓冲区
def broadcast(message: dict):
    message_buffer.add(message)
```

**API端点分类**：

```python
# 1. ASR控制
POST /api/recording/start    # 开始录音
POST /api/recording/pause    # 暂停录音
POST /api/recording/resume   # 恢复录音
POST /api/recording/stop     # 停止录音
GET  /api/status             # 获取状态

# 2. 记录管理
GET    /api/records                    # 列出记录
GET    /api/records/{id}               # 获取单条记录
PUT    /api/records/{id}               # 更新记录
DELETE /api/records/{id}               # 删除记录
POST   /api/records/delete             # 批量删除
POST   /api/text/save                  # 直接保存文本
GET    /api/records/{id}/export        # 导出记录

# 3. LLM服务
GET  /api/llm/info                     # LLM信息
POST /api/llm/chat                     # 对话
POST /api/llm/simple-chat              # 简单对话
POST /api/summary/generate             # 生成小结
POST /api/translate                    # 翻译
POST /api/translate/batch              # 批量翻译

# 4. SmartChat
POST /api/smartchat/chat               # 智能对话
POST /api/smartchat/clear_history      # 清空历史
GET  /api/smartchat/history_status     # 历史状态

# 5. 知识库
POST   /api/knowledge/upload           # 上传文件
POST   /api/knowledge/search           # 搜索
GET    /api/knowledge/files            # 列出文件
DELETE /api/knowledge/files/{id}       # 删除文件

# 6. 图片管理
POST /api/images/save                  # 保存图片
GET  /api/images/{filename}            # 获取图片

# 7. 音频设备
GET  /api/audio/devices                # 列出设备
POST /api/audio/device                 # 设置设备

# 8. 轮询消息
GET  /api/messages                     # 获取新消息
POST /api/messages/clear               # 清空缓冲区

# 9. 清理服务
POST /api/cleanup/manual               # 手动清理
GET  /api/cleanup/status               # 清理状态
```

### 语音服务 (VoiceService)

**架构设计**：

```python
class VoiceService:
    """语音服务主类
    
    职责：
    1. 整合录音、ASR、存储
    2. 管理ASR连接生命周期
    3. 音频数据流控制
    4. 状态管理和回调
    """
    
    def __init__(self, config: Config):
        self.recorder: Optional[AudioRecorder] = None
        self.asr_provider: Optional[VolcanoASRProvider] = None
        self.storage_provider: Optional[SQLiteStorageProvider] = None
        
        self._streaming_active = False
        self._audio_queue: Optional[asyncio.Queue] = None
        self._on_text_callback: Optional[Callable] = None
        self._on_state_change_callback: Optional[Callable] = None
        
        # ASR连接超时监控
        self._asr_start_time: Optional[float] = None
        self._max_connection_duration: int = 5400  # 90分钟
```

**音频流处理架构**：

```
┌─────────────────────────────────────────────────────────┐
│                    Audio Stream Flow                     │
└─────────────────────────────────────────────────────────┘

1. Audio Capture (录音器)
   ↓
   SoundDeviceRecorder.start_recording()
   ├─ sounddevice.InputStream
   ├─ callback: _audio_callback
   └─ 每 chunk (1024 frames) 触发一次

2. Audio Processing (可选的音频处理)
   ↓
   AudioProcessor (AGC + NS)
   ├─ AGC: 自动增益控制
   ├─ NS: 噪声抑制
   └─ 返回处理后的音频数据

3. Audio-ASR Gateway (音频到ASR的网关)
   ↓
   AudioASRGateway
   ├─ VAD启用: 检测语音活动
   │   ├─ 语音开始 → on_speech_start → 启动ASR
   │   ├─ 语音中 → 发送音频到ASR
   │   └─ 语音结束 → on_speech_end → 停止ASR
   └─ VAD禁用: 直通模式
       └─ 所有音频直接发送到ASR

4. ASR Provider (火山引擎)
   ↓
   VolcanoASRProvider
   ├─ WebSocket连接
   ├─ 音频队列 (asyncio.Queue)
   ├─ 发送器任务 (sender_task)
   └─ 接收器任务 (receiver_task)

5. Text Callback (文本回调)
   ↓
   VoiceService._on_asr_text_received
   ├─ 中间结果 (is_definite=False)
   └─ 确定结果 (is_definite=True)
       ├─ 包含时间信息 (start_time, end_time)
       └─ 触发前端更新
```

**ASR启停流程**：

```python
def start_recording(self, app_id: str = None) -> bool:
    """
    开始录音流程：
    1. 重置状态和队列
    2. 启动录音器（Audio先行）
    3. 设置AudioASRGateway回调
    4. AudioASRGateway决定何时启动ASR:
       - VAD启用: 检测到语音后启动
       - VAD禁用: 立即启动
    """
    self._streaming_active = False
    self._audio_queue = None
    
    # 设置回调
    self.recorder.set_asr_gateway_callbacks(
        on_speech_start=self._on_speech_start,
        on_speech_end=self._on_speech_end
    )
    
    # 启动录音器
    self.recorder.start_recording()
    
    # ASR由AudioASRGateway触发启动
    return True

def _on_speech_start(self):
    """语音开始 → 启动ASR"""
    if not self._streaming_active:
        # 连接ASR服务
        await self.asr_provider.start_streaming_recognition()
        self._streaming_active = True
        # 启动超时监控
        self._start_timeout_monitor()

def _on_speech_end(self):
    """语音结束 → 停止ASR"""
    if self._streaming_active:
        # 发送结束标记到音频队列
        self.asr_provider._audio_queue.put_nowait(None)
        # ASR的_on_disconnected回调会重置状态

def stop_recording(self) -> Optional[str]:
    """
    停止录音流程：
    1. 停止录音器（Audio先停）
    2. AudioASRGateway.stop() 触发 on_speech_end
    3. 等待ASR完成最后几个包（最多5秒）
    4. 返回最终文本
    """
    self.recorder.stop_recording()
    
    # 等待ASR完成
    max_wait_time = 5.0
    while self._streaming_active and waited_time < max_wait_time:
        time.sleep(0.1)
    
    return self._current_text
```

### 火山引擎 ASR (VolcanoASRProvider)

**并发架构**：

```python
class VolcanoASRProvider(BaseASRProvider):
    """
    火山引擎ASR提供商
    采用官方参考架构：发送和接收完全并发，通过队列解耦
    """
    
    async def start_streaming_recognition(self, language: str = "zh-CN") -> bool:
        """启动流式识别"""
        # 1. 连接WebSocket
        await self._connect()
        
        # 2. 创建音频队列
        self._audio_queue = asyncio.Queue()
        
        # 3. 发送完整请求
        await self._send_full_request()
        
        # 4. 启动并发任务
        self._sender_task = asyncio.create_task(self._audio_sender())
        self._receiver_task = asyncio.create_task(self._audio_receiver())
        
        self._streaming_active = True
        return True
```

**发送器任务**：

```python
async def _audio_sender(self):
    """音频发送器（独立协程）"""
    last_audio = None
    while True:
        # 从队列获取音频数据
        audio_data = await self._audio_queue.get()
        
        if audio_data is None:
            # 收到结束标记，发送最后一包（负序列号）
            if last_audio:
                request = RequestBuilder.new_audio_only_request(
                    self.seq, last_audio, is_last=True
                )
                await self.conn.send_bytes(request)
            break
        
        # 发送普通音频包
        if last_audio:
            request = RequestBuilder.new_audio_only_request(
                self.seq, last_audio, is_last=False
            )
            await self.conn.send_bytes(request)
            self.seq += 1
        
        last_audio = audio_data
```

**接收器任务**：

```python
async def _audio_receiver(self):
    """ASR结果接收器（独立协程）"""
    try:
        async for msg in self.conn:
            if msg.type == aiohttp.WSMsgType.BINARY:
                # 解析响应
                response = ResponseParser.parse_response(msg.data)
                
                # 处理识别结果
                if response.payload_msg:
                    result = response.payload_msg.get('result', {})
                    text = result.get('text', '')
                    if text:
                        self._handle_recognition_result(result, response.is_last_package)
                
                # 检查是否为最后一包
                if response.is_last_package:
                    break
    finally:
        # 断开连接并清理资源
        await self._disconnect()
```

**ASR协议**：

```python
# 请求协议
class RequestBuilder:
    @staticmethod
    def new_full_client_request(seq: int, enable_nonstream: bool = False) -> bytes:
        """
        完整客户端请求（首包）
        包含：音频格式、模型配置、VAD参数等
        """
        payload = {
            "audio": {
                "format": "pcm",
                "codec": "raw",
                "rate": 16000,
                "bits": 16,
                "channel": 1
            },
            "request": {
                "model_name": "bigmodel",
                "enable_itn": True,      # 逆文本归一化
                "enable_punc": True,     # 标点符号
                "enable_ddc": True,      # 数字转换
                "show_utterances": True, # 显示utterance信息
                "result_type": "single", # 单结果模式
                "enable_nonstream": enable_nonstream  # 二遍识别
            }
        }
        # 序列化、压缩、构造二进制包
        ...
    
    @staticmethod
    def new_audio_only_request(seq: int, segment: bytes, is_last: bool = False) -> bytes:
        """
        纯音频请求
        is_last=True: 使用负序列号，标记结束
        """
        if is_last:
            seq = -seq  # 负序列号
        # 构造音频包
        ...

# 响应协议
class ResponseParser:
    @staticmethod
    def parse_response(msg: bytes) -> AsrResponse:
        """
        解析ASR响应
        包含：识别文本、utterance信息、时间戳等
        """
        # 解析二进制协议头
        # 解压缩payload
        # 解析JSON结果
        ...
```

**Definite Utterance检测**：

```python
def _detect_definite_utterance(self, result: dict, text: str) -> tuple[bool, dict]:
    """
    检测是否为确定的utterance
    
    基于ASR服务返回的utterances中的definite字段判断。
    当enable_nonstream开启时，此字段标记非流式模型重新识别的准确结果。
    
    Returns:
        (是否为确定utterance, 时间信息)
    """
    utterances = result.get('utterances', [])
    for utterance in utterances:
        if utterance.get('definite', False):
            return True, {
                'start_time': utterance.get('start_time', 0),
                'end_time': utterance.get('end_time', 0)
            }
    return False, {}
```

### 存储服务 (SQLiteStorageProvider)

**数据库表结构**：

```sql
CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,              -- UUID v4
    text TEXT NOT NULL,               -- 纯文本内容
    metadata TEXT,                    -- JSON元数据
    app_type TEXT NOT NULL DEFAULT 'voice-note',  -- 应用类型
    created_at TIMESTAMP NOT NULL     -- 本地时间
);

-- 索引
CREATE INDEX idx_created_at ON records(created_at DESC);
CREATE INDEX idx_app_type ON records(app_type);
CREATE INDEX idx_app_type_created_at ON records(app_type, created_at DESC);
```

**metadata结构**：

```json
{
  "blocks": [
    {
      "id": "block-xxx",
      "type": "paragraph",
      "content": "段落内容",
      "startTime": 1704254400000,
      "endTime": 1704254410000,
      "isAsrWriting": false
    },
    {
      "id": "block-yyy",
      "type": "image",
      "content": "",
      "imageUrl": "images/261619072-6ddaa776.png",
      "imageCaption": "图片说明"
    }
  ],
  "noteInfo": {
    "title": "会议纪要",
    "type": "会议",
    "relatedPeople": "张三, 李四",
    "location": "会议室A",
    "startTime": "2026-01-04 10:00:00",
    "endTime": "2026-01-04 11:30:00"
  },
  "language": "zh-CN",
  "provider": "volcano",
  "app_type": "voice-note",
  "trigger": "exit_with_all_data",
  "timestamp": 1704254400000
}
```

**图片管理**：

```python
def delete_record(self, record_id: str) -> bool:
    """删除记录（同步删除关联图片）"""
    # 1. 获取记录
    record = self.get_record(record_id)
    if not record:
        return False
    
    # 2. 提取图片URL
    image_urls = self._extract_image_urls(record)
    
    # 3. 删除图片文件
    deleted_images = self._delete_images(image_urls)
    
    # 4. 删除数据库记录
    conn.execute('DELETE FROM records WHERE id = ?', (record_id,))
    
    return True

def _extract_image_urls(self, record: Dict[str, Any]) -> List[str]:
    """从记录中提取所有图片URL"""
    image_urls = []
    
    # 从metadata.blocks提取
    blocks = record.get('metadata', {}).get('blocks', [])
    for block in blocks:
        if block.get('type') == 'image':
            image_url = block.get('imageUrl')
            if image_url:
                image_urls.append(image_url)
    
    # 从text字段提取（降级方案）
    text = record.get('text', '')
    pattern = r'\[IMAGE:\s*([^\]]+)\]'
    matches = re.findall(pattern, text)
    image_urls.extend(matches)
    
    return image_urls
```

---

## 核心模块详解

### 音频录制器 (SoundDeviceRecorder)

**功能**：
- 基于sounddevice库录制音频
- 支持可选的VAD（语音活动检测）
- 支持可选的音频处理（AGC+NS）
- 缓冲区管理（防止内存溢出）

**初始化参数**：

```python
SoundDeviceRecorder(
    rate=16000,                    # 采样率
    channels=1,                    # 声道数
    chunk=1024,                    # 每次读取帧数
    device=None,                   # 音频设备ID
    vad_config={                   # VAD配置
        'enabled': False,
        'mode': 2,                 # 敏感度(0-3)
        'speech_start_threshold': 2,
        'speech_end_threshold': 10,
        'min_speech_duration_ms': 200,
        'pre_speech_padding_ms': 100,
        'post_speech_padding_ms': 300
    },
    audio_processing_config={      # 音频处理配置
        'enabled': False,
        'enable_agc': True,        # 自动增益控制
        'enable_ns': True,         # 噪声抑制
        'agc_level': 2,            # AGC级别(0-3)
        'ns_level': 2              # NS级别(0-3)
    },
    max_buffer_seconds=60          # 最大缓冲时长
)
```

**音频回调**：

```python
def _audio_callback(self, indata, frames, time_info, status):
    """
    sounddevice回调函数（在音频线程中执行）
    
    Args:
        indata: 音频数据（numpy.ndarray, int16）
        frames: 帧数
        time_info: 时间信息
        status: 状态标志
    """
    if status:
        logger.warning(f"[音频] 回调状态: {status}")
    
    # 1. 转换为字节
    audio_bytes = indata.tobytes()
    
    # 2. 音频处理（可选）
    if self.audio_processor:
        audio_bytes = self.audio_processor.process(audio_bytes)
    
    # 3. 缓冲区管理
    self.audio_buffer.extend(audio_bytes)
    if len(self.audio_buffer) > self.max_buffer_size:
        # 清理旧数据，保留最近的音频
        excess = len(self.audio_buffer) - self.max_buffer_size
        self.audio_buffer = self.audio_buffer[excess:]
        self._buffer_cleanups += 1
    
    # 4. 通过AudioASRGateway处理
    if self.asr_gateway:
        self.asr_gateway.process_audio(audio_bytes)
    else:
        # 无网关，直接回调
        if self.on_audio_chunk:
            self.on_audio_chunk(audio_bytes)
```

### AudioASRGateway (音频到ASR的网关)

**职责**：
- 控制Audio和ASR的启停时机
- 可选的VAD语音活动检测
- 音频缓冲和预填充

**工作模式**：

```python
class AudioASRGateway:
    """
    音频到ASR的网关控制器
    
    模式1: VAD启用（推荐）
    - 检测到语音 → 启动ASR
    - 预填充缓冲音频（pre_speech_padding）
    - 语音结束 → 停止ASR
    - 适用场景：长时间录音、节省ASR连接时长
    
    模式2: VAD禁用（直通）
    - 所有音频直接发送到ASR
    - ASR保持连接
    - 适用场景：持续对话、低延迟要求
    """
    
    def __init__(self, vad_config: dict):
        self.enabled = vad_config.get('enabled', False)
        if self.enabled:
            import webrtcvad
            self.vad = webrtcvad.Vad(vad_config.get('mode', 2))
            self.ring_buffer = []  # 环形缓冲区
        
        self.speech_active = False
        self.on_speech_start = None
        self.on_speech_end = None
        self.on_audio_output = None
    
    def process_audio(self, audio_data: bytes):
        """处理音频数据"""
        if not self.enabled:
            # 直通模式
            if self.on_audio_output:
                self.on_audio_output(audio_data)
            return
        
        # VAD模式
        is_speech = self.vad.is_speech(audio_data, self.sample_rate)
        
        if not self.speech_active:
            # 静音状态
            self.ring_buffer.append(audio_data)
            if len(self.ring_buffer) > self.ring_buffer_size:
                self.ring_buffer.pop(0)
            
            if is_speech:
                self.speech_frames += 1
                if self.speech_frames >= self.speech_start_threshold:
                    # 检测到语音开始
                    self.speech_active = True
                    if self.on_speech_start:
                        self.on_speech_start()
                    
                    # 发送预填充的缓冲音频
                    for buffered in self.ring_buffer:
                        if self.on_audio_output:
                            self.on_audio_output(buffered)
                    self.ring_buffer.clear()
        else:
            # 语音状态
            if self.on_audio_output:
                self.on_audio_output(audio_data)
            
            if not is_speech:
                self.silence_frames += 1
                if self.silence_frames >= self.speech_end_threshold:
                    # 检测到语音结束
                    self.speech_active = False
                    self.speech_frames = 0
                    self.silence_frames = 0
                    if self.on_speech_end:
                        self.on_speech_end()
            else:
                self.silence_frames = 0
```

### 音频处理器 (AudioProcessor)

**功能**：
- AGC (Automatic Gain Control): 自动增益控制
- NS (Noise Suppression): 噪声抑制
- 基于WebRTC AudioProcessing库

```python
class AudioProcessor:
    """音频处理器（AGC + NS）"""
    
    def __init__(self, sample_rate: int = 16000, channels: int = 1,
                 enable_agc: bool = True, enable_ns: bool = True,
                 agc_level: int = 2, ns_level: int = 2):
        import webrtcvad  # 需要安装 webrtc-audio-processing
        
        self.ap = webrtcvad.AudioProcessing()
        self.ap.set_sample_rate_hz(sample_rate)
        self.ap.set_num_channels(channels)
        
        if enable_agc:
            self.ap.gain_control_enable(True)
            self.ap.gain_control_set_mode(agc_level)
        
        if enable_ns:
            self.ap.noise_suppression_enable(True)
            self.ap.noise_suppression_set_level(ns_level)
    
    def process(self, audio_bytes: bytes) -> bytes:
        """处理音频数据"""
        # 转换为numpy数组
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
        
        # 处理
        processed = self.ap.process_stream(audio_array)
        
        # 转回字节
        return processed.tobytes()
```

### 配置管理 (Config)

**配置优先级**：

```python
class Config:
    """
    配置管理器
    
    配置优先级（ASR配置）：
    1. 用户自定义配置（~/Library/Application Support/MindVoice/user_asr_config.yml）
    2. 项目根目录的 config.yml（厂商配置）
    3. 默认配置
    
    其他配置优先级：
    1. 项目根目录的 config.yml
    2. 默认配置
    """
    
    def __init__(self, config_dir: Optional[str] = None):
        # 项目根目录查找优先级：
        # 1. 环境变量 MINDVOICE_CONFIG_PATH
        # 2. 当前工作目录（打包后通常是 resourcesPath）
        # 3. __file__ 相对路径（开发环境）
        if os.getenv('MINDVOICE_CONFIG_PATH'):
            project_root = Path(os.getenv('MINDVOICE_CONFIG_PATH'))
        else:
            cwd = Path(os.getcwd())
            if (cwd / 'config.yml').exists():
                project_root = cwd
            else:
                project_root = Path(__file__).parent.parent.parent
        
        self.project_config_file = project_root / 'config.yml'
        self._config = self._load_config()
        
        # 用户ASR配置
        self.user_asr_config_file = self.config_dir / 'user_asr_config.yml'
        self._user_asr_config = self._load_user_asr_config()
```

**配置文件结构** (config.yml):

```yaml
# ASR配置
asr:
  base_url: wss://openspeech.bytedance.com/api/v3/sauc/bigmodel
  app_id: ""
  app_key: ""
  access_key: ""
  language: zh-CN
  max_connection_duration: 5400  # 90分钟

# LLM配置
llm:
  provider: ""        # openai/doubao/etc
  api_key: ""
  base_url: ""
  model: ""
  max_context_tokens: 128000

# 存储配置
storage:
  type: sqlite
  data_dir: ~/Library/Application Support/MindVoice
  database: database/history.db
  images: images
  knowledge: knowledge
  backups: backups

# 音频配置
audio:
  format: WAV
  channels: 1
  rate: 16000
  chunk: 1024
  device: null        # null=默认设备
  max_buffer_seconds: 60
  
  # VAD配置
  vad:
    enabled: false
    mode: 2
    frame_duration_ms: 20
    speech_start_threshold: 2
    speech_end_threshold: 10
    min_speech_duration_ms: 200
    pre_speech_padding_ms: 100
    post_speech_padding_ms: 300
  
  # 音频处理配置
  audio_processing:
    enabled: false
    enable_agc: true
    enable_ns: true
    agc_level: 2
    ns_level: 2

# UI配置
ui:
  theme: light
  position: { x: 100, y: 100 }
  size: { width: 400, height: 300 }

# 知识库配置
knowledge:
  embedding_model: all-MiniLM-L6-v2
  lazy_load: true

# 清理服务配置
cleanup:
  enabled: true
  interval_hours: 24
  log_retention_days: 7
  orphan_images_enabled: false  # 孤儿图片清理（未实现）
```

---

## 数据流设计

### ASR数据流

```
┌─────────────────────────────────────────────────────────┐
│              ASR Complete Data Flow                      │
└─────────────────────────────────────────────────────────┘

1. 用户点击"开始录音" (前端)
   ↓
2. App.tsx: handleAsrStart()
   ├─ 检查ASR状态和互斥控制
   ├─ 设置asrOwner
   └─ 调用 fetch('/api/recording/start', { app_id })
   ↓
3. 后端 API: POST /api/recording/start
   ├─ VoiceService.start_recording(app_id)
   └─ 返回 { success: true }
   ↓
4. VoiceService.start_recording()
   ├─ 重置状态和队列
   ├─ 设置AudioASRGateway回调
   │   ├─ on_speech_start → _on_speech_start
   │   └─ on_speech_end → _on_speech_end
   ├─ 启动录音器
   │   └─ recorder.start_recording()
   └─ 返回 true
   ↓
5. SoundDeviceRecorder.start_recording()
   ├─ 创建 sounddevice.InputStream
   ├─ 设置回调 _audio_callback
   ├─ stream.start()
   └─ 状态变更: IDLE → RECORDING
   ↓
6. 音频线程: _audio_callback(indata, ...)
   ├─ 每 chunk (1024 frames) 触发一次
   ├─ 音频处理（可选）
   │   └─ AudioProcessor.process(audio_bytes)
   ├─ 缓冲区管理
   │   └─ audio_buffer.extend(audio_bytes)
   └─ AudioASRGateway.process_audio(audio_bytes)
   ↓
7. AudioASRGateway.process_audio()
   ├─ VAD启用:
   │   ├─ 检测语音活动
   │   ├─ 语音开始 → 调用 on_speech_start()
   │   ├─ 发送音频到 on_audio_output()
   │   └─ 语音结束 → 调用 on_speech_end()
   └─ VAD禁用:
       └─ 直接调用 on_audio_output()
   ↓
8. VoiceService._on_speech_start()
   ├─ 创建事件循环
   ├─ 创建音频队列
   └─ asyncio.run_coroutine_threadsafe(
         asr_provider.start_streaming_recognition()
      )
   ↓
9. VolcanoASRProvider.start_streaming_recognition()
   ├─ 连接WebSocket
   │   └─ aiohttp.ClientSession.ws_connect()
   ├─ 发送完整请求
   │   └─ RequestBuilder.new_full_client_request()
   ├─ 创建音频队列
   │   └─ asyncio.Queue()
   ├─ 启动并发任务
   │   ├─ sender_task = asyncio.create_task(_audio_sender())
   │   └─ receiver_task = asyncio.create_task(_audio_receiver())
   └─ 设置 _streaming_active = True
   ↓
10. VoiceService._on_audio_chunk(audio_bytes)
    ├─ 检查 _streaming_active
    └─ asyncio.run_coroutine_threadsafe(
          asr_provider.send_audio_chunk(audio_bytes)
       )
    ↓
11. VolcanoASRProvider.send_audio_chunk()
    └─ await _audio_queue.put(audio_data)
    ↓
12. 发送器协程: _audio_sender()
    ├─ while True:
    │   ├─ audio_data = await _audio_queue.get()
    │   ├─ if audio_data is None: break  # 结束标记
    │   ├─ 构造音频包
    │   │   └─ RequestBuilder.new_audio_only_request(seq, audio)
    │   ├─ 发送到WebSocket
    │   │   └─ await conn.send_bytes(request)
    │   └─ seq += 1
    └─ 发送最后一包（负序列号）
    ↓
13. 接收器协程: _audio_receiver()
    ├─ async for msg in conn:
    │   ├─ 解析响应
    │   │   └─ ResponseParser.parse_response(msg.data)
    │   ├─ 提取识别结果
    │   │   └─ result.get('text')
    │   ├─ 检测definite utterance
    │   │   └─ _detect_definite_utterance(result)
    │   └─ 调用回调
    │       └─ _on_text_callback(text, is_definite, time_info)
    └─ 断开连接
        └─ await _disconnect()
    ↓
14. VoiceService._on_asr_text_received(text, is_definite, time_info)
    ├─ 更新 _current_text = text
    └─ 调用上层回调
        └─ _on_text_callback(text, is_definite, time_info)
    ↓
15. server.py: on_text_callback()
    ├─ 构造消息
    │   └─ { type: 'text_final' / 'text_update', text, start_time, end_time }
    └─ broadcast(message)
        └─ message_buffer.add(message)
    ↓
16. Electron主进程: pollMessages() (每100ms)
    ├─ fetch('/api/messages?after_id=...')
    ├─ 获取新消息
    └─ messages.forEach(item => {
          mainWindow.webContents.send('asr-message', item.message);
        })
    ↓
17. 前端 IPC监听: window.electronAPI.onAsrMessage()
    ├─ 接收消息 { type, text, start_time, end_time }
    └─ switch (data.type):
        ├─ 'text_update': 中间结果
        │   └─ blockEditorRef.current.appendAsrText(text, false)
        └─ 'text_final': 确定结果
            └─ blockEditorRef.current.appendAsrText(text, true, timeInfo)
    ↓
18. BlockEditor.tsx: appendAsrText()
    ├─ if (isDefiniteUtterance):
    │   └─ 创建新block
    │       └─ { id, type: 'paragraph', content: text, 
    │            startTime, endTime, isAsrWriting: false }
    └─ else:
        └─ 更新缓冲block
            └─ { id: 'buffer-...', content: text, isBufferBlock: true }
    ↓
19. React渲染: setBlocks([...]) → 触发重新渲染 → 显示文本
```

### 消息流 (轮询机制)

**为什么用轮询替代WebSocket？**

1. **简化架构**：避免维护多个WebSocket连接
2. **Electron兼容性**：主进程中难以使用WebSocket客户端
3. **可靠性**：HTTP轮询更容易处理重连和错误恢复
4. **性能可控**：100ms轮询间隔足够实时，且不会造成性能问题

**轮询流程**：

```typescript
// Electron主进程 (main.ts)
async function pollMessages() {
  try {
    // 1. 请求新消息
    const response = await fetch(
      `${API_URL}/api/messages?after_id=${lastMessageId}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    const data = await response.json();
    
    // 2. 处理新消息
    if (data.success && data.messages && data.messages.length > 0) {
      data.messages.forEach(item => {
        // 通过IPC发送到渲染进程
        mainWindow?.webContents.send('asr-message', item.message);
        lastMessageId = item.id;
      });
    }
  } catch (error) {
    // 静默重试，避免刷屏
  }
}

// 启动轮询（间隔100ms）
function startPolling() {
  // 清空后端消息缓冲区
  await fetch(`${API_URL}/api/messages/clear`, { method: 'POST' });
  
  lastMessageId = 0;
  pollMessages();  // 立即执行一次
  pollingTimer = setInterval(pollMessages, 100);
}
```

```python
# 后端 (server.py)
class MessageBuffer:
    """消息缓冲区"""
    def __init__(self):
        self.messages = []
        self.counter = 0
        self.max_size = 100

@app.get("/api/messages")
async def get_messages(after_id: int = 0):
    """获取指定ID之后的所有消息"""
    messages = message_buffer.get_after(after_id)
    return {
        "success": True,
        "messages": messages,
        "server_time": time.time()
    }

@app.post("/api/messages/clear")
async def clear_messages():
    """清空消息缓冲区（前端重启时）"""
    message_buffer.clear()
    return { "success": True }
```

### 保存和恢复流程

**自动保存**：

```typescript
// AutoSaveService.ts
class AutoSaveService {
  private saveTimer: NodeJS.Timeout | null = null;
  private currentRecordId: string | null = null;
  
  start() {
    // 启动定时保存（5秒间隔）
    this.saveTimer = setInterval(() => {
      this.saveToDatabase('auto', false);
    }, 5000);
  }
  
  async saveToDatabase(trigger: string, force: boolean = false) {
    // 1. 检查是否需要保存
    if (!force && this.editingItemId) {
      return;  // 正在编辑，跳过自动保存
    }
    
    // 2. 获取数据
    const saveData = this.adapter.toSaveData();
    if (!saveData.hasContent) {
      return;  // 无内容，跳过
    }
    
    // 3. 保存到数据库
    if (this.currentRecordId) {
      // 更新已有记录
      await fetch(`/api/records/${this.currentRecordId}`, {
        method: 'PUT',
        body: JSON.stringify(saveData)
      });
    } else {
      // 创建新记录
      const response = await fetch('/api/text/save', {
        method: 'POST',
        body: JSON.stringify(saveData)
      });
      const result = await response.json();
      this.currentRecordId = result.record_id;
      this.onRecordIdCreated?.(result.record_id);
    }
  }
  
  async recover(recordId: string) {
    // 从数据库恢复数据
    const response = await fetch(`/api/records/${recordId}`);
    const data = await response.json();
    return this.adapter.fromSaveData(data);
  }
}
```

**保存时机**：

1. **定时自动保存**: 每5秒保存一次（如果有变化）
2. **Block确认**: 用户确认ASR文本时
3. **编辑完成**: 用户完成block编辑时
4. **视图切换**: 离开语音笔记时
5. **手动保存**: 用户点击保存按钮
6. **退出保存**: EXIT退出时（保存所有数据，包括临时状态）

**恢复流程**：

```typescript
// App.tsx
const loadRecord = async (recordId: string) => {
  // 1. 使用AutoSave恢复
  const recoveredData = await voiceNoteAutoSave.recover(recordId);
  
  // 2. 设置当前工作ID
  setCurrentWorkingRecordId(recordId);
  voiceNoteAutoSave.setCurrentRecordId(recordId);
  
  // 3. 恢复blocks
  if (recoveredData && recoveredData.blocks) {
    setInitialBlocks(recoveredData.blocks);
  } else {
    // 降级：从纯文本创建blocks
    const textBlocks = data.text.split('\n')
      .map((line, index) => {
        // 解析图片占位符
        const imageMatch = line.match(/^\[IMAGE: (.*?)\](.*)?$/);
        if (imageMatch) {
          return {
            id: `block-restored-${Date.now()}-${index}`,
            type: 'image',
            content: '',
            imageUrl: imageMatch[1],
            imageCaption: imageMatch[2]?.trim()
          };
        }
        return {
          id: `block-restored-${Date.now()}-${index}`,
          type: 'paragraph',
          content: line
        };
      });
    setInitialBlocks(textBlocks);
  }
  
  // 4. 切换视图并启动工作会话
  setActiveView('voice-note');
  startWorkSession('voice-note', recordId);
};
```

---

## 存储架构

### 数据目录结构

```
~/Library/Application Support/MindVoice/  (macOS)
~/.local/share/MindVoice/                  (Linux)
%APPDATA%\MindVoice\                       (Windows)

├── database/
│   └── history.db                # SQLite数据库
├── images/
│   ├── 261619072-6ddaa776.png    # 图片文件
│   └── 261619089-8ebbcc88.jpg
├── knowledge/
│   ├── chroma/                   # 向量数据库
│   │   └── chroma.sqlite3
│   └── files/                    # 原始知识库文件
│       ├── document1.md
│       └── document2.txt
├── backups/                      # 数据库备份
│   ├── history.db.backup.20260105
│   └── history.db.backup.20260104
└── user_asr_config.yml           # 用户ASR配置
```

### 图片存储流程

```
┌─────────────────────────────────────────────────────────┐
│              Image Storage Flow                          │
└─────────────────────────────────────────────────────────┘

1. 用户粘贴图片 (前端)
   ↓
2. BlockEditor.tsx: onPaste事件
   ├─ 检测剪贴板中的图片
   │   └─ event.clipboardData.items[i].type.startsWith('image/')
   ├─ 读取图片数据
   │   └─ FileReader.readAsDataURL(file)
   └─ 获取Base64数据
       └─ data:image/png;base64,iVBORw0KG...
   ↓
3. 上传到后端
   └─ fetch('/api/images/save', {
        method: 'POST',
        body: JSON.stringify({ image_data: base64Data })
      })
   ↓
4. 后端 API: POST /api/images/save
   ├─ 解码Base64
   │   └─ image_bytes = base64.b64decode(image_data)
   ├─ 生成唯一文件名
   │   └─ f"{timestamp}-{hash}.png"
   ├─ 保存到 data_dir/images/
   │   └─ Path(data_dir) / images_relative / filename
   └─ 返回相对路径
       └─ { success: true, image_url: "images/261619072-6ddaa776.png" }
   ↓
5. 前端创建图片block
   └─ {
        id: `block-${Date.now()}`,
        type: 'image',
        content: '',  // 图片块content为空
        imageUrl: 'images/261619072-6ddaa776.png',
        imageCaption: ''
      }
   ↓
6. 保存到数据库
   ├─ text字段: 包含图片占位符
   │   └─ "[IMAGE: images/261619072-6ddaa776.png]"
   └─ metadata.blocks: 包含完整图片块信息
       └─ { type: 'image', imageUrl: '...', imageCaption: '...' }
   ↓
7. 渲染图片
   └─ <img src={`${API_BASE_URL}/api/${block.imageUrl}`} />
       └─ GET /api/images/261619072-6ddaa776.png
```

**图片删除流程**：

```python
# SQLiteStorageProvider.delete_record()
def delete_record(self, record_id: str) -> bool:
    # 1. 获取记录
    record = self.get_record(record_id)
    
    # 2. 提取图片URL（从metadata.blocks和text）
    image_urls = self._extract_image_urls(record)
    # 返回: ['images/xxx.png', 'images/yyy.jpg']
    
    # 3. 删除图片文件
    for url in image_urls:
        filename = url.replace('images/', '')
        image_path = self.images_dir / filename
        if image_path.exists():
            image_path.unlink()
    
    # 4. 删除数据库记录
    conn.execute('DELETE FROM records WHERE id = ?', (record_id,))
    
    return True
```

### 数据库备份

```python
# CleanupService.py
class CleanupService:
    async def backup_database(self):
        """备份数据库"""
        # 1. 生成备份文件名
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = self.backups_dir / f"history.db.backup.{timestamp}"
        
        # 2. 复制数据库文件
        shutil.copy2(self.db_path, backup_file)
        
        # 3. 清理旧备份（保留最近7天）
        cutoff_date = datetime.now() - timedelta(days=7)
        for backup in self.backups_dir.glob('history.db.backup.*'):
            if backup.stat().st_mtime < cutoff_date.timestamp():
                backup.unlink()
```

---

## 通信机制

### HTTP REST API

**端点分类**：

| 类别 | 端点 | 方法 | 用途 |
|-----|------|------|-----|
| **ASR控制** | `/api/recording/start` | POST | 开始录音 |
| | `/api/recording/stop` | POST | 停止录音 |
| | `/api/status` | GET | 获取状态 |
| **记录管理** | `/api/records` | GET | 列出记录 |
| | `/api/records/{id}` | GET | 获取记录 |
| | `/api/records/{id}` | PUT | 更新记录 |
| | `/api/records/{id}` | DELETE | 删除记录 |
| | `/api/text/save` | POST | 保存文本 |
| **LLM服务** | `/api/llm/chat` | POST | LLM对话 |
| | `/api/smartchat/chat` | POST | 智能对话 |
| | `/api/summary/generate` | POST | 生成小结 |
| **知识库** | `/api/knowledge/upload` | POST | 上传文件 |
| | `/api/knowledge/search` | POST | 搜索 |
| **轮询** | `/api/messages` | GET | 获取新消息 |
| | `/api/messages/clear` | POST | 清空缓冲区 |

**请求示例**：

```typescript
// 开始录音
const response = await fetch('/api/recording/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app_id: 'voice-note' })
});

// 保存记录
const response = await fetch('/api/text/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '会议记录...',
    app_type: 'voice-note',
    metadata: {
      blocks: [...],
      noteInfo: {...}
    }
  })
});

// 智能对话（流式）
const response = await fetch('/api/smartchat/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '介绍一下知识库的内容',
    stream: true,
    use_knowledge: true
  })
});

// 处理SSE流式响应
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = new TextDecoder().decode(value);
  const lines = chunk.split('\n\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      if (data.chunk) {
        console.log(data.chunk);
      }
    }
  }
}
```

### IPC通信 (Electron)

**主进程 → 渲染进程**：

```typescript
// main.ts
mainWindow.webContents.send('asr-message', {
  type: 'text_final',
  text: '识别结果',
  start_time: 1000,
  end_time: 2000
});

// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  onAsrMessage: (callback) => {
    ipcRenderer.on('asr-message', (event, data) => {
      callback(data);
    });
  }
});

// React (App.tsx)
useEffect(() => {
  window.electronAPI.onAsrMessage((data) => {
    // 处理ASR消息
  });
}, []);
```

**渲染进程 → 主进程**：

```typescript
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  getApiUrl: () => ipcMain.invoke('get-api-url'),
  windowClose: () => ipcMain.invoke('window-close'),
  windowMaximize: () => ipcMain.invoke('window-maximize')
});

// main.ts
ipcMain.handle('get-api-url', () => {
  return 'http://127.0.0.1:8765';
});

ipcMain.handle('window-close', () => {
  mainWindow?.hide();
});
```

---

## 部署架构

### 开发环境

```
┌─────────────────────────────────────────────────────────┐
│              Development Environment                     │
└─────────────────────────────────────────────────────────┘

Terminal 1: Python后端
$ cd /path/to/project
$ source venv/bin/activate
$ python api_server.py --host 127.0.0.1 --port 8765

Terminal 2: Electron前端
$ cd electron-app
$ npm run dev

前端访问: http://localhost:5173 (Vite开发服务器)
后端访问: http://127.0.0.1:8765
```

**快速启动脚本** (quick_start.sh):

```bash
#!/bin/bash
# 同时启动前后端

# 启动Python后端（后台）
source venv/bin/activate
python api_server.py --host 127.0.0.1 --port 8765 &
PYTHON_PID=$!

# 启动Electron前端
cd electron-app
npm run dev

# 清理：Ctrl+C时杀死Python进程
trap "kill $PYTHON_PID" EXIT
```

### 生产环境

**打包流程**：

```bash
# 1. 构建前端
cd electron-app
npm run build

# 2. 打包Python后端
cd ..
pyinstaller build/config/pyinstaller.spec

# 3. 打包Electron应用
cd electron-app
npm run build:mac     # macOS
npm run build:windows # Windows
npm run build:linux   # Linux
```

**打包产物**：

```
release/
├── MindVoice-1.8.1-mac-arm64.dmg        # macOS安装包
├── MindVoice-1.8.1-windows-x64.exe      # Windows安装包
└── MindVoice-1.8.1-linux-x64.AppImage   # Linux安装包

打包后的目录结构（以macOS为例）:
MindVoice.app/
├── Contents/
│   ├── MacOS/
│   │   └── MindVoice                    # Electron可执行文件
│   ├── Resources/
│   │   ├── app.asar                     # 前端代码
│   │   ├── python-backend/
│   │   │   └── mindvoice-api            # Python打包可执行文件
│   │   └── config.yml.example           # 配置文件模板
│   └── Info.plist
```

**启动流程**：

```typescript
// 生产环境启动流程 (main.ts)
app.whenReady().then(async () => {
  // 1. 检查配置文件
  const configPath = path.join(process.resourcesPath, 'config.yml');
  if (!fs.existsSync(configPath)) {
    // 提示用户创建配置文件
  }
  
  // 2. 启动Python后端
  const apiPath = path.join(process.resourcesPath, 'python-backend', 'mindvoice-api');
  pythonProcess = spawn(apiPath, ['--host', '127.0.0.1', '--port', '8765']);
  
  // 3. 等待后端启动
  await waitForServer('http://127.0.0.1:8765/api/status');
  
  // 4. 创建窗口
  createWindow();
});
```

### 跨平台数据目录

| 平台 | 数据目录 |
|-----|---------|
| **macOS** | `~/Library/Application Support/MindVoice` |
| **Linux** | `~/.local/share/MindVoice` |
| **Windows** | `%APPDATA%\MindVoice` |

---

## 总结

### 核心设计亮点

1. **前后端分离**：Electron负责UI和系统集成，Python负责业务逻辑
2. **Provider模式**：ASR、LLM、Storage都采用可插拔设计
3. **异步优先**：音频流、ASR识别、LLM对话都采用异步处理
4. **轮询替代WebSocket**：简化架构，提高可靠性
5. **自动保存机制**：防止数据丢失，支持断点恢复
6. **VAD音频网关**：智能控制ASR启停，节省连接时长
7. **图片同步管理**：删除记录时自动清理关联图片

### 技术特点

- **TypeScript + Python**：类型安全 + 生态丰富
- **React Hooks**：简洁的状态管理
- **FastAPI**：高性能异步Web框架
- **SQLite**：轻量级本地数据库
- **WebSocket (ASR)**：实时语音识别
- **SSE (LLM)**：流式响应显示

### 性能优化

- 音频流异步处理
- 消息缓冲区（避免丢失）
- 队列解耦（发送和接收并发）
- 缓冲区管理（防止内存溢出）
- 定时自动保存（防止阻塞）
- 懒加载（知识库模型后台加载）

### 可扩展性

- **多ASR提供商**：通过BaseASRProvider扩展
- **多LLM提供商**：通过BaseLLMProvider扩展
- **多应用支持**：VoiceNote、SmartChat、VoiceZen等
- **插件系统**：通过Agent模式扩展功能

---

## 附录

### 关键文件清单

| 文件 | 行数 | 用途 |
|-----|------|-----|
| `electron-app/electron/main.ts` | 1098 | Electron主进程 |
| `electron-app/src/App.tsx` | 1250 | React主应用 |
| `src/api/server.py` | 2375 | FastAPI服务器 |
| `src/services/voice_service.py` | 663 | 语音服务 |
| `src/providers/asr/volcano.py` | 809 | 火山引擎ASR |
| `src/providers/storage/sqlite.py` | 379 | SQLite存储 |
| `src/utils/audio_recorder.py` | 465 | 音频录制器 |

### 第三方依赖

**Python后端**：
- `fastapi>=0.104.0`: Web框架
- `uvicorn>=0.24.0`: ASGI服务器
- `aiohttp>=3.9.0`: 异步HTTP客户端
- `sounddevice>=0.4.6`: 音频录制
- `webrtcvad>=2.0.10`: VAD
- `numpy>=1.24.0`: 音频处理
- `pydantic>=2.0.0`: 数据验证

**前端**：
- `electron@^28.0.0`: 桌面应用框架
- `react@^18.2.0`: UI框架
- `typescript@^5.0.0`: 类型系统
- `vite@^5.0.0`: 构建工具

### 配置参数速查

| 参数 | 默认值 | 说明 |
|-----|--------|-----|
| `API_PORT` | 8765 | 后端API端口 |
| `轮询间隔` | 100ms | 消息轮询间隔 |
| `ASR超时` | 5400秒 | ASR连接最大时长(90分钟) |
| `自动保存间隔` | 5秒 | 自动保存触发间隔 |
| `缓冲区大小` | 60秒 | 音频缓冲区最大时长 |
| `VAD模式` | 2 | VAD敏感度(0-3) |
| `采样率` | 16000Hz | 音频采样率 |
| `声道数` | 1 | 音频声道数 |

---

**文档维护**：
- 此文档基于实际代码分析生成
- 版本号与应用版本同步
- 代码变更时应及时更新文档

**参考资源**：
- [项目README](../README.md)
- [API文档](./API_REFERENCE.md)
- [数据库文档](./DATABASE_SCHEMA.md)
- [编程规则](../repo_specific_rule)

