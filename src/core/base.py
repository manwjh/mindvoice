"""
抽象基类定义
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from enum import Enum


class RecordingState(Enum):
    """录音状态枚举"""
    IDLE = "idle"  # 空闲
    RECORDING = "recording"  # 录音中
    PAUSED = "paused"  # 暂停
    STOPPING = "stopping"  # 正在停止


class ASRProvider(ABC):
    """ASR 提供商抽象基类"""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """提供商名称"""
        pass
    
    @property
    @abstractmethod
    def supported_languages(self) -> list[str]:
        """支持的语言列表"""
        pass
    
    @abstractmethod
    def initialize(self, config: Dict[str, Any]) -> bool:
        """初始化提供商
        
        Args:
            config: 配置字典
            
        Returns:
            是否初始化成功
        """
        pass
    
    @abstractmethod
    def recognize(self, audio_data: bytes, language: str = "zh-CN", **kwargs) -> str:
        """识别音频
        
        Args:
            audio_data: 音频数据（字节流）
            language: 语言代码
            **kwargs: 其他参数
            
        Returns:
            识别结果文本
        """
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """检查服务是否可用"""
        pass


class StorageProvider(ABC):
    """存储提供商抽象基类"""
    
    @abstractmethod
    def save_record(self, text: str, metadata: Dict[str, Any]) -> str:
        """保存记录
        
        Args:
            text: 文本内容
            metadata: 元数据（时间戳、语言等）
            
        Returns:
            记录ID
        """
        pass
    
    @abstractmethod
    def get_record(self, record_id: str) -> Optional[Dict[str, Any]]:
        """获取记录
        
        Args:
            record_id: 记录ID
            
        Returns:
            记录字典，包含 text 和 metadata
        """
        pass
    
    @abstractmethod
    def list_records(self, limit: int = 100, offset: int = 0) -> list[Dict[str, Any]]:
        """列出记录
        
        Args:
            limit: 限制数量
            offset: 偏移量
            
        Returns:
            记录列表
        """
        pass
    
    @abstractmethod
    def delete_record(self, record_id: str) -> bool:
        """删除记录
        
        Args:
            record_id: 记录ID
            
        Returns:
            是否删除成功
        """
        pass


class AudioRecorder(ABC):
    """音频录制器抽象基类"""
    
    @abstractmethod
    def start_recording(self) -> bool:
        """开始录音"""
        pass
    
    @abstractmethod
    def pause_recording(self) -> bool:
        """暂停录音"""
        pass
    
    @abstractmethod
    def resume_recording(self) -> bool:
        """恢复录音"""
        pass
    
    @abstractmethod
    def stop_recording(self) -> bytes:
        """停止录音并返回音频数据"""
        pass
    
    @abstractmethod
    def get_state(self) -> RecordingState:
        """获取当前状态"""
        pass
    
    @abstractmethod
    def cleanup(self):
        """清理资源"""
        pass
