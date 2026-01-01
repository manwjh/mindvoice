# 语音桌面助手 (MindVoice)

一个基于AI的跨平台桌面语音助手，集成语音识别(ASR)和大语言模型(LLM)，提供多种智能语音应用。

**English**: [README_EN.md](README_EN.md) | **项目英文名**: MindVoice

**架构**: Electron前端 + Python API后端（前后端分离，便于替换前端框架）

**版本**: 1.2.0 | **发布日期**: 2026-01-01

## ✨ 核心特性

- 🎤 **实时语音识别** - 支持流式ASR，实时转文字
- 🤖 **AI大模型集成** - 基于LiteLLM，支持多种LLM服务
- 📝 **语音笔记** - 实时记录和编辑，支持块编辑器
- 💬 **语音助手** - 与AI对话，语音输入，智能回答
- 🧘 **禅应用** - 与一禅小和尚对话，获得心灵平静
- 💾 **历史记录** - SQLite存储，支持按应用分类
- 🔌 **插件化架构** - 可扩展ASR和LLM提供商
- 🎯 **系统托盘** - 便捷的系统托盘控制

## 🎯 三大应用

### 1. 📝 语音笔记 (VoiceNote)
实时语音转文字记录工具，支持块编辑器和实时编辑。

**功能**：
- 流式ASR实时识别
- 智能分段（基于utterance）
- 支持暂停/恢复
- 一键保存和复制

### 2. 💬 语音助手 (VoiceChat)
与AI进行语音对话，语音输入，文本回答。

**功能**：
- 语音输入转文字
- LLM智能回答
- 对话历史记录
- 支持多轮对话

### 3. 🧘 禅应用 (VoiceZen)
与"一禅小和尚"对话，获得禅宗智慧和心灵平静。

**特点**：
- 角色扮演式对话
- 禅意美学设计
- 木鱼交互动画
- 沉浸式体验

## 🏗️ 架构设计

本项目采用前后端分离的多应用架构：

- **后端**: Python API服务器（FastAPI + WebSocket）
- **前端**: Electron + React + TypeScript（多应用架构）
- **通信**: HTTP REST API + WebSocket实时推送
- **AI服务**: ASR（火山引擎）+ LLM（LiteLLM）

详细架构说明请参考：
- [系统架构文档](docs/ARCHITECTURE.md)
- [多应用架构说明](docs/MULTI_APP_ARCHITECTURE.md)
- [LLM集成指南](docs/LLM_INTEGRATION.md)

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
- **LLM配置**：选择的LLM服务的 api_key、model等

**重要：** `config.yml` 包含敏感信息，已添加到 `.gitignore`。

详细配置说明：
- [LLM集成指南](docs/LLM_INTEGRATION.md)
- [配置示例](config.yml.example)

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
│   ├── api/                      # API服务层（FastAPI）
│   ├── core/                     # 核心模块（配置、插件管理）
│   ├── providers/                # 提供商实现
│   │   ├── asr/                  # ASR提供商（火山引擎等）
│   │   ├── llm/                  # LLM提供商（LiteLLM）
│   │   └── storage/              # 存储提供商（SQLite）
│   ├── services/                 # 业务服务
│   │   ├── voice_service.py      # 语音服务
│   │   └── llm_service.py        # LLM服务
│   ├── prompts/                  # AI角色提示词
│   │   └── zen_master_prompt.py  # 一禅小和尚提示词
│   └── utils/                    # 工具模块
│
├── electron-app/                 # Electron前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── apps/             # 应用组件
│   │   │   │   ├── VoiceNote/    # 语音笔记
│   │   │   │   ├── VoiceChat/    # 语音助手
│   │   │   │   └── VoiceZen/     # 禅应用
│   │   │   └── shared/           # 共享组件
│   │   ├── utils/                # 工具函数
│   │   ├── version.ts            # 版本配置
│   │   └── App.tsx               # 主应用
│   └── electron/                 # Electron主进程
│
├── docs/                         # 项目文档
│   ├── ARCHITECTURE.md           # 系统架构
│   ├── MULTI_APP_ARCHITECTURE.md # 多应用架构
│   ├── LLM_INTEGRATION.md        # LLM集成指南
│   └── ...                       # 其他文档
│
├── config.yml                    # 配置文件（需自行创建）
├── config.yml.example            # 配置模板
├── requirements.txt              # Python依赖
├── api_server.py                 # API服务器启动脚本
├── quick_start.sh                # 快速启动脚本
└── stop.sh                       # 停止脚本
```

## 📖 使用说明

### 语音笔记 (VoiceNote)
1. 点击侧边栏 📝 图标进入语音笔记
2. 点击"开始录音"按钮开始语音识别
3. 实时显示识别结果，支持编辑
4. 点击"暂停"可暂停录音
5. 点击"停止并保存"保存到历史记录

### 语音助手 (VoiceChat)
1. 点击侧边栏 💬 图标进入语音助手
2. 点击麦克风按钮进行语音输入
3. AI会自动回答你的问题
4. 支持多轮对话，保持上下文

### 禅应用 (VoiceZen)
1. 点击侧边栏 🧘 图标进入禅应用
2. 点击木鱼图标开始与一禅小和尚对话
3. 享受禅意的对话体验
4. 点击"再见"退出对话

### 通用功能
- **历史记录** (📚)：查看所有应用的历史记录
- **设置** (⚙️)：配置应用参数
- **系统托盘**：最小化到托盘，快速访问

## 🔧 扩展开发

### 添加新的应用

参考 [多应用架构文档](docs/MULTI_APP_ARCHITECTURE.md) 的详细指南：

1. 在 `electron-app/src/components/apps/` 创建新应用目录
2. 实现应用组件
3. 更新 `Sidebar.tsx` 和 `App.tsx`
4. 可复用共享服务（ASR、LLM、存储）

### 添加新的 ASR 提供商

1. 在 `src/providers/asr/` 创建新文件
2. 继承 `ASRProvider` 并实现方法
3. 在 `src/api/server.py` 中加载
4. 在配置文件中指定

### 添加新的 LLM 提供商

项目使用 LiteLLM，支持100+种LLM服务，只需在 `config.yml` 中配置即可。

详见：[LLM集成指南](docs/LLM_INTEGRATION.md)

## 📊 开发状态

### ✅ 已完成功能

**核心架构**：
- ✅ 前后端分离架构
- ✅ 多应用架构设计
- ✅ 插件化系统
- ✅ 配置管理系统

**AI服务集成**：
- ✅ ASR集成（火山引擎流式识别）
- ✅ LLM集成（LiteLLM，支持多种模型）
- ✅ 实时WebSocket通信
- ✅ 流式响应处理

**三大应用**：
- ✅ 语音笔记应用（完整功能）
- ✅ 语音助手应用（完整功能）
- ✅ 禅应用（UI框架，待完善）

**数据管理**：
- ✅ SQLite存储
- ✅ 历史记录管理
- ✅ 按应用分类记录
- ✅ 分页加载

**用户界面**：
- ✅ 现代化UI设计
- ✅ 实时状态指示
- ✅ Toast通知系统
- ✅ 块编辑器
- ✅ 系统托盘集成

### ⏳ 待实现功能

- ⏳ 禅应用的完整对话功能
- ⏳ 语音合成（TTS）
- ⏳ 更多ASR提供商（百度、讯飞等）
- ⏳ 云端同步
- ⏳ 多语言界面
- ⏳ 快捷键支持

## 🛠️ 技术栈

### 后端
- **Python 3.9+** - 核心语言
- **FastAPI** - 高性能API框架
- **WebSocket** - 实时双向通信
- **sounddevice** - 音频录制
- **aiohttp** - 异步HTTP客户端
- **SQLite** - 轻量级数据库
- **LiteLLM** - 统一LLM接口

### 前端
- **Electron** - 跨平台桌面框架
- **React 18** - UI框架
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **CSS3** - 现代样式

### AI服务
- **火山引擎ASR** - 语音识别
- **LiteLLM** - 支持OpenAI、Claude、通义千问等100+种LLM

## 🔌 扩展性

项目采用高度模块化的插件架构：

1. **新应用** - 基于多应用框架，轻松添加新功能
2. **新ASR提供商** - 继承 `ASRProvider` 接口
3. **新LLM提供商** - LiteLLM原生支持100+种模型
4. **新存储方案** - 继承 `StorageProvider` 接口
5. **新前端框架** - 使用统一的REST API和WebSocket

## 📡 API接口

- **HTTP REST API**: `http://127.0.0.1:8765/api/`
- **WebSocket**: `ws://127.0.0.1:8765/ws`

主要接口：
- `/api/recording/*` - 录音控制
- `/api/llm/*` - LLM对话
- `/api/records/*` - 历史记录管理
- `/api/audio/*` - 音频设备管理

详细API文档请参考 [系统架构文档](docs/ARCHITECTURE.md)

## 📚 文档

- [系统架构](docs/ARCHITECTURE.md) - 完整的架构设计说明
- [多应用架构](docs/MULTI_APP_ARCHITECTURE.md) - 如何添加新应用
- [LLM集成指南](docs/LLM_INTEGRATION.md) - LLM配置和使用
- [优化指南](docs/OPTIMIZATION_GUIDE.md) - 性能优化建议
- [版本管理](docs/VERSION_MANAGEMENT.md) - 版本号管理规范
- [禅应用设计](docs/ZEN_APP_DESIGN.md) - 禅应用的设计文档

## 🤝 贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解贡献指南。

**贡献方向**：
- 🐛 修复Bug
- ✨ 添加新功能
- 📝 改进文档
- 🎨 优化UI/UX
- 🌍 添加国际化支持

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 👨‍💻 作者

**深圳王哥 & AI**
- Email: manwjh@126.com
- 项目: MindVoice v1.0.0
- 日期: 2025-12-31

## 🙏 致谢

- [FastAPI](https://fastapi.tiangolo.com/) - 现代化的Python Web框架
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [React](https://react.dev/) - 优秀的UI库
- [LiteLLM](https://github.com/BerriAI/litellm) - 统一的LLM接口
- [火山引擎](https://www.volcengine.com/) - ASR语音识别服务

---

**⭐ 如果这个项目对你有帮助，欢迎给个 Star！**
