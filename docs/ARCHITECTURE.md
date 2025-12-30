# 系统架构说明文档

## 目录

1. [概述](#概述)
2. [整体架构](#整体架构)
3. [核心模块](#核心模块)
4. [数据流](#数据流)
5. [通信协议](#通信协议)
6. [扩展机制](#扩展机制)
7. [配置管理](#配置管理)
8. [部署架构](#部署架构)

---

## 概述

**语音桌面助手（MindVoice）** 是一个基于AI的跨平台桌面语音助手，支持语音转文字、语音笔记和翻译功能。

### 核心特性

- 🎤 **语音转文字**：使用第三方ASR服务进行实时语音识别
- 📝 **语音笔记**：自动记录和保存语音识别结果
- 💾 **历史记录**：SQLite数据库存储历史记录
- 🔌 **插件化架构**：支持扩展ASR和存储提供商
- 🌐 **跨平台**：基于Electron，支持Windows、macOS、Linux

### 技术栈

**后端**：
- Python 3.9+
- FastAPI（HTTP REST API + WebSocket）
- sounddevice（音频录制）
- aiohttp（异步HTTP/WebSocket客户端）
- SQLite（数据存储）

**前端**：
- Electron（跨平台桌面应用框架）
- React（UI框架）
- TypeScript（类型安全）
- Vite（构建工具）

---

## 整体架构

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron 前端                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  App.tsx │  │Workspace│  │BlockEditor│  │ Settings │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │             │              │             │         │
│       └─────────────┴──────────────┴─────────────┘         │
│                        │                                    │
│                        ▼                                    │
│              ┌──────────────────┐                           │
│              │  WebSocket Client│                           │
│              │  HTTP REST Client│                           │
│              └────────┬─────────┘                           │
└───────────────────────┼────────────────────────────────────┘
                        │
                        │ HTTP REST API
                        │ WebSocket (ws://)
                        │
┌───────────────────────┼────────────────────────────────────┐
│              ┌────────▼─────────┐                          │
│              │  FastAPI Server  │                          │
│              │  (api_server.py) │                          │
│              └────────┬─────────┘                          │
│                       │                                    │
│  ┌────────────────────┼────────────────────┐               │
│  │                    │                    │               │
│  ▼                    ▼                    ▼               │
│ ┌──────────┐   ┌──────────┐      ┌──────────┐           │
│ │VoiceService│   │  Config  │      │PluginManager│        │
│ └────┬─────┘   └──────────┘      └──────────┘           │
│      │                                                    │
│      ├──────────────┬──────────────┐                      │
│      │              │              │                      │
│      ▼              ▼              ▼                      │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│ │AudioRecorder│ │ASRProvider│ │StorageProvider│           │
│ │(sounddevice)│ │(volcano)  │ │(sqlite)      │           │
│ └──────────┘  └─────┬────┘  └──────────┘                │
│                     │                                    │
│                     ▼                                    │
│            ┌─────────────────┐                           │
│            │ 第三方ASR服务   │                           │
│            │ (火山引擎WebSocket)│                         │
│            └─────────────────┘                           │
└──────────────────────────────────────────────────────────┘
```

### 架构特点

1. **前后端分离**：
   - 后端是独立的Python API服务器，可以被任何前端框架调用
   - 前端通过HTTP REST API和WebSocket与后端通信
   - 便于后续替换前端框架（如Web、移动端等）

2. **插件化设计**：
   - ASR提供商和存储提供商通过抽象基类定义接口
   - 支持动态加载和扩展新的提供商
   - 配置驱动，无需修改核心代码

3. **异步处理**：
   - 后端使用FastAPI的异步特性
   - 音频流式处理，实时识别
   - WebSocket实时推送识别结果

---

## 核心模块

### 1. 配置管理模块（Config）

**位置**：`src/core/config.py`

**职责**：
- 从配置文件（`config.yml`）加载配置
- 支持用户自定义ASR配置（`~/.voice_assistant/user_asr_config.yml`）
- 提供配置优先级机制（用户配置 > 厂商配置 > 默认配置）

**关键方法**：
- `get(key, default)`: 获取配置值（支持点号分隔的嵌套键）
- `get_asr_config(use_user_config)`: 获取ASR配置
- `save_user_asr_config(asr_config)`: 保存用户自定义ASR配置

**配置优先级（ASR配置）**：
1. 用户自定义配置（`~/.voice_assistant/user_asr_config.yml`）
2. 项目根目录的 `config.yml`（厂商配置）
3. 默认配置

### 2. 插件管理模块（PluginManager）

**位置**：`src/core/plugin_manager.py`

**职责**：
- 动态加载ASR和存储提供商模块
- 自动发现并注册提供商类
- 创建提供商实例

**关键方法**：
- `load_plugin_module(module_path)`: 动态加载插件模块
- `create_asr_instance(name, config)`: 创建ASR提供商实例
- `create_storage_instance(name, config)`: 创建存储提供商实例

### 3. 语音服务模块（VoiceService）

**位置**：`src/services/voice_service.py`

**职责**：
- 整合录音、ASR、存储等功能
- 管理录音状态（IDLE、RECORDING、PAUSED、STOPPING）
- 处理流式识别和文本回调
- 管理会话记录

**关键方法**：
- `start_recording()`: 开始录音（启动流式识别）
- `pause_recording()`: 暂停录音
- `resume_recording()`: 恢复录音
- `stop_recording()`: 停止录音并获取最终结果
- `set_on_text_callback(callback)`: 设置文本回调函数

**状态管理**：
```python
class RecordingState(Enum):
    IDLE = "idle"        # 空闲
    RECORDING = "recording"  # 录音中
    PAUSED = "paused"    # 暂停
    STOPPING = "stopping"    # 正在停止
```

### 4. 音频录制器（AudioRecorder）

**位置**：`src/utils/audio_recorder.py`

**实现**：`SoundDeviceRecorder`（基于sounddevice库）

**职责**：
- 音频设备管理
- 实时音频流捕获
- 音频数据块回调（用于流式ASR）

**关键特性**：
- 支持选择音频输入设备
- 实时音频流处理
- 暂停/恢复功能
- 音频数据块回调（`on_audio_chunk`）

### 5. ASR提供商（ASRProvider）

**抽象基类**：`src/core/base.py`

**实现**：`src/providers/asr/volcano.py`（火山引擎ASR）

**职责**：
- 与第三方ASR服务建立WebSocket连接
- 发送音频数据流
- 接收识别结果（包括临时结果和最终结果）
- 处理`definite`标志（表示确定的utterance）

**关键方法**：
- `initialize(config)`: 初始化提供商
- `start_streaming_recognition(language)`: 启动流式识别
- `send_audio_chunk(audio_data)`: 发送音频数据块
- `stop_streaming_recognition()`: 停止识别并获取最终结果

**utterance概念**：
- `utterance`是ASR领域的标准术语，表示一个完整的语音识别单元
- `definite=True`表示一个确定的utterance已完成
- 前端根据`is_definite_utterance`标志决定是否固化当前Block

### 6. 存储提供商（StorageProvider）

**抽象基类**：`src/core/base.py`

**实现**：`src/providers/storage/sqlite.py`

**职责**：
- 保存语音识别记录
- 查询历史记录
- 删除记录
- 支持会话记录（多个utterance组成一个会话）

**关键方法**：
- `save_record(text, metadata)`: 保存记录
- `get_record(record_id)`: 获取记录
- `list_records(limit, offset)`: 列出记录
- `delete_record(record_id)`: 删除记录

### 7. API服务器（FastAPI Server）

**位置**：`src/api/server.py`、`api_server.py`

**职责**：
- 提供HTTP REST API接口
- 管理WebSocket连接
- 广播消息到所有连接的客户端
- 初始化和管理语音服务

**关键接口**：
- `GET /api/status`: 获取当前状态
- `POST /api/start`: 开始录音
- `POST /api/pause`: 暂停录音
- `POST /api/resume`: 恢复录音
- `POST /api/stop`: 停止录音
- `GET /api/records`: 获取历史记录
- `DELETE /api/records/{record_id}`: 删除记录
- `WebSocket /ws`: 实时消息推送

### 8. Electron主进程

**位置**：`electron-app/electron/main.ts`

**职责**：
- 启动和管理Python API服务器进程
- 创建和管理应用窗口
- 系统托盘和菜单
- 应用生命周期管理

**关键功能**：
- 自动启动Python API服务器
- 窗口显示/隐藏管理
- 系统托盘图标和菜单
- Content Security Policy (CSP) 设置

### 9. React前端组件

**主要组件**：
- `App.tsx`: 主应用组件，管理WebSocket连接和状态
- `Workspace.tsx`: 工作区组件，包含BlockEditor
- `BlockEditor.tsx`: 块编辑器，处理ASR文本的实时显示和编辑
- `Sidebar.tsx`: 侧边栏，视图切换
- `HistoryView.tsx`: 历史记录查看
- `SettingsView.tsx`: 设置界面

**关键特性**：
- WebSocket实时接收ASR文本
- BlockEditor根据`is_definite_utterance`标志管理文本块
- 支持暂停/恢复时的状态管理

---

## 数据流

### 音频识别流程

```
┌─────────────┐
│  用户说话    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ AudioRecorder   │ 捕获音频流
│ (sounddevice)   │
└──────┬──────────┘
       │ on_audio_chunk回调
       │ (音频数据块)
       ▼
┌─────────────────┐
│ VoiceService    │ 管理音频流
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ ASRProvider     │ 发送音频到ASR服务
│ (volcano)       │
└──────┬──────────┘
       │ WebSocket
       │
       ▼
┌─────────────────┐
│ 第三方ASR服务    │ 识别并返回结果
│ (火山引擎)       │
└──────┬──────────┘
       │ 识别结果
       │ (text, is_definite_utterance)
       │
       ▼
┌─────────────────┐
│ ASRProvider     │ 接收识别结果
│ (回调函数)      │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ VoiceService    │ 处理识别结果
│ (on_text_callback)│
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ FastAPI Server  │ 通过WebSocket广播
│ (broadcast)     │
└──────┬──────────┘
       │ WebSocket消息
       │
       ▼
┌─────────────────┐
│ Electron前端    │ 接收并显示
│ (App.tsx)       │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ BlockEditor     │ 更新文本块
│ (appendAsrText) │
└─────────────────┘
```

### 文本处理流程（BlockEditor）

详细流程请参考：[BlockEditor_Flow.md](./BlockEditor_Flow.md)

**关键点**：
1. `is_definite_utterance=false`：更新当前Block的内容
2. `is_definite_utterance=true`：固化当前Block，准备下一个Block
3. 暂停恢复时：清除ASR标记，创建新Block

### 存储流程

```
┌─────────────────┐
│ VoiceService    │ 检测到确定的utterance
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ 创建/更新会话记录│ session_id管理
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ StorageProvider │ 保存到SQLite
│ (sqlite)        │
└─────────────────┘
```

---

## 通信协议

### HTTP REST API

**基础URL**：`http://127.0.0.1:8765/api`

#### 1. 获取状态
```
GET /api/status
Response: {
  "state": "idle" | "recording" | "paused" | "stopping",
  "current_text": "string"
}
```

#### 2. 开始录音
```
POST /api/recording/start
Response: {
  "success": true,
  "message": "录音已开始"
}
```

#### 3. 暂停录音
```
POST /api/recording/pause
Response: {
  "success": true,
  "message": "录音已暂停"
}
```

#### 4. 恢复录音
```
POST /api/recording/resume
Response: {
  "success": true,
  "message": "录音已恢复"
}
```

#### 5. 停止录音
```
POST /api/recording/stop
Request Body: {
  "user_edited_text": "string" (可选)
}
Response: {
  "success": true,
  "final_text": "string",
  "message": "录音已停止"
}
```

#### 6. 直接保存文本
```
POST /api/text/save
Request Body: {
  "text": "string"
}
Response: {
  "success": true,
  "record_id": "string",
  "message": "文本已保存"
}
```

#### 7. 获取历史记录
```
GET /api/records?limit=50&offset=0
Response: {
  "success": true,
  "records": [...],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

#### 8. 获取单条记录
```
GET /api/records/{record_id}
Response: {
  "id": "string",
  "text": "string",
  "metadata": {...},
  "created_at": "string"
}
```

#### 9. 删除记录
```
DELETE /api/records/{record_id}
Response: {
  "success": true,
  "message": "记录已删除"
}
```

#### 10. 批量删除记录
```
POST /api/records/delete
Request Body: {
  "record_ids": ["id1", "id2", ...]
}
Response: {
  "success": true,
  "deleted_count": 2,
  "message": "已删除2条记录"
}
```

#### 11. 获取音频设备列表
```
GET /api/audio/devices
Response: {
  "success": true,
  "devices": [
    {
      "id": 0,
      "name": "设备名称",
      "channels": 1,
      "samplerate": 44100.0,
      "hostapi": 0
    }
  ],
  "current_device": 0
}
```

#### 12. 设置音频设备
```
POST /api/audio/device
Request Body: {
  "device": 0  // null表示使用默认设备
}
Response: {
  "success": true,
  "message": "音频设备已设置为: 0"
}
```

#### 13. 获取ASR配置
```
GET /api/asr/config
Response: {
  "success": true,
  "config_source": "user" | "vendor",
  "current_config": {
    "base_url": "string",
    "app_id": "string",
    "app_key": "***",  // 敏感信息已脱敏
    "access_key": "***",
    "language": "zh-CN"
  },
  "vendor_config": {...}
}
```

#### 14. 设置ASR配置
```
POST /api/asr/config
Request Body: {
  "use_user_config": true,  // true=使用用户配置，false=使用厂商配置
  "config": {  // 仅在use_user_config=true时需要
    "app_id": "string",
    "app_key": "string",
    "access_key": "string",
    "language": "zh-CN"
  }
}
Response: {
  "success": true,
  "message": "ASR配置已更新"
}
```

### WebSocket协议

**连接URL**：`ws://127.0.0.1:8765/ws`

#### 消息类型

**1. 初始状态（服务器 → 客户端）**
```json
{
  "type": "initial_state",
  "state": "idle" | "recording" | "paused" | "stopping",
  "text": "当前文本"  // 可选字段，有文本时包含
}
```

**2. 文本更新（服务器 → 客户端）**

中间结果（实时更新）：
```json
{
  "type": "text_update",
  "text": "识别到的文本"
}
```

确定结果（完整utterance）：
```json
{
  "type": "text_final",
  "text": "识别到的文本"
}
```

**3. 状态变化（服务器 → 客户端）**
```json
{
  "type": "state_change",
  "state": "idle" | "recording" | "paused" | "stopping"
}
```

**4. 错误消息（服务器 → 客户端）**
```json
{
  "type": "error",
  "error_type": "错误类型",
  "message": "错误消息"
}
```

---

## 扩展机制

### 添加新的ASR提供商

1. **创建提供商类**：
   ```python
   # src/providers/asr/your_provider.py
   from ..core.base import ASRProvider
   
   class YourASRProvider(ASRProvider):
       @property
       def name(self) -> str:
           return "your_provider"
       
       def initialize(self, config: Dict[str, Any]) -> bool:
           # 初始化逻辑
           pass
       
       def recognize(self, audio_data: bytes, language: str = "zh-CN", **kwargs) -> str:
           # 识别逻辑
           pass
       
       def is_available(self) -> bool:
           # 检查服务是否可用
           pass
   ```

2. **在API服务器中加载**：
   ```python
   # src/api/server.py
   plugin_manager.load_plugin_module('src.providers.asr.your_provider')
   ```

3. **在配置中指定**：
   ```yaml
   # config.yml
   asr:
     provider: "your_provider"
     # ... 其他配置
   ```

### 添加新的存储提供商

1. **创建提供商类**：
   ```python
   # src/providers/storage/your_storage.py
   from ..core.base import StorageProvider
   
   class YourStorageProvider(StorageProvider):
       def save_record(self, text: str, metadata: Dict[str, Any]) -> str:
           # 保存逻辑
           pass
       
       def get_record(self, record_id: str) -> Optional[Dict[str, Any]]:
           # 获取逻辑
           pass
       
       # ... 实现其他方法
   ```

2. **在配置中指定**：
   ```yaml
   # config.yml
   storage:
     type: "your_storage"
     # ... 其他配置
   ```

---

## 配置管理

### 配置文件位置

1. **项目配置**：`config.yml`（项目根目录）
   - 包含厂商ASR配置（app_id、app_key、access_key等）
   - 包含其他系统配置

2. **用户自定义ASR配置**：`~/.voice_assistant/user_asr_config.yml`
   - 用户自己的ASR配置
   - 优先级高于项目配置

3. **数据库**：`~/.voice_assistant/history.db`
   - SQLite数据库，存储历史记录

### 配置优先级

**ASR配置**：
1. 用户自定义配置（`~/.voice_assistant/user_asr_config.yml`）
2. 项目根目录的 `config.yml`（厂商配置）
3. 默认配置

**其他配置**：
1. 项目根目录的 `config.yml`
2. 默认配置

### 配置示例

```yaml
# config.yml
asr:
  base_url: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
  app_id: "your_app_id"
  app_key: "your_app_key"
  access_key: "your_access_key"
  language: "zh-CN"

storage:
  type: "sqlite"
  path: "~/.voice_assistant/history.db"

audio:
  format: "WAV"
  channels: 1
  rate: 16000
  chunk: 1024
  device: null  # null表示使用默认设备

ui:
  theme: "light"
  position:
    x: 100
    y: 100
  size:
    width: 400
    height: 300
```

---

## 部署架构

### 开发环境

```
┌─────────────────────────────────────┐
│  Terminal 1: Python API Server     │
│  python api_server.py               │
│  → http://127.0.0.1:8765            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Terminal 2: Electron Frontend     │
│  cd electron-app                    │
│  npm run dev                        │
│  → Vite Dev Server (localhost:5173) │
└─────────────────────────────────────┘
```

### 生产环境（打包后）

```
┌─────────────────────────────────────┐
│  Electron App (打包后)              │
│  ├─ Electron Main Process          │
│  │  └─ 自动启动Python API Server    │
│  └─ Renderer Process (React)        │
│     └─ 连接本地API Server          │
└─────────────────────────────────────┘
```

### 独立部署（仅API服务器）

```
┌─────────────────────────────────────┐
│  Python API Server                  │
│  python api_server.py               │
│  → http://127.0.0.1:8765            │
└─────────────────────────────────────┘
         │
         │ HTTP/WebSocket
         │
┌────────▼────────────────────────────┐
│  任何前端框架                        │
│  (Web、移动端、其他桌面应用等)        │
└─────────────────────────────────────┘
```

---

## 关键设计决策

### 1. 前后端分离

**原因**：
- 便于替换前端框架
- 后端可以独立部署和使用
- 支持多端接入（Web、移动端等）

### 2. WebSocket实时推送

**原因**：
- ASR识别是流式的，需要实时推送结果
- 减少轮询开销
- 更好的用户体验

### 3. 插件化架构

**原因**：
- 支持多种ASR和存储提供商
- 便于扩展和维护
- 配置驱动，无需修改核心代码

### 4. BlockEditor设计

**原因**：
- 支持实时编辑和显示
- 根据`is_definite_utterance`标志管理文本块
- 提供更好的用户体验

### 5. 配置优先级机制

**原因**：
- 支持用户自定义配置
- 保留厂商配置作为后备
- 灵活的配置管理

---

## 安全考虑

1. **CORS配置**：开发环境允许所有来源，生产环境应限制为特定域名
2. **配置文件安全**：`config.yml`包含敏感信息，已添加到`.gitignore`
3. **Content Security Policy (CSP)**：Electron中设置了CSP策略
4. **本地通信**：API服务器默认只监听`127.0.0.1`，不对外暴露

---

## 性能优化

1. **异步处理**：使用FastAPI的异步特性处理并发请求
2. **流式处理**：音频和ASR识别采用流式处理，减少延迟
3. **WebSocket连接管理**：自动清理断开的连接
4. **事件循环管理**：正确处理异步事件循环，避免阻塞

---

## 故障处理

1. **API服务器连接失败**：前端自动重试连接
2. **WebSocket断开**：自动重连机制（3秒后重试）
3. **ASR服务失败**：通过错误回调通知前端
4. **音频设备问题**：日志记录和错误提示

---

## 未来扩展

1. **更多ASR提供商**：百度、讯飞等
2. **翻译功能**：集成翻译API
3. **历史记录界面**：更完善的记录查看和管理
4. **多语言支持**：国际化支持
5. **云端同步**：历史记录云端同步
6. **语音命令**：支持语音控制应用

---

## 相关文档

- [BlockEditor流程说明](./BlockEditor_Flow.md)
- [API接口文档](./ARCHITECTURE_API.md)（待完善）
- [配置说明](./CONFIG.md)（待完善）

---

**文档版本**：1.0.0  
**最后更新**：2024年

