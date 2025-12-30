# 语音桌面助手 - Electron前端

这是语音桌面助手的Electron前端应用。采用前后端分离架构，前端可以轻松替换为其他框架（如Tauri、Web等）。

## 架构设计

```
┌─────────────────────────────────┐
│  Electron前端（React）          │
│  - UI界面                       │
│  - 实时文本显示                  │
│  - 按钮控制                      │
└────────────┬────────────────────┘
             │ HTTP/WebSocket
┌────────────▼────────────────────┐
│  Python API服务器（FastAPI）     │
│  - 音频采集                      │
│  - ASR服务                       │
│  - 存储服务                      │
└─────────────────────────────────┘
```

**关键设计原则：**
- 前后端完全分离，通过HTTP/WebSocket通信
- Python后端作为独立服务，可以被任何前端调用
- Electron只负责UI和进程管理
- 便于后续替换前端框架（Tauri、Web等）

## 技术栈

- **Electron**: 跨平台桌面应用框架
- **React**: UI框架
- **TypeScript**: 类型安全
- **Vite**: 构建工具
- **FastAPI**: Python后端API服务

## 开发

### 前置要求

1. **Node.js**: 18+
   ```bash
   node --version
   ```

2. **Python**: 3.9+
   ```bash
   python --version
   ```

3. **系统依赖**:
   - macOS: Xcode Command Line Tools
   - Windows: Visual Studio Build Tools
   - Linux: 开发工具和库

### 安装依赖

```bash
cd electron-app
npm install
```

### 启动开发服务器

**步骤1**: 启动Python API服务器（在项目根目录）

```bash
# 在项目根目录
python api_server.py
```

**步骤2**: 启动Electron应用（在electron-app目录）

```bash
cd electron-app
npm run dev
```

这会同时启动：
- Vite开发服务器（http://localhost:5173）
- Electron应用窗口

### 构建

```bash
# 构建前端
npm run build

# 打包Electron应用
npm run pack

# 构建分发包
npm run dist
```

## 项目结构

```
electron-app/
├── electron/           # Electron主进程代码
│   ├── main.ts       # 主进程入口
│   └── preload.ts    # Preload脚本
├── src/              # React前端代码
│   ├── App.tsx      # 主应用组件
│   ├── main.tsx     # 入口文件
│   └── styles.css   # 样式文件
├── assets/           # 静态资源
├── package.json      # 项目配置
└── vite.config.ts   # Vite配置
```

## API通信

前端通过以下方式与Python后端通信：

1. **HTTP REST API**: 控制操作（开始/暂停/停止录音）
   - 端点: `http://127.0.0.1:8765/api/`
   - 方法: POST

2. **WebSocket**: 实时文本和状态更新
   - 端点: `ws://127.0.0.1:8765/ws`
   - 消息类型: `initial_state`, `text_update`, `text_final`, `state_change`, `error`

## 配置

API服务器地址在 `src/App.tsx` 中配置：

```typescript
const API_BASE_URL = 'http://127.0.0.1:8765';
const WS_URL = 'ws://127.0.0.1:8765/ws';
```

## 替换前端框架

由于采用了前后端分离架构，替换前端框架非常简单：

1. **替换为Tauri**: 只需修改前端代码，API接口保持不变
2. **替换为Web应用**: 部署Python API服务器，前端使用任何Web框架
3. **替换为移动应用**: 使用相同的API接口开发移动端

## 故障排除

### Python服务器启动失败

确保Python依赖已安装：
```bash
pip install -r requirements.txt
```

### Electron窗口空白

1. 确保Vite开发服务器正在运行
2. 检查控制台错误信息
3. 确保Python API服务器已启动

### WebSocket连接失败

确保Python API服务器正在运行：
```bash
python api_server.py
```

## 打包说明

打包后的应用会包含：
- Electron运行时
- React前端（打包后的静态文件）
- Python API服务器脚本（需要用户安装Python）

**注意**: 当前版本需要用户单独安装Python。未来可以考虑使用PyInstaller将Python后端打包为可执行文件。

