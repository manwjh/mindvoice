# 配置文件说明

## 配置文件位置

项目使用 **`config.yml`** 作为主配置文件，位于项目根目录。

**重要：** 此文件包含敏感信息（API 密钥），已添加到 `.gitignore`，不会被提交到版本控制系统。

## 配置文件结构

```yaml
# ASR 配置
asr:
  provider: volcano  # ASR 提供商：volcano 或 example
  language: zh-CN    # 识别语言：zh-CN 或 en-US
  providers:
    volcano:
      base_url: wss://openspeech.bytedance.com/api/v3/sauc/bigmodel
      app_id: "你的app_id"
      app_key: "你的app_key"
      access_key: "你的access_key"
    example:
      {}

# 存储配置
storage:
  type: sqlite
  path: ~/.voice_assistant/history.db

# 音频配置
audio:
  format: WAV
  channels: 1
  rate: 16000
  chunk: 1024

# UI 配置
ui:
  theme: light
  position:
    x: 100
    y: 100
  size:
    width: 500
    height: 400
```

## 配置优先级

配置系统按以下优先级加载配置：

1. **项目根目录的 `config.yml`**（包含所有令牌）
2. 默认配置

## 安全说明

### 令牌管理

- ✅ **令牌只能从 `config.yml` 读取**
- ❌ 不会从环境变量读取令牌
- ❌ 不会从 `.env` 文件读取令牌
- ✅ `config.yml` 已添加到 `.gitignore`

### 首次设置

1. 复制示例配置文件：
```bash
cp config.yml.example config.yml
```

2. 编辑 `config.yml`，填入你的 API 密钥

3. 或者使用配置助手：
```bash
python setup_asr.py
```

## 配置字段说明

### ASR 配置

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `asr.provider` | string | ASR 提供商（`volcano` 或 `example`） | 是 |
| `asr.language` | string | 识别语言（`zh-CN` 或 `en-US`） | 是 |
| `asr.providers.volcano.base_url` | string | 火山引擎 WebSocket 地址 | 是 |
| `asr.providers.volcano.app_id` | string | 火山引擎应用ID | 是 |
| `asr.providers.volcano.app_key` | string | 火山引擎应用密钥 | 是 |
| `asr.providers.volcano.access_key` | string | 火山引擎访问密钥 | 是 |

### 音频配置

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `audio.format` | string | 音频格式 | `WAV` |
| `audio.channels` | number | 声道数（1=单声道，2=立体声） | `1` |
| `audio.rate` | number | 采样率（Hz） | `16000` |
| `audio.chunk` | number | 每次读取的帧数 | `1024` |

## 使用配置助手

最简单的方式是使用交互式配置脚本：

```bash
python setup_asr.py
```

脚本会引导你：
1. 选择 ASR 提供商
2. 输入 API 密钥（如果选择火山引擎）
3. 选择识别语言
4. 自动保存到 `config.yml`

## 手动编辑配置

```bash
# 使用文本编辑器编辑
nano config.yml
# 或
vim config.yml
# 或使用 VS Code
code config.yml
```

## 验证配置

运行应用时，配置系统会：

1. 检查 `config.yml` 是否存在
2. 验证配置格式是否正确
3. 检查必要的令牌是否已配置
4. 在终端输出配置加载信息

## 常见问题

### Q: 配置文件在哪里？

A: 项目根目录的 `config.yml`

### Q: 如何查看当前配置？

A: 
```bash
cat config.yml
```

### Q: 配置错误怎么办？

A: 
1. 检查 YAML 格式是否正确
2. 检查缩进是否正确（使用空格，不要使用 Tab）
3. 检查 API 密钥是否正确
4. 可以删除配置文件重新创建：`rm config.yml`

### Q: 如何切换 ASR 提供商？

A: 修改 `config.yml` 中的 `asr.provider` 字段：
- `volcano`: 使用火山引擎 ASR
- `example`: 使用示例 ASR（测试用）

### Q: 配置文件会被提交到 Git 吗？

A: 不会。`config.yml` 已添加到 `.gitignore`。只有 `config.yml.example` 会被提交。

## 迁移旧配置

如果你之前使用 `~/.voice_assistant/config.json`，需要手动迁移：

1. 读取旧配置：
```bash
cat ~/.voice_assistant/config.json
```

2. 将内容转换为 YAML 格式，保存到项目根目录的 `config.yml`

3. 参考 `config.yml.example` 的格式进行转换
