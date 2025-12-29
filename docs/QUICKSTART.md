# 快速开始指南

## 项目架构概览

本项目采用模块化、可扩展的架构设计，主要包含以下层次：

### 1. 核心层 (Core)

- **`base.py`**: 定义所有抽象接口
  - `ASRProvider`: ASR 提供商接口
  - `StorageProvider`: 存储提供商接口
  - `AudioRecorder`: 音频录制器接口
  - `RecordingState`: 录音状态枚举

- **`config.py`**: 配置管理器
  - 支持 JSON 配置文件
  - 支持环境变量
  - 支持嵌套配置（点号分隔）

- **`plugin_manager.py`**: 插件管理器
  - 动态加载和注册提供商
  - 自动发现插件类
  - 创建提供商实例

### 2. 提供商层 (Providers)

#### ASR 提供商 (`src/providers/asr/`)
- `base_asr.py`: ASR 基类（可选继承）
- `example.py`: 示例实现（用于测试）

#### 存储提供商 (`src/providers/storage/`)
- `base_storage.py`: 存储基类（可选继承）
- `sqlite.py`: SQLite 实现

### 3. 服务层 (Services)

- **`voice_service.py`**: 语音服务
  - 整合录音、ASR、存储功能
  - 管理录音状态
  - 提供回调机制

### 4. UI 层 (UI)

- **Electron前端** (`electron-app/`):
  - React + TypeScript
  - 系统托盘图标
  - 主窗口和控制按钮
  - 实时文本显示

## 如何添加新的 ASR 提供商

### 步骤 1: 创建提供商文件

在 `src/providers/asr/` 下创建新文件，例如 `baidu.py`:

```python
from typing import Dict, Any
from .base_asr import BaseASRProvider

class BaiduASRProvider(BaseASRProvider):
    PROVIDER_NAME = "baidu"
    
    @property
    def name(self) -> str:
        return "baidu"
    
    @property
    def supported_languages(self) -> list[str]:
        return ["zh-CN", "en-US"]
    
    def initialize(self, config: Dict[str, Any]) -> bool:
        # 初始化百度 API 客户端
        self.api_key = config.get('api_key')
        self.secret_key = config.get('secret_key')
        return super().initialize(config)
    
    def recognize(self, audio_data: bytes, language: str = "zh-CN", **kwargs) -> str:
        # 调用百度 ASR API
        # 返回识别结果
        pass
    
    def is_available(self) -> bool:
        return self._initialized and bool(self.api_key)
```

### 步骤 2: 注册提供商

在 `src/api/server.py` 中加载：

```python
plugin_manager.load_plugin_module('src.providers.asr.baidu')
```

### 步骤 3: 配置

在配置文件中设置：

```json
{
  "asr": {
    "provider": "baidu",
    "providers": {
      "baidu": {
        "api_key": "your_api_key",
        "secret_key": "your_secret_key"
      }
    }
  }
}
```

## 如何添加新的存储提供商

### 步骤 1: 创建存储提供商文件

在 `src/providers/storage/` 下创建新文件，例如 `json_file.py`:

```python
from typing import Dict, Any, Optional
from .base_storage import BaseStorageProvider

class JSONFileStorageProvider(BaseStorageProvider):
    PROVIDER_NAME = "json_file"
    
    def initialize(self, config: Dict[str, Any]) -> bool:
        self.file_path = config.get('path', 'records.json')
        return super().initialize(config)
    
    def save_record(self, text: str, metadata: Dict[str, Any]) -> str:
        # 保存到 JSON 文件
        pass
    
    # 实现其他必需方法...
```

### 步骤 2: 注册并配置

在 `src/api/server.py` 中加载，并在配置中设置 `storage.type = "json_file"`

## 配置说明

配置文件位置：项目根目录的 `config.yml`

### ASR 配置

```yaml
asr:
  provider: baidu  # 默认提供商
  language: zh-CN  # 默认语言
  providers:
    baidu:
      api_key: "..."
      secret_key: "..."
```

### 存储配置

```yaml
storage:
  type: sqlite
  path: ~/.voice_assistant/history.db
```

## 运行应用

```bash
# 激活虚拟环境
source venv/bin/activate

# 启动API服务器
python api_server.py

# 在另一个终端启动Electron前端
cd electron-app
npm run dev
```

## 下一步

1. 添加更多 ASR 提供商（百度、讯飞等）
2. 实现翻译功能
3. 优化UI界面
