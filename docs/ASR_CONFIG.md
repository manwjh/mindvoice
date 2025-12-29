# ASR 配置指南

## 配置文件位置

配置文件位于：`~/.voice_assistant/config.json`

首次运行应用时，如果没有配置文件，会自动创建默认配置。

## 快速设置

### 方法一：使用示例配置文件（推荐）

```bash
# 复制示例配置文件
cp config.example.json ~/.voice_assistant/config.json

# 编辑配置文件
nano ~/.voice_assistant/config.json
# 或使用其他编辑器
vim ~/.voice_assistant/config.json
```

### 方法二：手动创建配置文件

```bash
# 创建配置目录（如果不存在）
mkdir -p ~/.voice_assistant

# 创建配置文件
cat > ~/.voice_assistant/config.json << 'EOF'
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
EOF
```

## 配置火山引擎 ASR

### 1. 获取火山引擎 API 密钥

1. 访问 [火山引擎控制台](https://console.volcengine.com/)
2. 创建应用或使用现有应用
3. 获取以下信息：
   - `app_id`: 应用ID
   - `app_key`: 应用密钥（或使用 app_id）
   - `access_key`: 访问密钥

### 2. 编辑配置文件

编辑 `~/.voice_assistant/config.json`：

```json
{
  "asr": {
    "provider": "volcano",
    "language": "zh-CN",
    "providers": {
      "volcano": {
        "base_url": "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
        "app_id": "8388344882",
        "app_key": "5601174773",
        "access_key": "fKhAiD6JYNhYUz0lUb8XjEBve0N_si0x"
      }
    }
  },
  "storage": {
    "type": "sqlite",
    "path": "~/.voice_assistant/history.db"
  },
  "audio": {
    "format": "WAV",
    "channels": 1,
    "rate": 16000,
    "chunk": 1024
  }
}
```

**重要：** 将示例中的密钥替换为你自己的真实密钥！

### 3. 验证配置

运行应用，如果配置正确，会使用火山引擎 ASR。如果配置错误或未配置，会回退到示例 ASR（仅用于测试）。

## 配置示例 ASR（测试用）

如果你想使用示例 ASR（不需要 API 密钥，但只能返回测试文本）：

```json
{
  "asr": {
    "provider": "example",
    "language": "zh-CN",
    "providers": {}
  }
}
```

## 配置语言

支持的语言代码：

- `zh-CN`: 中文（简体）
- `en-US`: 英语（美式）

在配置文件中设置：

```json
{
  "asr": {
    "provider": "volcano",
    "language": "zh-CN"
  }
}
```

## 完整配置示例

```json
{
  "asr": {
    "provider": "volcano",
    "language": "zh-CN",
    "providers": {
      "volcano": {
        "base_url": "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
        "app_id": "your_app_id",
        "app_key": "your_app_key",
        "access_key": "your_access_key"
      }
    }
  },
  "storage": {
    "type": "sqlite",
    "path": "~/.voice_assistant/history.db"
  },
  "audio": {
    "format": "WAV",
    "channels": 1,
    "rate": 16000,
    "chunk": 1024
  },
  "ui": {
    "theme": "light",
    "position": {
      "x": 100,
      "y": 100
    },
    "size": {
      "width": 500,
      "height": 400
    }
  }
}
```

## 配置说明

### ASR 配置字段

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `provider` | string | ASR 提供商名称（`volcano` 或 `example`） | 是 |
| `language` | string | 识别语言（`zh-CN` 或 `en-US`） | 是 |
| `providers.volcano.base_url` | string | 火山引擎 WebSocket 地址 | 是 |
| `providers.volcano.app_id` | string | 火山引擎应用ID | 是 |
| `providers.volcano.app_key` | string | 火山引擎应用密钥 | 是 |
| `providers.volcano.access_key` | string | 火山引擎访问密钥 | 是 |

### 音频配置字段

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `audio.format` | string | 音频格式 | `WAV` |
| `audio.channels` | number | 声道数（1=单声道，2=立体声） | `1` |
| `audio.rate` | number | 采样率（Hz） | `16000` |
| `audio.chunk` | number | 每次读取的帧数 | `1024` |

## 验证配置

### 方法一：运行应用测试

```bash
# 运行应用
./quick_start.sh

# 或
python api_server.py
```

如果配置正确，应用会使用配置的 ASR 提供商。如果配置错误，会在终端显示错误信息。

### 方法二：检查配置文件格式

```bash
# 使用 Python 验证 JSON 格式
python3 -m json.tool ~/.voice_assistant/config.json
```

如果格式正确，会输出格式化的 JSON。如果有错误，会显示错误信息。

## 常见问题

### Q: 配置文件在哪里？

A: 配置文件位于 `~/.voice_assistant/config.json`（即 `$HOME/.voice_assistant/config.json`）

### Q: 如何查看当前配置？

A: 
```bash
cat ~/.voice_assistant/config.json
```

### Q: 配置错误怎么办？

A: 
1. 检查 JSON 格式是否正确
2. 检查 API 密钥是否正确
3. 查看终端错误信息
4. 可以删除配置文件重新创建：`rm ~/.voice_assistant/config.json`

### Q: 如何切换 ASR 提供商？

A: 修改配置文件中的 `asr.provider` 字段：
- `"volcano"`: 使用火山引擎 ASR
- `"example"`: 使用示例 ASR（测试用）

### Q: 如何测试配置是否生效？

A: 
1. 运行应用
2. 点击"开始"录音
3. 说几句话
4. 点击"停止"
5. 查看识别结果

如果使用火山引擎，会返回真实的识别结果。如果使用示例 ASR，会返回测试文本。

## 安全提示

⚠️ **重要：不要将配置文件提交到版本控制系统！**

配置文件包含敏感的 API 密钥，应该：

1. 添加到 `.gitignore`
2. 不要分享给他人
3. 定期更换密钥
4. 使用环境变量（未来支持）

## 下一步

配置完成后，可以：

1. 运行应用测试：`./quick_start.sh`
2. 查看使用说明：`README.md`
3. 查看架构文档：`ARCHITECTURE.md`
