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
    
    配置优先级（ASR配置）：
    1. 用户自定义配置（~/.voice_assistant/user_asr_config.yml）
    2. 项目根目录的 config.yml（厂商配置）
    3. 默认配置
    
    其他配置优先级：
    1. 项目根目录的 config.yml
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
        
        # 用户自定义ASR配置文件路径
        self.user_asr_config_file = self.config_dir / 'user_asr_config.yml'
        
        # 加载配置文件
        self._config = self._load_config()
        self._user_asr_config = self._load_user_asr_config()
    
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
    
    def _load_user_asr_config(self) -> Dict[str, Any]:
        """加载用户自定义ASR配置"""
        if self.user_asr_config_file.exists():
            try:
                with open(self.user_asr_config_file, 'r', encoding='utf-8') as f:
                    config = yaml.safe_load(f)
                    if config and isinstance(config, dict):
                        print(f"[配置] 从 {self.user_asr_config_file} 加载用户自定义ASR配置")
                        return config
            except Exception as e:
                print(f"[配置] 读取用户自定义ASR配置失败: {e}")
        return {}
    
    def get_asr_config(self, use_user_config: bool = True) -> Dict[str, Any]:
        """获取ASR配置
        
        Args:
            use_user_config: 是否使用用户自定义配置（True=用户配置，False=厂商配置）
        
        Returns:
            ASR配置字典
        """
        if use_user_config and self._user_asr_config:
            # 使用用户自定义配置，缺失的字段从厂商配置补充
            vendor_config = self._config.get('asr', {})
            user_config = self._user_asr_config.copy()
            # 合并配置，用户配置优先
            for key in ['base_url', 'app_id', 'app_key', 'access_key', 'language']:
                if key not in user_config or not user_config[key]:
                    if key in vendor_config:
                        user_config[key] = vendor_config[key]
            return user_config
        else:
            # 使用厂商配置
            return self._config.get('asr', self._default_config()['asr'])
    
    def get_asr_config_source(self) -> str:
        """获取当前使用的ASR配置源
        
        Returns:
            'user' 或 'vendor'
        """
        # 检查用户配置文件是否存在且有有效内容
        if self.user_asr_config_file.exists() and self._user_asr_config:
            # 检查是否有任何非空的有效配置值
            required_keys = ['app_id', 'app_key', 'access_key']
            if any(self._user_asr_config.get(k) for k in required_keys):
                return 'user'
        return 'vendor'
    
    def save_user_asr_config(self, asr_config: Dict[str, Any]):
        """保存用户自定义ASR配置
        
        Args:
            asr_config: ASR配置字典
        """
        try:
            # 只保存非空值
            config_to_save = {k: v for k, v in asr_config.items() if v}
            with open(self.user_asr_config_file, 'w', encoding='utf-8') as f:
                yaml.dump(config_to_save, f, default_flow_style=False, 
                         allow_unicode=True, sort_keys=False)
            print(f"[配置] 用户自定义ASR配置已保存到 {self.user_asr_config_file}")
            # 重新加载配置
            self._user_asr_config = self._load_user_asr_config()
        except Exception as e:
            print(f"[配置] 保存用户自定义ASR配置失败: {e}")
            raise
    
    def delete_user_asr_config(self):
        """删除用户自定义ASR配置（重置为使用厂商配置）"""
        try:
            if self.user_asr_config_file.exists():
                self.user_asr_config_file.unlink()
                print(f"[配置] 已删除用户自定义ASR配置，将使用厂商配置")
            self._user_asr_config = {}
        except Exception as e:
            print(f"[配置] 删除用户自定义ASR配置失败: {e}")
            raise
    
    def get_vendor_asr_config(self) -> Dict[str, Any]:
        """获取厂商ASR配置（从config.yml）"""
        return self._config.get('asr', self._default_config()['asr'])
    