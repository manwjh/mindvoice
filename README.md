## 🎬 Demo

<img width="682" height="1001" alt="截屏2026-01-09 09 32 40" src="https://github.com/user-attachments/assets/26e80a39-4241-442d-b028-735d3257717a" />

# 语音桌面助手 (MindVoice)
一个基于AI的跨平台桌面语音助手，集成语音识别(ASR)和大语言模型(LLM)，提供多种智能语音应用。

**English**: [README_EN.md](README_EN.md) | **项目英文名**: MindVoice

**架构**: Electron前端 + Python API后端（前后端分离，便于替换前端框架）

**版本**: 1.8.2 | **发布日期**: 2026-01-06

## ✨ 核心特性

- 🎤 **实时语音识别** - 支持流式ASR，实时转文字，智能VAD语音活动检测
- 🤖 **AI大模型集成** - 基于LiteLLM，支持100+种LLM服务
- 📝 **语音笔记** - 实时记录和编辑，支持富文本块编辑器和图片粘贴
- 💬 **智能助手** - 与AI对话，支持知识库检索增强（RAG），流式智能回答
- 🧘 **禅应用** - 与一禅小和尚对话，获得心灵平静与禅意智慧
- 📚 **知识库管理** - 文档上传、向量检索，支持知识库增强对话
- 🌍 **多语言翻译** - 支持10种语言实时翻译，基于AI智能翻译
- 📦 **Markdown导出** - 一键导出笔记为Markdown格式，自动打包图片
- 💾 **历史记录** - SQLite存储，支持按应用分类和搜索
- 🔌 **插件化架构** - 可扩展ASR和LLM提供商
- 🎯 **系统托盘** - 便捷的系统托盘控制和快捷操作
- 📊 **智能摘要** - 基于Agent的内容摘要和总结功能
- 🚀 **高性能IPC通信** - Electron IPC替代WebSocket，响应速度提升50-80%

## 🎯 四大应用

### 1. 📝 语音笔记 (VoiceNote)
实时语音转文字记录工具，支持富文本块编辑器和实时编辑。

**功能**：
- 流式ASR实时识别
- 智能分段（基于utterance）
- 支持暂停/恢复录音
- 富文本格式化（加粗、斜体、标题等）
- 图片粘贴支持（Ctrl+V / Cmd+V）
- 智能摘要生成（基于Agent）
- 多语言翻译（支持10种语言）
- Markdown导出（自动打包图片）
- 一键保存和复制
- 历史记录管理

### 2. 💬 智能助手 (SmartChat)
与AI进行智能对话，支持知识库检索增强（RAG），提供更准确的回答。

**功能**：
- 文字输入对话（语音输入接口预留）
- LLM流式智能回答
- 知识库检索增强（RAG）- 可开启/关闭
- 对话历史记录
- 支持多轮对话
- 上下文理解
- 快速清空会话

### 3. 🧘 禅应用 (VoiceZen)
与"一禅小和尚"对话，获得禅宗智慧和心灵平静。

**特点**：
- 角色扮演式对话（一禅小和尚人设）
- 禅意美学设计（古朴典雅风格）
- 木鱼交互动画（敲击音效）
- 流式对话体验（逐字显示）
- 沉浸式禅境界面

### 4. 📚 知识库 (KnowledgeBase)
管理知识库文档，支持文档上传、查看和删除，为智能助手提供知识检索支持。

**功能**：
- 文档上传（支持 .md 和 .txt 格式）
- 文档列表查看
- 文档内容预览
- 文档删除管理
- 自动向量化和检索（后台处理）
- 与智能助手集成（RAG增强）

## 🏗️ 架构设计

本项目采用前后端分离的多应用架构：

- **后端**: Python API服务器（FastAPI）
- **前端**: Electron + React + TypeScript（多应用架构）
- **通信**: HTTP REST API + Electron IPC（进程间通信）
- **AI服务**: ASR（火山引擎）+ LLM（LiteLLM）+ RAG（ChromaDB）
- **数据存储**: SQLite（历史记录、会员信息）+ ChromaDB（向量数据库）

**架构亮点**：
- ✅ **IPC通信**: 使用Electron IPC替代WebSocket，响应速度提升50-80%，稳定性显著增强
- ✅ **模块化设计**: 插件化的ASR、LLM、存储提供商
- ✅ **Agent系统**: 智能摘要、智能对话、翻译等Agent
- ✅ **跨平台存储**: 统一的跨平台数据存储方案

详细架构说明请参考：
- [系统架构文档](docs/SYSTEM_ARCHITECTURE.md)
- [数据库架构](docs/DATABASE_SCHEMA.md)
- [跨平台存储](docs/CROSS_PLATFORM_STORAGE.md)
- [API参考](docs/API_REFERENCE.md)
- [图标系统](docs/ICON_SYSTEM_GUIDE.md) - 统一图标管理

## 🚀 快速开始

### 前置要求

- Python 3.9+
- Node.js 18+
- npm 或 yarn
- macOS / Linux / Windows

### 安装步骤

1. **克隆项目**：
```bash
git clone <repository-url>
cd 语音桌面助手
```

2. **创建Python虚拟环境**：
```bash
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

3. **安装Python依赖**：
```bash
pip install -r requirements.txt
```

4. **安装Electron前端依赖**：
```bash
cd electron-app
npm install
cd ..
```

5. **配置服务**：

复制配置文件模板：
```bash
cp config.yml.example config.yml
```

编辑 `config.yml`，填入必要的配置：
- **ASR配置**：火山引擎的 app_id、app_key、access_key
  - 支持双向流式优化版本（bigmodel_async，推荐）
  - 可选启用二遍识别（更准确的分句）
- **LLM配置**：选择的LLM服务的 api_key、model等
  - 支持100+种模型（OpenAI、Claude、通义千问、DeepSeek等）
  - 可自定义base_url使用兼容服务
- **VAD配置**（可选）：启用语音活动检测
  - 自动过滤静音，节约40-60%的ASR成本
  - 支持灵活的检测阈值和缓冲配置

**重要：** `config.yml` 包含敏感信息，已添加到 `.gitignore`。

详细配置说明：
- [配置示例](config.yml.example) - 完整的配置文件示例
- [跨平台存储](docs/CROSS_PLATFORM_STORAGE.md) - 跨平台数据存储配置
- [系统架构](docs/SYSTEM_ARCHITECTURE.md) - 系统架构和配置说明

6. **启动应用**：

**使用快速启动脚本（推荐）**：
```bash
./quick_start.sh
```

**或手动启动**：
```bash
# 终端1：启动Python API服务器
source venv/bin/activate
python api_server.py

# 终端2：启动Electron前端
cd electron-app
npm run dev
```

7. **停止应用**：
```bash
./stop.sh
```

## 📁 项目结构

```
语音桌面助手/
├── src/                          # Python后端源码
│   ├── api/                      # API服务层（FastAPI + WebSocket）
│   ├── core/                     # 核心模块（配置、插件、日志）
│   ├── providers/                # 提供商实现
│   │   ├── asr/                  # ASR提供商（火山引擎等）
│   │   ├── llm/                  # LLM提供商（LiteLLM）
│   │   └── storage/              # 存储提供商（SQLite）
│   ├── services/                 # 业务服务
│   │   ├── voice_service.py      # 语音服务（ASR管理）
│   │   ├── llm_service.py        # LLM服务（对话管理）
│   │   └── knowledge_service.py  # 知识库服务（RAG检索）
│   ├── agents/                   # AI智能体
│   │   ├── summary_agent.py      # 摘要生成Agent
│   │   ├── smart_chat_agent.py   # 智能对话Agent（支持RAG）
│   │   └── prompts/              # Agent提示词配置
│   ├── prompts/                  # AI角色提示词
│   │   └── zen_master_prompt.py  # 一禅小和尚提示词
│   └── utils/                    # 工具模块
│       ├── audio_recorder.py     # 音频录制
│       └── audio_asr_gateway.py  # Audio到ASR的网关控制器（统一控制层）
│
├── electron-app/                 # Electron前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── apps/             # 应用组件
│   │   │   │   ├── VoiceNote/    # 语音笔记
│   │   │   │   ├── SmartChat/    # 智能助手
│   │   │   │   ├── VoiceZen/     # 禅应用
│   │   │   │   └── KnowledgeBase/ # 知识库
│   │   │   └── shared/           # 共享组件
│   │   ├── utils/                # 工具函数
│   │   ├── version.ts            # 版本配置
│   │   └── App.tsx               # 主应用
│   └── electron/                 # Electron主进程
│
├── docs/                         # 项目文档
│   ├── SYSTEM_ARCHITECTURE.md    # 系统架构
│   ├── API_REFERENCE.md          # API参考文档
│   ├── DATABASE_SCHEMA.md        # 数据库架构
│   ├── IMAGE_HANDLING.md         # 图片处理文档
│   ├── CROSS_PLATFORM_STORAGE.md # 跨平台存储
│   ├── ICON_SYSTEM_GUIDE.md      # 图标系统指南
│   ├── build/                    # 构建和打包文档
│   └── ...                       # 其他文档
│
├── config.yml                    # 配置文件（需自行创建）
├── config.yml.example            # 配置模板
├── requirements.txt              # Python依赖
├── api_server.py                 # API服务器启动脚本
├── quick_start.sh                # 快速启动脚本
└── stop.sh                       # 停止脚本
```

## ⚙️ 配置说明

### 快速配置指南

1. **复制配置模板**：
```bash
cp config.yml.example config.yml
```

2. **准备ASR服务**（必需）：
   - 推荐：[火山引擎语音识别](https://www.volcengine.com/product/sami-asr)
   - 其他选择：阿里云、腾讯云、百度AI等
   - 获取：`app_id`、`app_key`、`access_key`

3. **准备LLM服务**（必需）：
   - 支持：OpenAI、DeepSeek、通义千问、Kimi等100+模型
   - 获取：`api_key` 和 `base_url`

4. **编辑 config.yml**，填入你的服务配置

详细配置说明见下文各小节 ↓

### ASR配置（火山引擎）

项目支持火山引擎的多种ASR版本：

1. **bigmodel_async**（推荐）：双向流式优化版本
   - 实时性最佳，支持二遍识别
   - 适合实时转写场景

2. **bigmodel**：双向流式普通版本
   - 每包输入对应每包返回
   - 平衡延迟和准确率

3. **bigmodel_nostream**：流式输入模式
   - 准确率最高，延迟较大
   - 适合离线转写场景

**二遍识别**：启用后可以在保持实时性的同时提高准确率，先返回实时结果，后返回优化结果。

### VAD语音活动检测

VAD可以自动检测和过滤静音片段，显著降低ASR成本：

**优势**：
- 节约40-60%的ASR成本（不发送静音音频）
- 自动过滤噪音和间隙
- 可配置的检测阈值和缓冲机制

**配置要点**：
```yaml
vad:
  enabled: true                    # 启用VAD
  mode: 2                          # 敏感度 0-3（推荐2）
  speech_start_threshold: 2        # 语音开始阈值
  speech_end_threshold: 10         # 语音结束阈值
  pre_speech_padding_ms: 100       # 语音前缓冲
  post_speech_padding_ms: 300      # 语音后缓冲
```

**安装**：需要安装 `webrtcvad` 库
```bash
pip install webrtcvad
```

### 音频缓冲区管理

为了支持长时间录音（如1小时演讲），系统提供了智能缓冲区管理机制：

**问题**：长时间录音会导致内存持续累积，最终导致延迟增加和性能下降。

**解决方案**：自动清理旧的音频数据，只保留最近的音频。

**配置**：
```yaml
audio:
  max_buffer_seconds: 60  # 最大缓冲时长（秒）
```

**说明**：
- 默认保留最近60秒的音频数据
- 超过限制后自动清理旧数据（保留50%）
- 不影响实时ASR识别（数据已流式发送）
- 适合长时间录音场景
- 内存占用：16kHz单声道约1.92MB/60秒

**建议配置**：
- 语音识别：60秒（默认）
- 高质量录音：120-180秒
- 极限长时：60秒（最小化内存）

**注意**：此功能已内置，无需额外配置

### LLM配置

支持100+种LLM服务，通过LiteLLM统一接口：

**热门服务**：
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- 阿里云（通义千问）
- DeepSeek
- 自定义OpenAI兼容服务

**配置示例**：
```yaml
llm:
  provider: perfxcloud-专线
  api_key: "your-api-key"
  base_url: https://api.example.com/v1
  model: openai/Qwen3-Next-80B-Instruct
  max_context_tokens: 128000
```

详见：[LLM集成指南](docs/LLM_INTEGRATION.md)

### 知识库配置（可选）

知识库功能用于智能助手的检索增强（RAG），需要安装额外的依赖：

**依赖安装**：
```bash
pip install sentence-transformers>=2.2.2 chromadb>=0.4.22
```

**说明**：
- 知识库使用 ChromaDB 作为向量数据库
- 使用 `all-MiniLM-L6-v2` 作为默认 Embedding 模型（轻量级，约80MB）
- 支持延迟加载模式，启动时不阻塞，模型在后台加载
- 文档存储路径：由 `config.yml` 的 `storage.data_dir/storage.knowledge` 配置决定
- 支持的文件格式：`.md` 和 `.txt`

**注意**：如果未安装知识库依赖，智能助手仍可正常使用，但无法使用知识库检索增强功能。

## 📖 使用说明

### 语音笔记 (VoiceNote)
1. 点击侧边栏 📝 图标进入语音笔记
2. 点击"开始录音"按钮开始语音识别
3. 实时显示识别结果，支持实时编辑
4. 使用格式工具栏进行富文本编辑（加粗、斜体、标题等）
5. 使用 Ctrl+V / Cmd+V 粘贴图片到笔记中
6. 点击"暂停"可暂停录音，点击"恢复"继续
7. 点击"生成摘要"获取AI智能摘要
8. 点击"翻译"选择目标语言进行翻译（支持10种语言）
9. 点击"导出"下载Markdown格式笔记（自动打包图片）
10. 点击"停止并保存"保存到历史记录
11. 支持复制、删除等操作

### 智能助手 (SmartChat)
1. 点击侧边栏 💬 图标进入智能助手
2. 在输入框中输入问题（语音输入接口预留）
3. 可选择开启/关闭知识库检索增强
4. AI流式回答你的问题（逐字显示）
5. 支持多轮对话，保持上下文
6. 如果开启了知识库，AI会优先使用知识库内容回答
7. 点击"清空会话"开始新对话

### 知识库 (KnowledgeBase)
1. 点击侧边栏 📚 图标进入知识库
2. 点击"上传文件"按钮选择文档（.md 或 .txt）
3. 上传后文档会自动进行向量化处理
4. 在文件列表中查看已上传的文档
5. 点击文档可预览内容
6. 删除不需要的文档
7. 知识库文档会自动用于智能助手的检索增强

### 禅应用 (VoiceZen)
1. 点击侧边栏 🧘 图标进入禅应用
2. 点击木鱼图标开始与一禅小和尚对话
3. 使用语音或文字输入你的困惑
4. 一禅小和尚会以禅宗智慧回答（流式显示）
5. 享受禅意的界面和交互体验
6. 点击"再见"或关闭退出对话

### 通用功能
- **历史记录** (📋)：查看和搜索所有应用的历史记录，支持按应用筛选
- **设置** (⚙️)：配置应用参数、音频设备、主题等
- **关于** (ℹ️)：查看版本信息、开发者信息
- **系统托盘**：最小化到托盘，快速显示/隐藏窗口，退出应用

## 🔧 扩展开发

### 添加新的应用

参考现有应用的实现（VoiceNote、SmartChat、VoiceZen）：

1. 在 `electron-app/src/components/apps/` 创建新应用目录
2. 实现应用组件（参考 VoiceNote.tsx）
3. 在 `src/api/server.py` 添加对应的API端点
4. 更新 `Sidebar.tsx` 和 `App.tsx`
5. 可复用共享服务（ASR、LLM、存储）

### 添加新的 ASR 提供商

1. 在 `src/providers/asr/` 创建新文件
2. 继承 `ASRProvider` 并实现方法
3. 在 `src/api/server.py` 中加载
4. 在配置文件中指定

### 添加新的 LLM 提供商

项目使用 LiteLLM，支持100+种LLM服务，只需在 `config.yml` 中配置即可：

```yaml
llm:
  provider: your-provider
  api_key: "your-api-key"
  base_url: https://api.example.com/v1
  model: your-model-name
  max_context_tokens: 128000
```

支持的提供商包括：OpenAI、Claude、通义千问、DeepSeek、文心一言等。

## 📊 开发状态

### ✅ 已完成功能

**核心架构**：
- ✅ 前后端分离架构
- ✅ 多应用架构设计
- ✅ 插件化系统
- ✅ 配置管理系统
- ✅ IPC进程间通信（替代WebSocket，性能提升50-80%）
- ✅ 跨平台数据存储方案

**AI服务集成**：
- ✅ ASR集成（火山引擎流式识别，支持双向流式优化）
- ✅ VAD语音活动检测（WebRTC VAD，可选，节约40-60%成本）
- ✅ LLM集成（LiteLLM，支持100+种模型）
- ✅ 流式响应处理（实时逐字显示）
- ✅ Agent智能体系统（摘要、对话、翻译等）
- ✅ 知识库服务（ChromaDB向量存储和检索，RAG增强）

**四大应用**：
- ✅ 语音笔记应用（富文本编辑、图片支持、智能摘要、多语言翻译、Markdown导出）
- ✅ 智能助手应用（知识库检索增强、流式对话、多轮对话）
- ✅ 禅应用（一禅小和尚对话、禅意UI、木鱼交互）
- ✅ 知识库应用（文档上传、管理、向量检索）

**数据管理**：
- ✅ SQLite数据库（历史记录、元数据）
- ✅ ChromaDB向量数据库（知识库）
- ✅ 图片存储管理（Base64上传、本地存储）
- ✅ 历史记录管理（按应用分类、分页加载）
- ✅ 自动保存服务（智能保存队列）

**内容处理**：
- ✅ 图片粘贴和显示（Ctrl+V / Cmd+V）
- ✅ 多语言翻译（支持10种语言：中英日韩法德西俄意葡）
- ✅ Markdown导出（自动打包图片为ZIP）
- ✅ 智能摘要生成（基于Agent）

**用户界面**：
- ✅ 现代化UI设计（深色/浅色主题）
- ✅ 实时状态指示（ASR、API连接）
- ✅ Toast通知系统
- ✅ 富文本块编辑器（支持格式化、图片）
- ✅ 翻译面板（语言选择、译文显示）
- ✅ 系统托盘集成（最小化到托盘）
- ✅ 响应式布局

### ⏳ 待实现功能

- ⏳ 语音合成（TTS）回复
- ⏳ 智能助手语音输入集成
- ⏳ 更多ASR提供商（百度、讯飞、Azure等）
- ⏳ 离线语音识别
- ⏳ 多语言界面（国际化i18n）
- ⏳ 全局快捷键支持
- ⏳ 更多Agent智能体（纠错、润色、总结等）
- ⏳ 语音命令执行
- ⏳ 知识库支持更多文档格式（PDF、Word、HTML等）
- ⏳ PDF导出功能
- ⏳ 双语对照翻译
- ⏳ Windows和Linux平台打包
- ⏳ 自动更新功能
- ⏳ 移动端适配（React Native）

## 🛠️ 技术栈

### 后端
- **Python 3.9+** - 核心语言
- **FastAPI** - 高性能异步API框架
- **sounddevice** - 跨平台音频录制
- **webrtcvad** - VAD语音活动检测（可选，节约40-60%成本）
- **aiohttp** - 异步HTTP客户端
- **SQLite** - 轻量级嵌入式数据库
- **LiteLLM** - 统一LLM接口（支持100+种模型）
- **ChromaDB** - 向量数据库（知识库存储和检索）
- **sentence-transformers** - 文本向量化模型
- **PyYAML** - 配置文件解析

### 前端
- **Electron** - 跨平台桌面框架
- **React 18** - UI框架
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **Electron IPC** - 进程间通信（高性能）
- **CSS3** - 现代样式

### AI服务
- **火山引擎ASR** - 流式语音识别（支持双向流式优化版本bigmodel_async）
- **LiteLLM** - 支持OpenAI、Claude、通义千问、DeepSeek等100+种LLM
- **WebRTC VAD** - 智能语音活动检测，节约40-60%的ASR成本
- **ChromaDB** - 向量数据库，支持知识库文档的向量化和检索（RAG）
- **Agent系统** - 智能摘要Agent、智能对话Agent、翻译Agent

## 🔌 扩展性

项目采用高度模块化的插件架构：

1. **新应用** - 基于多应用框架，轻松添加新功能
2. **新ASR提供商** - 继承 `ASRProvider` 接口
3. **新LLM提供商** - LiteLLM原生支持100+种模型
4. **新存储方案** - 继承 `StorageProvider` 接口
5. **新前端框架** - 使用统一的REST API和WebSocket

## 📡 API接口

- **HTTP REST API**: `http://127.0.0.1:8765/api/`
- **Electron IPC**: 进程间通信（ASR实时数据流）

主要接口：
- `/api/recording/*` - 录音控制（启动、停止、暂停、恢复）
- `/api/llm/*` - LLM对话（流式响应）
- `/api/smartchat/*` - 智能助手对话（支持知识库检索RAG）
- `/api/knowledge/*` - 知识库管理（上传、查询、删除）
- `/api/records/*` - 历史记录管理（保存、加载、更新、删除）
- `/api/images/*` - 图片管理（上传、获取）
- `/api/translate` - 翻译服务（多语言翻译）
- `/api/audio/*` - 音频设备管理

详细API文档请参考 [API参考文档](docs/API_REFERENCE.md)

## 📚 文档

### 核心文档
- [系统架构](docs/SYSTEM_ARCHITECTURE.md) - 完整的架构设计说明
- [API参考](docs/API_REFERENCE.md) - API接口文档
- [快速开始](docs/GETTING_STARTED.md) - 快速入门指南
- [状态管理](docs/状态管理_简洁版.md) - 应用状态管理

### 功能文档
- [数据库架构](docs/DATABASE_SCHEMA.md) - 数据库表结构和使用
- [图片处理](docs/IMAGE_HANDLING.md) - 图片上传、存储、显示
- [跨平台存储](docs/CROSS_PLATFORM_STORAGE.md) - 跨平台数据存储方案
- [图标系统](docs/ICON_SYSTEM_GUIDE.md) - 统一图标管理和使用
- [自动保存服务](docs/AutoSaveService_技术文档.md) - 自动保存机制

### 构建和部署
- [构建指南](docs/build/BUILD_GUIDE.md) - 应用构建说明
- [打包文档](docs/build/PACKAGING.md) - 应用打包和分发
- [故障排除](docs/build/TROUBLESHOOTING.md) - 常见问题解决

### 其他文档
- [贡献指南](CONTRIBUTING.md) - 如何贡献代码
- [更新日志](CHANGELOG.md) - 版本更新历史

## 🤝 贡献

欢迎贡献！在提交代码前，请：
1. 📋 阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解贡献指南
2. ⚖️ 签署 [CLA](CLA.md) 贡献者许可协议

**贡献方向**：
- 🐛 修复Bug
- ✨ 添加新功能
- 📝 改进文档
- 🎨 优化UI/UX
- 🌍 添加国际化支持

**注意**：您的贡献可能被用于商业版本（MindVoice Pro），详见CLA。

## 📄 许可证

### 开源版本
本项目（MindVoice开源版）采用 **MIT License** - 详见 [LICENSE](LICENSE) 文件。

### 商业版本
MindVoice Pro是独立的商业产品，受专有许可协议约束。包含：
- ✅ 激活码授权系统
- ✅ 高级AI功能
- ✅ 技术支持服务

### 贡献者协议
所有贡献者需签署 [CLA](CLA.md)，授权项目维护者将贡献用于开源和商业版本。

## 👨‍💻 作者

**深圳王哥 & AI**
- Email: manwjh@126.com
- 项目: MindVoice v1.8.2
- 日期: 2026-01-06

## 🙏 致谢

- [FastAPI](https://fastapi.tiangolo.com/) - 现代化的Python异步Web框架
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [React](https://react.dev/) - 优秀的UI库
- [LiteLLM](https://github.com/BerriAI/litellm) - 统一的LLM接口
- [火山引擎](https://www.volcengine.com/) - 流式ASR语音识别服务
- [WebRTC VAD](https://github.com/wiseman/py-webrtcvad) - 高效的语音活动检测

---

**⭐ 如果这个项目对你有帮助，欢迎给个 Star！**
