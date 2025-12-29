"""
配置管理模块
从项目根目录的 config.yml 读取配置，令牌只能从此文件读取
"""
import os
import yaml
from pathlib import Path
from typing import Dict, Any, Optional


class Config:
    """配置管理器
    
    配置优先级：
    1. 项目根目录的 config.yml（包含所有令牌）
    2. 默认配置
    """
    
    def __init__(self, config_dir: Optional[str] = None):
        """初始化配置
        
        Args:
            config_dir: 配置目录路径，默认为 ~/.voice_assistant（用于存储数据库等）
        """
        # 项目根目录（假设 config.py 在 src/core/ 下）
        project_root = Path(__file__).parent.parent.parent
        self.project_config_file = project_root / 'config.yml'
        
        if config_dir is None:
            config_dir = os.path.join(os.path.expanduser('~'), '.voice_assistant')
        
        self.config_dir = Path(config_dir)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        # 加载配置文件
        self._config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        """加载配置文件
        
        优先级：
        1. 项目根目录的 config.yml（包含令牌）
        2. 默认配置
        """
        # 从项目根目录的 config.yml 读取（包含所有令牌）
        if self.project_config_file.exists():
            try:
                with open(self.project_config_file, 'r', encoding='utf-8') as f:
                    config = yaml.safe_load(f)
                    if config:
                        print(f"[配置] 从 {self.project_config_file} 加载配置")
                        return config
            except Exception as e:
                print(f"[配置] 读取 config.yml 失败: {e}")
        
        # 使用默认配置
        print("[配置] 使用默认配置")
        return self._default_config()
    
    def _default_config(self) -> Dict[str, Any]:
        """默认配置"""
        return {
            'asr': {
                'base_url': 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
                'app_id': '',
                'app_key': '',
                'access_key': '',
                'language': 'zh-CN'
            },
            'storage': {
                'type': 'sqlite',
                'path': str(self.config_dir / 'history.db')
            },
            'audio': {
                'format': 'WAV',
                'channels': 1,
                'rate': 16000,
                'chunk': 1024
            },
            'ui': {
                'theme': 'light',
                'position': {'x': 100, 'y': 100},
                'size': {'width': 400, 'height': 300}
            }
        }
    
    def save(self):
        """保存配置到文件（保存到项目根目录的 config.yml）"""
        try:
            with open(self.project_config_file, 'w', encoding='utf-8') as f:
                yaml.dump(self._config, f, default_flow_style=False, 
                         allow_unicode=True, sort_keys=False)
            print(f"[配置] 配置已保存到 {self.project_config_file}")
        except Exception as e:
            print(f"[配置] 保存配置失败: {e}")
    
    def get(self, key: str, default: Any = None) -> Any:
        """获取配置值（支持点号分隔的嵌套键）"""
        keys = key.split('.')
        value = self._config
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
                if value is None:
                    return default
            else:
                return default
        return value
    
    def set(self, key: str, value: Any):
        """设置配置值（支持点号分隔的嵌套键）"""
        keys = key.split('.')
        config = self._config
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        config[keys[-1]] = value
    