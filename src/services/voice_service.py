"""
语音服务 - 整合录音、ASR、存储等功能
"""
import asyncio
import logging
from typing import Optional, Callable, Union
from ..core.base import RecordingState, AudioRecorder
from ..core.config import Config
from ..providers.asr.volcano import VolcanoASRProvider
from ..providers.storage.sqlite import SQLiteStorageProvider

logger = logging.getLogger(__name__)


class VoiceService:
    """语音服务主类"""
    
    def __init__(self, config: Config):
        """初始化语音服务
        
        Args:
            config: 配置对象
        """
        self.config = config
        
        self.recorder: Optional[AudioRecorder] = None
        self.asr_provider: Optional[VolcanoASRProvider] = None
        self.storage_provider: Optional[SQLiteStorageProvider] = None
        
        self._on_text_callback: Optional[Callable[[str, bool, dict], None]] = None
        self._on_state_change_callback: Optional[Callable[[RecordingState], None]] = None
        self._on_error_callback: Optional[Callable[[str, str], None]] = None
        
        self._streaming_active = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._current_text = ""
        self._current_session_id: Optional[str] = None
        
        self._initialize_providers()
    
    def _initialize_providers(self):
        """初始化提供商"""
        logger.info("[语音服务] 初始化提供商...")
        # 根据配置源自动选择使用用户配置还是厂商配置
        config_source = self.config.get_asr_config_source()
        use_user_config = (config_source == 'user')
        self._initialize_asr_provider(use_user_config=use_user_config)
        
        storage_config = {
            'path': self.config.get('storage.path', '~/.voice_assistant/history.db')
        }
        logger.info(f"[语音服务] 初始化存储提供商: path={storage_config['path']}")
        self.storage_provider = SQLiteStorageProvider()
        self.storage_provider.initialize(storage_config)
        logger.info("[语音服务] 存储提供商初始化完成")
    
    def _initialize_asr_provider(self, use_user_config: bool = True):
        """初始化ASR提供商
        
        Args:
            use_user_config: 是否使用用户自定义配置
        """
        # 获取ASR配置（根据use_user_config决定使用用户配置还是厂商配置）
        asr_config = self.config.get_asr_config(use_user_config=use_user_config)
        config_source = self.config.get_asr_config_source()
        
        logger.info(f"[语音服务] ASR配置源: {config_source}, base_url={asr_config.get('base_url', '')}, "
                   f"app_id={'已设置' if asr_config.get('app_id') else '未设置'}, "
                   f"app_key={'已设置' if asr_config.get('app_key') else '未设置'}, "
                   f"access_key={'已设置' if asr_config.get('access_key') else '未设置'}")
        
        if asr_config.get('access_key') and asr_config.get('app_key'):
            logger.info("[语音服务] 初始化火山引擎 ASR 提供商...")
            self.asr_provider = VolcanoASRProvider()
            if not self.asr_provider.initialize(asr_config):
                error_msg = "火山引擎 ASR 初始化失败，请检查配置"
                logger.error(f"[语音服务] {error_msg}")
                if self._on_error_callback:
                    self._on_error_callback("ASR初始化失败", error_msg)
                self.asr_provider = None
            else:
                logger.info("[语音服务] 火山引擎 ASR 提供商初始化成功")
        else:
            logger.warning("[语音服务] ASR配置不完整，ASR功能将不可用")
            self.asr_provider = None
    
    def reload_asr_provider(self, use_user_config: bool = True):
        """重新加载ASR提供商（用于配置更改后）
        
        Args:
            use_user_config: 是否使用用户自定义配置
        """
        logger.info(f"[语音服务] 重新加载ASR提供商，使用{'用户' if use_user_config else '厂商'}配置")
        # 如果正在录音，先停止
        if self.get_state() != RecordingState.IDLE:
            logger.warning("[语音服务] 正在录音，无法重新加载ASR提供商")
            return False
        
        # 清理旧的提供商
        if self.asr_provider:
            try:
                self.asr_provider.cleanup()
            except Exception as e:
                logger.warning(f"[语音服务] 清理旧ASR提供商失败: {e}")
            self.asr_provider = None
        
        # 重新初始化
        self._initialize_asr_provider(use_user_config=use_user_config)
        return True
    
    def set_recorder(self, recorder: AudioRecorder):
        """设置录音器"""
        logger.info("[语音服务] 设置录音器")
        self.recorder = recorder
    
    def set_on_text_callback(self, callback: Callable[[str, bool, dict], None]):
        """设置文本回调函数
        
        Args:
            callback: 回调函数 (text: str, is_definite_utterance: bool, time_info: dict)
                      text: 识别的文本（已在后端累加处理）
                      is_definite_utterance: 是否为确定的utterance（当ASR服务返回definite=True时，此值为True）
                                             表示一个完整的、确定的语音识别单元已完成
                      time_info: 时间信息字典，包含:
                                - start_time: 开始时间（毫秒）
                                - end_time: 结束时间（毫秒）
                                注意：仅在 is_definite_utterance=True 时有值
        """
        self._on_text_callback = callback
    
    def set_on_state_change_callback(self, callback: Callable[[RecordingState], None]):
        """设置状态变化回调函数"""
        self._on_state_change_callback = callback
    
    def set_on_error_callback(self, callback: Callable[[str, str], None]):
        """设置错误回调函数"""
        self._on_error_callback = callback
    
    def start_recording(self) -> bool:
        """开始录音（流式识别）"""
        logger.info("[语音服务] 开始录音...")
        
        if not self.recorder:
            logger.error("[语音服务] 录音器未设置，无法开始录音")
            return False
        
        if self.recorder.get_state() == RecordingState.RECORDING:
            logger.warning("[语音服务] 录音已在进行中，无法重复开始")
            return False
        
        self._current_session_id = None
        
        if self.asr_provider:
            logger.info("[语音服务] 启动流式 ASR 识别...")
            try:
                try:
                    self._loop = asyncio.get_running_loop()
                    loop_running = True
                except RuntimeError:
                    try:
                        self._loop = asyncio.get_event_loop()
                        loop_running = self._loop.is_running()
                    except RuntimeError:
                        self._loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(self._loop)
                        loop_running = False
                
                self.asr_provider.set_on_text_callback(self._on_asr_text_received)
                language = self.config.get('asr.language', 'zh-CN')
                
                if loop_running:
                    async def start_async():
                        result = await self.asr_provider.start_streaming_recognition(language)
                        if not result:
                            error_msg = "启动流式 ASR 识别失败，请检查网络连接和ASR服务配置"
                            logger.error(f"[语音服务] {error_msg}")
                            if self._on_error_callback:
                                self._on_error_callback("ASR启动失败", error_msg)
                        else:
                            self._streaming_active = True
                            logger.info("[语音服务] 流式识别已启动")
                    
                    asyncio.create_task(start_async())
                    self._streaming_active = True
                else:
                    if not self._loop.run_until_complete(self.asr_provider.start_streaming_recognition(language)):
                        error_msg = "启动流式 ASR 识别失败，请检查网络连接和ASR服务配置"
                        logger.error(f"[语音服务] {error_msg}")
                        if self._on_error_callback:
                            self._on_error_callback("ASR启动失败", error_msg)
                        return False
                    
                    self._streaming_active = True
                
                self.recorder.set_on_audio_chunk_callback(self._on_audio_chunk)
            except Exception as e:
                error_msg = f"启动流式识别失败: {str(e)}"
                logger.error(f"[语音服务] {error_msg}", exc_info=True)
                if self._on_error_callback:
                    self._on_error_callback("ASR启动失败", error_msg)
                return False
        else:
            logger.warning("[语音服务] ASR提供商未初始化，将仅录音不进行识别")
        
        # 开始录音
        logger.info("[语音服务] 启动录音器...")
        success = self.recorder.start_recording()
        if success:
            logger.info("[语音服务] 录音已开始，状态: RECORDING")
            self._notify_state_change(RecordingState.RECORDING)
        else:
            logger.error("[语音服务] 录音器启动失败")
        return success
    
    def _on_audio_chunk(self, audio_data: bytes):
        """音频数据块回调"""
        # 如果录音器处于暂停状态，不发送音频数据
        if self.recorder and self.recorder.get_state() == RecordingState.PAUSED:
            return
        
        if self._streaming_active and self.asr_provider and self._loop:
            try:
                if not self._loop.is_closed():
                    if self._loop.is_running():
                        asyncio.run_coroutine_threadsafe(
                            self.asr_provider.send_audio_chunk(audio_data),
                            self._loop
                        )
                    else:
                        self._loop.run_until_complete(
                            self.asr_provider.send_audio_chunk(audio_data)
                        )
            except Exception as e:
                error_msg = f"发送音频数据块失败: {str(e)}"
                logger.error(f"[语音服务] {error_msg}", exc_info=True)
                if self._on_error_callback:
                    self._on_error_callback("音频传输失败", error_msg)
    
    def _on_asr_text_received(self, text: str, is_definite_utterance: bool, time_info: dict):
        """ASR文本接收回调"""
        if is_definite_utterance:
            time_info_str = ""
            if time_info:
                time_info_str = f", start_time={time_info.get('start_time', 0)}ms, end_time={time_info.get('end_time', 0)}ms"
            logger.info(f"[语音服务] 收到确定utterance: '{text}'{time_info_str}")
        self._current_text = text
        
        if self._on_text_callback:
            self._on_text_callback(text, is_definite_utterance, time_info)
    
    def pause_recording(self) -> bool:
        """暂停录音"""
        logger.info("[语音服务] 暂停录音...")
        if not self.recorder:
            logger.error("[语音服务] 录音器未设置，无法暂停")
            return False
        
        success = self.recorder.pause_recording()
        if success:
            logger.info("[语音服务] 录音已暂停，状态: PAUSED")
            self._notify_state_change(RecordingState.PAUSED)
        else:
            logger.warning("[语音服务] 暂停录音失败")
        return success
    
    def resume_recording(self) -> bool:
        """恢复录音"""
        logger.info("[语音服务] 恢复录音...")
        if not self.recorder:
            logger.error("[语音服务] 录音器未设置，无法恢复")
            return False
        
        success = self.recorder.resume_recording()
        if success:
            logger.info("[语音服务] 录音已恢复，状态: RECORDING")
            self._notify_state_change(RecordingState.RECORDING)
        else:
            logger.warning("[语音服务] 恢复录音失败")
        return success
    
    def stop_recording(self) -> Optional[str]:
        """停止录音并获取最终识别结果"""
        logger.info("[语音服务] 停止录音...")
        if not self.recorder:
            logger.error("[语音服务] 录音器未设置，无法停止")
            return None
        
        try:
            self._notify_state_change(RecordingState.STOPPING)
            logger.info("[语音服务] 状态: STOPPING")
            
            # 停止录音
            logger.info("[语音服务] 停止录音器...")
            self.recorder.stop_recording()
            
            # 停止流式识别并获取最终结果
            # 清除音频回调（无论流式识别是否激活）
            self.recorder.set_on_audio_chunk_callback(None)
            logger.debug("[语音服务] 已清除音频数据块回调")
            
            final_text = None
            if self.asr_provider:
                try:
                    self.asr_provider._streaming_active = False
                    if self.asr_provider._audio_queue:
                        try:
                            self.asr_provider._audio_queue.put_nowait(None)
                        except:
                            pass
                    
                    import time
                    time.sleep(1.5)
                    
                    final_text = self._current_text
                    logger.info(f"[语音服务] ✓ 最终文本: '{final_text}'")
                    self._streaming_active = False
                except Exception as e:
                    logger.error(f"[语音服务] ✗ 停止失败: {e}", exc_info=True)
                    self._streaming_active = False
                    final_text = self._current_text
            else:
                if not self.asr_provider:
                    logger.info("[语音服务] ASR提供商未初始化，跳过停止ASR")
                elif not self._loop:
                    logger.info("[语音服务] 事件循环未设置，跳过停止ASR")
                else:
                    logger.info("[语音服务] 流式识别未激活，但已清除音频回调")
            
            self._current_session_id = None
            if final_text:
                self._current_text = final_text
            
            return final_text
        except Exception as e:
            logger.error(f"[语音服务] 停止录音过程发生异常: {e}", exc_info=True)
            # 确保流式识别被标记为非激活状态
            self._streaming_active = False
            return None
        finally:
            # 无论如何都要确保状态被重置为IDLE
            self._notify_state_change(RecordingState.IDLE)
            logger.info("[语音服务] 录音已停止，状态: IDLE")
    
    def get_state(self) -> RecordingState:
        """获取当前状态"""
        if not self.recorder:
            return RecordingState.IDLE
        return self.recorder.get_state()
    
    def _notify_state_change(self, state: RecordingState):
        """通知状态变化"""
        if self._on_state_change_callback:
            self._on_state_change_callback(state)
    
    def _update_session_record(self, text: str):
        """更新会话记录"""
        if not self._current_session_id or not self.storage_provider:
            return
        
        try:
            existing_record = self.storage_provider.get_record(self._current_session_id)
            language = self.config.get('asr.language', 'zh-CN')
            metadata = {
                'language': language,
                'provider': 'volcano',
                'session_id': self._current_session_id,
                'is_session': True,
                'updated_at': self._get_timestamp() if existing_record else None
            }
            
            if existing_record:
                if hasattr(self.storage_provider, 'update_record'):
                    self.storage_provider.update_record(self._current_session_id, text, metadata)
                else:
                    self.storage_provider.delete_record(self._current_session_id)
                    self.storage_provider.save_record(text, metadata)
            else:
                metadata['is_session'] = True
                self.storage_provider.save_record(text, metadata)
        except Exception as e:
            logger.error(f"[语音服务] 更新会话记录失败: {e}", exc_info=True)
    
    def _get_timestamp(self) -> str:
        """获取当前时间戳"""
        from datetime import datetime
        return datetime.now().isoformat()
    
    def cleanup(self):
        """清理资源"""
        logger.info("[语音服务] 清理资源...")
        
        # 停止流式识别
        if self._streaming_active and self.asr_provider and self._loop:
            logger.info("[语音服务] 清理流式识别...")
            try:
                if not self._loop.is_closed():
                    # 检查事件循环是否正在运行
                    if self._loop.is_running():
                        # 事件循环正在运行，使用线程安全的方式
                        logger.debug("[语音服务] 事件循环正在运行，使用线程安全方式清理流式识别")
                        future = asyncio.run_coroutine_threadsafe(
                            self.asr_provider.stop_streaming_recognition(),
                            self._loop
                        )
                        try:
                            future.result(timeout=5.0)
                        except Exception as e:
                            logger.warning(f"[语音服务] 清理流式识别时出错: {e}")
                    else:
                        # 事件循环未运行，使用run_until_complete
                        logger.debug("[语音服务] 事件循环未运行，使用run_until_complete清理流式识别")
                        self._loop.run_until_complete(
                            self.asr_provider.stop_streaming_recognition()
                        )
            except Exception as e:
                logger.warning(f"[语音服务] 清理流式识别时出错: {e}")
            self._streaming_active = False
        
        if self.recorder:
            logger.info("[语音服务] 清理录音器...")
            self.recorder.cleanup()
        
        logger.info("[语音服务] 资源清理完成")