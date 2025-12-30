"""
音频录制器实现（基于 sounddevice）
"""
import threading
import queue
import logging
import sounddevice as sd
import numpy as np
from typing import Optional, Callable
from ..core.base import AudioRecorder, RecordingState

logger = logging.getLogger(__name__)


class SoundDeviceRecorder(AudioRecorder):
    """基于 sounddevice 的音频录制器"""
    
    def __init__(self, rate: int = 16000, channels: int = 1, chunk: int = 1024, device: Optional[int] = None):
        """初始化音频录制器
        
        Args:
            rate: 采样率
            channels: 声道数
            chunk: 每次读取的帧数
            device: 音频设备ID，None表示使用默认设备
        """
        self.rate = rate
        self.channels = channels
        self.chunk = chunk
        self.device = device
        self.state = RecordingState.IDLE
        
        self.stream: Optional[sd.InputStream] = None
        self.audio_buffer = bytearray()
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.audio_queue = queue.Queue()
        self.paused = False
        
        # 流式音频数据回调（用于实时 ASR）
        self.on_audio_chunk: Optional[Callable[[bytes], None]] = None
        
        # 统计信息
        self._chunk_count = 0
        self._total_bytes = 0
        self._callback_errors = 0
        
        logger.info(f"[音频] 初始化音频录制器: rate={rate}Hz, channels={channels}, chunk={chunk}, device={device}")
        logger.info(f"[音频] 音频设备信息: {sd.query_devices(kind='input')}")
    
    @staticmethod
    def list_input_devices() -> list[dict]:
        """获取所有输入音频设备列表
        
        Returns:
            设备列表，每个设备包含 id, name, channels, samplerate 等信息
        """
        try:
            all_devices = sd.query_devices()
            result = []
            for device in all_devices:
                # 筛选出输入设备（max_input_channels > 0）
                if device.get('max_input_channels', 0) > 0:
                    result.append({
                        'id': device['index'],
                        'name': device['name'],
                        'channels': device['max_input_channels'],
                        'samplerate': device.get('default_samplerate', 44100.0),
                        'hostapi': device.get('hostapi', 0)
                    })
            return result
        except Exception as e:
            logger.error(f"[音频] 获取设备列表失败: {e}", exc_info=True)
            return []
    
    def set_device(self, device: Optional[int]):
        """设置音频设备
        
        Args:
            device: 音频设备ID，None表示使用默认设备
        """
        if self.state != RecordingState.IDLE:
            logger.warning(f"[音频] 无法更改设备: 当前状态为 {self.state.value}，请先停止录音")
            return False
        
        self.device = device
        logger.info(f"[音频] 音频设备已设置为: {device}")
        return True
    
    def start_recording(self) -> bool:
        """开始录音"""
        if self.state != RecordingState.IDLE:
            logger.warning(f"[音频] 无法开始录音: 当前状态为 {self.state.value}")
            return False
        
        try:
            logger.info("[音频] 开始录音...")
            self.audio_buffer = bytearray()
            self.running = True
            self.paused = False
            self._chunk_count = 0
            self._total_bytes = 0
            self._callback_errors = 0
            
            logger.info(f"[音频] 创建音频输入流: samplerate={self.rate}, channels={self.channels}, blocksize={self.chunk}, device={self.device}")
            self.stream = sd.InputStream(
                samplerate=self.rate,
                channels=self.channels,
                dtype=np.int16,
                blocksize=self.chunk,
                device=self.device,
                callback=self._audio_callback
            )
            self.stream.start()
            logger.info("[音频] 音频流已启动")
            
            self.thread = threading.Thread(target=self._consume_audio, daemon=True)
            self.thread.start()
            logger.info("[音频] 音频消费线程已启动")
            
            self.state = RecordingState.RECORDING
            logger.info("[音频] 录音已开始，状态: RECORDING")
            return True
        except Exception as e:
            logger.error(f"[音频] 启动录音失败: {e}", exc_info=True)
            self.state = RecordingState.IDLE
            raise  # 重新抛出异常，让上层处理
    
    def pause_recording(self) -> bool:
        """暂停录音"""
        if self.state != RecordingState.RECORDING:
            logger.warning(f"[音频] 无法暂停录音: 当前状态为 {self.state.value}")
            return False
        
        logger.info("[音频] 暂停录音")
        self.paused = True
        self.state = RecordingState.PAUSED
        logger.info(f"[音频] 录音已暂停，已采集 {self._chunk_count} 个音频块，总计 {self._total_bytes} 字节")
        return True
    
    def resume_recording(self) -> bool:
        """恢复录音"""
        if self.state != RecordingState.PAUSED:
            logger.warning(f"[音频] 无法恢复录音: 当前状态为 {self.state.value}")
            return False
        
        logger.info("[音频] 恢复录音")
        self.paused = False
        self.state = RecordingState.RECORDING
        logger.info("[音频] 录音已恢复，状态: RECORDING")
        return True
    
    def stop_recording(self) -> bytes:
        """停止录音并返回音频数据"""
        if self.state == RecordingState.IDLE:
            logger.warning("[音频] 录音已处于 IDLE 状态，无需停止")
            return b""
        
        logger.info("[音频] 停止录音...")
        self.running = False
        
        if self.stream:
            try:
                logger.debug("[音频] 停止音频流...")
                self.stream.stop()
                self.stream.close()
                logger.info("[音频] 音频流已停止并关闭")
            except Exception as e:
                logger.warning(f"[音频] 停止音频流时出错: {e}")
            self.stream = None
        
        if self.thread:
            logger.debug("[音频] 等待音频消费线程结束...")
            self.thread.join(timeout=1.0)
            if self.thread.is_alive():
                logger.warning("[音频] 音频消费线程未在1秒内结束")
            else:
                logger.info("[音频] 音频消费线程已结束")
            self.thread = None
        
        # 返回录制的音频数据
        audio_data = bytes(self.audio_buffer)
        audio_size = len(audio_data)
        logger.info(f"[音频] 录音已停止，状态: IDLE")
        logger.info(f"[音频] 录音统计: 共采集 {self._chunk_count} 个音频块，总计 {self._total_bytes} 字节，最终音频数据 {audio_size} 字节")
        if self._callback_errors > 0:
            logger.warning(f"[音频] 音频回调错误次数: {self._callback_errors}")
        
        self.audio_buffer = bytearray()
        self.state = RecordingState.IDLE
        
        return audio_data
    
    def get_state(self) -> RecordingState:
        """获取当前状态"""
        return self.state
    
    def cleanup(self):
        """清理资源"""
        logger.info("[音频] 清理音频录制器资源...")
        if self.running:
            self.stop_recording()
        logger.info("[音频] 资源清理完成")
    
    def _audio_callback(self, indata, frames, time, status):
        """音频回调函数"""
        if status:
            logger.warning(f"[音频] 音频回调状态警告: {status}")
        
        if self.running and not self.paused:
            try:
                audio_data = indata.tobytes()
                audio_size = len(audio_data)
                self.audio_queue.put(audio_data)
                
                # 每100个块记录一次详细信息
                if self._chunk_count % 100 == 0:
                    logger.debug(f"[音频] 音频回调: 块#{self._chunk_count}, 帧数={frames}, 数据大小={audio_size}字节, 时间戳={time}")
                
                self._chunk_count += 1
                self._total_bytes += audio_size
            except Exception as e:
                self._callback_errors += 1
                logger.error(f"[音频] 音频回调错误 (第{self._callback_errors}次): {e}", exc_info=True)
    
    def _consume_audio(self):
        """消费音频数据"""
        logger.info("[音频] 音频消费线程开始运行")
        consumed_chunks = 0
        
        while self.running:
            try:
                data = self.audio_queue.get(timeout=0.1)
                if not self.paused:
                    self.audio_buffer.extend(data)
                    consumed_chunks += 1
                    
                    # 每100个块记录一次详细信息
                    if consumed_chunks % 100 == 0:
                        logger.debug(f"[音频] 消费音频块 #{consumed_chunks}, 大小={len(data)}字节, 缓冲区总大小={len(self.audio_buffer)}字节")
                    
                    # 实时发送音频数据块（用于流式 ASR）
                    if self.on_audio_chunk:
                        try:
                            self.on_audio_chunk(data)
                        except Exception as e:
                            logger.error(f"[音频] 音频数据块回调错误: {e}", exc_info=True)
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"[音频] 消费音频数据时出错: {e}", exc_info=True)
                continue
        
        logger.info(f"[音频] 音频消费线程结束，共消费 {consumed_chunks} 个音频块")
    
    def set_on_audio_chunk_callback(self, callback: Optional[Callable[[bytes], None]]):
        """设置音频数据块回调函数（用于流式 ASR）"""
        if callback:
            logger.info("[音频] 已设置音频数据块回调函数（用于流式 ASR）")
        else:
            logger.info("[音频] 已清除音频数据块回调函数")
        self.on_audio_chunk = callback
