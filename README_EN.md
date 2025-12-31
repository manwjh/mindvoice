# MindVoice

An AI-powered cross-platform desktop voice assistant that integrates Automatic Speech Recognition (ASR) and Large Language Models (LLM), providing multiple intelligent voice applications.

**Architecture**: Electron frontend + Python API backend (separated architecture for easy frontend framework replacement)

**Version**: 1.1.0 | **Release Date**: 2025-12-31

## ✨ Core Features

- 🎤 **Real-time Speech Recognition** - Streaming ASR with real-time transcription
- 🤖 **AI LLM Integration** - Based on LiteLLM, supporting 100+ LLM services
- 📝 **Voice Notes** - Real-time recording and editing with block editor
- 💬 **Voice Assistant** - AI conversation with voice input and intelligent responses
- 🧘 **Zen App** - Chat with Zen Master for spiritual peace
- 💾 **History Management** - SQLite storage with app classification
- 🔌 **Plugin Architecture** - Extensible ASR and LLM providers
- 🎯 **System Tray** - Convenient system tray control

## 🎯 Three Main Applications

### 1. 📝 Voice Notes (VoiceNote)
Real-time voice-to-text recording tool with block editor and live editing.

**Features**:
- Streaming ASR real-time recognition
- Intelligent segmentation (based on utterance)
- Pause/resume support
- One-click save and copy

### 2. 💬 Voice Assistant (VoiceChat)
Voice conversation with AI, voice input with text responses.

**Features**:
- Voice input to text
- LLM intelligent responses
- Conversation history
- Multi-turn dialogue support

### 3. 🧘 Zen App (VoiceZen)
Chat with "Little Zen Monk" for Zen wisdom and spiritual peace.

**Highlights**:
- Role-playing conversation
- Zen aesthetic design
- Wooden fish interactive animation
- Immersive experience

## 🏗️ Architecture

This project adopts a multi-app architecture with separated frontend and backend:

- **Backend**: Python API server (FastAPI + WebSocket)
- **Frontend**: Electron + React + TypeScript (Multi-app architecture)
- **Communication**: HTTP REST API + WebSocket real-time streaming
- **AI Services**: ASR (Volcano Engine) + LLM (LiteLLM)

Detailed architecture documentation:
- [System Architecture](docs/ARCHITECTURE.md)
- [Multi-App Architecture](docs/MULTI_APP_ARCHITECTURE.md)
- [LLM Integration Guide](docs/LLM_INTEGRATION.md)

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- npm or yarn
- macOS / Linux / Windows

### Installation

1. **Clone the repository**:
```bash
git clone <repository-url>
cd 语音桌面助手
```

2. **Create Python virtual environment**:
```bash
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

3. **Install Python dependencies**:
```bash
pip install -r requirements.txt
```

4. **Install Electron frontend dependencies**:
```bash
cd electron-app
npm install
cd ..
```

5. **Configure services**:

Copy the configuration template:
```bash
cp config.yml.example config.yml
```

Edit `config.yml` and fill in the necessary configurations:
- **ASR Config**: Volcano Engine's app_id, app_key, access_key
- **LLM Config**: Your chosen LLM service's api_key, model, etc.

**Important**: `config.yml` contains sensitive information and is added to `.gitignore`.

Detailed configuration guides:
- [LLM Integration Guide](docs/LLM_INTEGRATION.md)
- [Configuration Example](config.yml.example)

6. **Start the application**:

**Using quick start script (Recommended)**:
```bash
./quick_start.sh
```

**Or start manually**:
```bash
# Terminal 1: Start Python API server
source venv/bin/activate
python api_server.py

# Terminal 2: Start Electron frontend
cd electron-app
npm run dev
```

7. **Stop the application**:
```bash
./stop.sh
```

## 📁 Project Structure

```
语音桌面助手/
├── src/                          # Python backend source code
│   ├── api/                      # API service layer (FastAPI)
│   ├── core/                     # Core modules (config, plugin management)
│   ├── providers/                # Provider implementations
│   │   ├── asr/                  # ASR providers (Volcano Engine, etc.)
│   │   ├── llm/                  # LLM providers (LiteLLM)
│   │   └── storage/              # Storage providers (SQLite)
│   ├── services/                 # Business services
│   │   ├── voice_service.py      # Voice service
│   │   └── llm_service.py        # LLM service
│   ├── prompts/                  # AI role prompts
│   │   └── zen_master_prompt.py  # Zen Master prompt
│   └── utils/                    # Utility modules
│
├── electron-app/                 # Electron frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── apps/             # Application components
│   │   │   │   ├── VoiceNote/    # Voice Notes
│   │   │   │   ├── VoiceChat/    # Voice Assistant
│   │   │   │   └── VoiceZen/     # Zen App
│   │   │   └── shared/           # Shared components
│   │   ├── utils/                # Utility functions
│   │   ├── version.ts            # Version configuration
│   │   └── App.tsx               # Main application
│   └── electron/                 # Electron main process
│
├── docs/                         # Project documentation
│   ├── ARCHITECTURE.md           # System architecture
│   ├── MULTI_APP_ARCHITECTURE.md # Multi-app architecture
│   ├── LLM_INTEGRATION.md        # LLM integration guide
│   └── ...                       # Other docs
│
├── config.yml                    # Configuration file (create yourself)
├── config.yml.example            # Configuration template
├── requirements.txt              # Python dependencies
├── api_server.py                 # API server startup script
├── quick_start.sh                # Quick start script
└── stop.sh                       # Stop script
```

## 📖 Usage Guide

### Voice Notes (VoiceNote)
1. Click the 📝 icon in sidebar to enter Voice Notes
2. Click "Start Recording" to begin speech recognition
3. Real-time display of recognition results, editable
4. Click "Pause" to pause recording
5. Click "Stop and Save" to save to history

### Voice Assistant (VoiceChat)
1. Click the 💬 icon in sidebar to enter Voice Assistant
2. Click the microphone button for voice input
3. AI will automatically answer your questions
4. Supports multi-turn dialogue with context

### Zen App (VoiceZen)
1. Click the 🧘 icon in sidebar to enter Zen App
2. Click the wooden fish icon to start chatting with Little Zen Monk
3. Enjoy a Zen conversation experience
4. Click "Goodbye" to exit the conversation

### Common Features
- **History** (📚): View history from all apps
- **Settings** (⚙️): Configure application parameters
- **System Tray**: Minimize to tray, quick access

## 🔧 Extension Development

### Adding a New Application

Refer to [Multi-App Architecture Guide](docs/MULTI_APP_ARCHITECTURE.md) for detailed instructions:

1. Create a new app directory in `electron-app/src/components/apps/`
2. Implement the app component
3. Update `Sidebar.tsx` and `App.tsx`
4. Reuse shared services (ASR, LLM, Storage)

### Adding a New ASR Provider

1. Create a new file in `src/providers/asr/`
2. Inherit from `ASRProvider` and implement methods
3. Load it in `src/api/server.py`
4. Specify in configuration file

### Adding a New LLM Provider

The project uses LiteLLM, which supports 100+ LLM services. Just configure in `config.yml`.

See: [LLM Integration Guide](docs/LLM_INTEGRATION.md)

## 📊 Development Status

### ✅ Completed Features

**Core Architecture**:
- ✅ Frontend-backend separation architecture
- ✅ Multi-app architecture design
- ✅ Plugin system
- ✅ Configuration management system

**AI Service Integration**:
- ✅ ASR integration (Volcano Engine streaming recognition)
- ✅ LLM integration (LiteLLM, supporting multiple models)
- ✅ Real-time WebSocket communication
- ✅ Streaming response handling

**Three Main Applications**:
- ✅ Voice Notes app (full features)
- ✅ Voice Assistant app (full features)
- ✅ Zen App (UI framework, to be refined)

**Data Management**:
- ✅ SQLite storage
- ✅ History management
- ✅ App-classified records
- ✅ Pagination loading

**User Interface**:
- ✅ Modern UI design
- ✅ Real-time status indicators
- ✅ Toast notification system
- ✅ Block editor
- ✅ System tray integration

### ⏳ Upcoming Features

- ⏳ Complete dialogue features for Zen App
- ⏳ Text-to-Speech (TTS)
- ⏳ More ASR providers (Baidu, iFlytek, etc.)
- ⏳ Cloud synchronization
- ⏳ Multi-language UI
- ⏳ Keyboard shortcuts

## 🛠️ Tech Stack

### Backend
- **Python 3.9+** - Core language
- **FastAPI** - High-performance API framework
- **WebSocket** - Real-time bidirectional communication
- **sounddevice** - Audio recording
- **aiohttp** - Async HTTP client
- **SQLite** - Lightweight database
- **LiteLLM** - Unified LLM interface

### Frontend
- **Electron** - Cross-platform desktop framework
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **CSS3** - Modern styling

### AI Services
- **Volcano Engine ASR** - Speech recognition
- **LiteLLM** - Supports OpenAI, Claude, Qwen, and 100+ LLMs

## 🔌 Extensibility

The project adopts a highly modular plugin architecture:

1. **New Applications** - Based on multi-app framework, easily add new features
2. **New ASR Providers** - Inherit from `ASRProvider` interface
3. **New LLM Providers** - LiteLLM natively supports 100+ models
4. **New Storage Solutions** - Inherit from `StorageProvider` interface
5. **New Frontend Frameworks** - Use unified REST API and WebSocket

## 📡 API Endpoints

- **HTTP REST API**: `http://127.0.0.1:8765/api/`
- **WebSocket**: `ws://127.0.0.1:8765/ws`

Main endpoints:
- `/api/recording/*` - Recording control
- `/api/llm/*` - LLM conversation
- `/api/records/*` - History management
- `/api/audio/*` - Audio device management

For detailed API documentation, please refer to [System Architecture](docs/ARCHITECTURE.md)

## 📚 Documentation

- [System Architecture](docs/ARCHITECTURE.md) - Complete architecture design
- [Multi-App Architecture](docs/MULTI_APP_ARCHITECTURE.md) - How to add new apps
- [LLM Integration Guide](docs/LLM_INTEGRATION.md) - LLM configuration and usage
- [Optimization Guide](docs/OPTIMIZATION_GUIDE.md) - Performance optimization tips
- [Version Management](docs/VERSION_MANAGEMENT.md) - Version number management
- [Zen App Design](docs/ZEN_APP_DESIGN.md) - Zen App design documentation

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

**Contribution Areas**:
- 🐛 Bug fixes
- ✨ New features
- 📝 Documentation improvements
- 🎨 UI/UX enhancements
- 🌍 Internationalization support

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Shenzhen Wang & AI**
- Email: manwjh@126.com
- Project: MindVoice v1.0.0
- Date: 2025-12-31

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [Electron](https://www.electronjs.org/) - Cross-platform desktop app framework
- [React](https://react.dev/) - Excellent UI library
- [LiteLLM](https://github.com/BerriAI/litellm) - Unified LLM interface
- [Volcano Engine](https://www.volcengine.com/) - ASR speech recognition service

---

**⭐ If this project helps you, please give it a Star!**

