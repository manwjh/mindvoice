# 设置指南

## 快速开始

### 方式一：使用快速启动脚本（推荐）✨

最简单的方式是使用提供的快速启动脚本：

```bash
# 一键部署和运行
./quick_start.sh
```

脚本会自动完成：
- ✅ 检查 Python 环境
- ✅ 创建虚拟环境（如果不存在）
- ✅ 安装所有依赖
- ✅ 检查配置文件
- ✅ 验证安装
- ✅ 启动应用

**脚本选项：**
```bash
# 查看帮助
./quick_start.sh --help

# 仅检查环境，不运行应用
./quick_start.sh --check-only

# 重新安装依赖
./quick_start.sh --reinstall

# 清理虚拟环境
./quick_start.sh --clean
```

### 方式二：手动安装

如果你想手动控制每个步骤：

```bash
# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 配置火山引擎 ASR（可选）

如果你有火山引擎的 ASR 服务账号，可以配置使用：

1. 复制配置文件模板：
```bash
cp config.example.json ~/.voice_assistant/config.json
```

2. 编辑 `~/.voice_assistant/config.json`，填入你的火山引擎配置：
```json
{
  "asr": {
    "provider": "volcano",
    "language": "zh-CN",
    "providers": {
      "volcano": {
        "base_url": "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
        "app_id": "你的app_id",
        "app_key": "你的app_key",
        "access_key": "你的access_key"
      }
    }
  }
}
```

如果没有配置火山引擎，ASR功能将不可用。

### 3. 运行应用

```bash
python api_server.py
```

应用启动后：
- 状态栏会出现一个 🎤 图标
- 点击图标可以显示/隐藏主窗口
- 点击"开始"按钮开始录音
- 点击"暂停"暂停录音
- 点击"停止"停止并识别
- 识别结果会显示在主窗口中
- 点击"复制"按钮可以复制文本

## macOS 权限设置

首次运行时，macOS 可能会要求以下权限：

1. **麦克风权限**：用于录音
   - 系统偏好设置 → 安全性与隐私 → 隐私 → 麦克风
   - 勾选你的终端或 Python 应用

2. **辅助功能权限**（如果需要）：用于窗口控制
   - 系统偏好设置 → 安全性与隐私 → 隐私 → 辅助功能

## 配置说明

配置文件位置：`~/.voice_assistant/config.json`

### ASR 配置

```json
{
  "asr": {
    "provider": "volcano",  // 或 "example"
    "language": "zh-CN",
    "providers": {
      "volcano": {
        "base_url": "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
        "app_id": "your_app_id",
        "app_key": "your_app_key",
        "access_key": "your_access_key"
      }
    }
  }
}
```

### 音频配置

```json
{
  "audio": {
    "format": "WAV",
    "channels": 1,
    "rate": 16000,
    "chunk": 1024
  }
}
```

### 存储配置

```json
{
  "storage": {
    "type": "sqlite",
    "path": "~/.voice_assistant/history.db"
  }
}
```

## 故障排除

### 1. 无法录音

- 检查麦克风权限是否已授予
- 检查音频设备是否正常工作
- 查看终端输出的错误信息

### 2. ASR 识别失败

- 检查网络连接
- 检查火山引擎配置是否正确
- 查看终端输出的错误信息

### 3. 窗口无法显示

- 检查 PyQt6 是否正确安装
- 检查是否有其他错误信息

## 开发模式

如果你想开发或调试：

```bash
# 激活虚拟环境
source venv/bin/activate

# 运行应用
python api_server.py

# 查看日志输出
# 所有日志都会输出到终端
```

## 历史记录

所有识别结果都会自动保存到 SQLite 数据库：
- 位置：`~/.voice_assistant/history.db`
- 可以使用 SQLite 工具查看
- 未来版本会添加历史记录查看界面
