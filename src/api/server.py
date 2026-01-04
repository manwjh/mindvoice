"""
FastAPI服务器 - 提供HTTP和WebSocket API
独立的后端服务，不依赖任何前端框架
"""
import asyncio
import logging
import sys
import os
import json
import base64
import uuid
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import StreamingResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from src.core.config import Config
from src.core.base import RecordingState
from src.core.logger import get_logger
from src.core.error_codes import SystemError, SystemErrorInfo
from src.services.voice_service import VoiceService
from src.services.llm_service import LLMService
from src.services.knowledge_service import KnowledgeService
from src.services.export_service import MarkdownExportService, HtmlExportService
from src.services.cleanup_service import CleanupService
from src.utils.audio_recorder import SoundDeviceRecorder
from src.agents import SummaryAgent, SmartChatAgent
from src.agents.translation_agent import TranslationAgent

logger = get_logger("API")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    setup_voice_service()
    setup_llm_service()
    setup_cleanup_service()
    
    # 在异步上下文中启动知识库模型的后台加载
    global knowledge_service
    if knowledge_service and hasattr(knowledge_service, 'start_background_load'):
        load_task = knowledge_service.start_background_load()
        if load_task:
            # start_background_load() 已经返回一个正在运行的 Task，不需要再包装
            # 只需要保留引用，防止被垃圾回收
            logger.info("[API] 已在后台启动 Embedding 模型加载任务")
    
    # 启动清理服务
    global cleanup_service
    if cleanup_service:
        await cleanup_service.start()
    
    yield
    
    global voice_service, llm_service, recorder
    logger.info("[API] 正在关闭服务...")
    
    # 停止清理服务
    if cleanup_service:
        await cleanup_service.stop()
    
    if voice_service:
        try:
            voice_service.cleanup()
        except Exception as e:
            logger.error(f"清理语音服务失败: {e}")
    
    if recorder:
        try:
            recorder.cleanup()
        except Exception as e:
            logger.error(f"清理录音器失败: {e}")
    
    logger.info("[API] 服务已关闭")


# 创建FastAPI应用
app = FastAPI(
    title="语音桌面助手 API",
    version="1.0.0",
    description="独立的后端API服务，支持任何前端框架",
    lifespan=lifespan
)

# 配置CORS（允许任何前端访问，便于后续更换前端框架）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境可以限制为特定域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局服务实例
voice_service: Optional[VoiceService] = None
llm_service: Optional[LLMService] = None
knowledge_service: Optional[KnowledgeService] = None
summary_agent: Optional[SummaryAgent] = None
smart_chat_agent: Optional[SmartChatAgent] = None
translation_agent: Optional[TranslationAgent] = None
cleanup_service: Optional[CleanupService] = None
config: Optional[Config] = None
recorder: Optional[SoundDeviceRecorder] = None

# WebSocket连接管理（单连接模式）
current_connection: Optional[WebSocket] = None


# ==================== API响应模型 ====================

class StatusResponse(BaseModel):
    """状态响应模型"""
    state: str
    current_text: str


class StartRecordingResponse(BaseModel):
    """开始录音响应"""
    success: bool
    message: str
    error: Optional[Dict[str, Any]] = None  # SystemErrorInfo 对象（错误时包含）


class StopRecordingRequest(BaseModel):
    """停止录音请求"""
    user_edited_text: Optional[str] = None  # 用户编辑后的文本


class StopRecordingResponse(BaseModel):
    """停止录音响应"""
    success: bool
    final_text: Optional[str] = None
    message: str


class RecordItem(BaseModel):
    """记录项模型"""
    id: str
    text: str
    metadata: dict
    app_type: Optional[str] = 'voice-note'  # 添加 app_type 字段
    created_at: str


class ListRecordsResponse(BaseModel):
    """列出记录响应"""
    success: bool
    records: list[RecordItem]
    total: int
    limit: int
    offset: int
    error: Optional[Dict[str, Any]] = None  # SystemErrorInfo 对象


class ChatMessage(BaseModel):
    """聊天消息模型"""
    role: str = Field(..., description="角色：system, user, assistant")
    content: str = Field(..., description="消息内容")


class ChatRequest(BaseModel):
    """聊天请求模型"""
    messages: list[ChatMessage] = Field(..., description="消息列表")
    stream: bool = Field(default=False, description="是否流式返回")
    temperature: float = Field(default=0.7, ge=0, le=2, description="温度参数")
    max_tokens: Optional[int] = Field(default=None, description="最大生成token数")


class ChatResponse(BaseModel):
    """聊天响应模型"""
    success: bool
    message: Optional[str] = None
    error: Optional[Dict[str, Any]] = None  # 可以是字符串或 SystemErrorInfo 对象


class SimpleChatRequest(BaseModel):
    """简单聊天请求模型"""
    message: str = Field(..., description="用户消息")
    system_prompt: Optional[str] = Field(default=None, description="系统提示")
    temperature: float = Field(default=0.7, ge=0, le=2, description="温度参数")
    max_tokens: Optional[int] = Field(default=None, description="最大生成token数")
    stream: bool = Field(default=False, description="是否使用流式输出")


class TranslateRequest(BaseModel):
    """翻译请求模型"""
    text: str = Field(..., description="待翻译文本")
    source_lang: str = Field(..., description="源语言代码（zh/en/ja/ko）")
    target_lang: str = Field(..., description="目标语言代码（zh/en/ja/ko）")
    stream: bool = Field(default=False, description="是否使用流式输出")


class BatchTranslateRequest(BaseModel):
    """批量翻译请求模型"""
    texts: list[str] = Field(..., description="待翻译文本列表")
    source_lang: str = Field(..., description="源语言代码（zh/en/ja/ko）")
    target_lang: str = Field(..., description="目标语言代码（zh/en/ja/ko）")


class LLMInfoResponse(BaseModel):
    """LLM信息响应"""
    available: bool
    name: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    max_context_tokens: Optional[int] = None


# ==================== 消息缓冲区（替代 WebSocket）====================

class MessageBuffer:
    """消息缓冲区 - 用于轮询方案"""
    def __init__(self):
        self.messages = []
        self.counter = 0
        self.max_size = 100  # 只保留最近 100 条消息
    
    def add(self, message: dict):
        """添加消息到缓冲区"""
        self.counter += 1
        import time
        self.messages.append({
            "id": self.counter,
            "message": message,
            "timestamp": time.time()
        })
        
        # 只保留最近的消息
        if len(self.messages) > self.max_size:
            self.messages = self.messages[-self.max_size:]
        
        logger.debug(f"[消息缓冲] 添加消息: id={self.counter}, type={message.get('type')}, 缓冲区大小={len(self.messages)}")
    
    def get_after(self, after_id: int):
        """获取指定 ID 之后的所有消息"""
        result = [m for m in self.messages if m["id"] > after_id]
        if result:
            logger.debug(f"[消息缓冲] 查询: after_id={after_id}, 返回 {len(result)} 条消息")
        return result
    
    def clear(self):
        """清空缓冲区"""
        self.messages = []
        self.counter = 0  # 同时重置计数器，避免ID不连续
        logger.info("[消息缓冲] 缓冲区已清空，counter已重置")

# 全局消息缓冲区
message_buffer = MessageBuffer()

def broadcast(message: dict):
    """向客户端广播消息（新方案：写入缓冲区）"""
    message_buffer.add(message)
    logger.debug(f"[API] 消息已缓冲: type={message.get('type')}")


# ==================== 服务初始化 ====================

def setup_voice_service():
    """初始化语音服务"""
    global voice_service, config, recorder
    
    logger.info("[API] 初始化语音服务...")
    
    try:
        # 加载配置
        config = Config()
        
        # 获取VAD配置
        vad_config = {
            'enabled': config.get('audio.vad.enabled', False),
            'mode': config.get('audio.vad.mode', 2),
            'frame_duration_ms': config.get('audio.vad.frame_duration_ms', 20),
            'speech_start_threshold': config.get('audio.vad.speech_start_threshold', 2),
            'speech_end_threshold': config.get('audio.vad.speech_end_threshold', 10),
            'min_speech_duration_ms': config.get('audio.vad.min_speech_duration_ms', 200),
            'pre_speech_padding_ms': config.get('audio.vad.pre_speech_padding_ms', 100),
            'post_speech_padding_ms': config.get('audio.vad.post_speech_padding_ms', 300)
        }
        
        # 初始化录音器（传入VAD配置）
        audio_device = config.get('audio.device', None)
        if audio_device is not None:
            try:
                audio_device = int(audio_device)
            except (ValueError, TypeError):
                audio_device = None
        
        recorder = SoundDeviceRecorder(
            rate=config.get('audio.rate', 16000),
            channels=config.get('audio.channels', 1),
            chunk=config.get('audio.chunk', 1024),
            device=audio_device,
            vad_config=vad_config,  # 传入VAD配置
            audio_processing_config=config.get('audio.audio_processing'),  # 传入音频处理配置
            max_buffer_seconds=config.get('audio.max_buffer_seconds', 60)  # 缓冲区管理
        )
        
        # 初始化语音服务
        voice_service = VoiceService(config)
        voice_service.set_recorder(recorder)
        
        def on_text_callback(text: str, is_definite: bool, time_info: dict):
            message = {
                "type": "text_final" if is_definite else "text_update",
                "text": text
            }
            if is_definite and time_info:
                message["start_time"] = time_info.get('start_time', 0)
                message["end_time"] = time_info.get('end_time', 0)
            
            # 添加app_id字段（如果有）
            if voice_service._current_app_id:
                message["app_id"] = voice_service._current_app_id
            
            # 详细日志：记录广播的消息类型
            logger.debug(f"[API] 广播消息: type={message['type']}, text_len={len(text)}, is_definite={is_definite}, app_id={message.get('app_id')}")
            broadcast(message)
        
        voice_service.set_on_text_callback(on_text_callback)
        voice_service.set_on_state_change_callback(
            lambda state: broadcast({"type": "state_change", "state": state.value, "app_id": voice_service._current_app_id if voice_service._current_app_id else None})
        )
        
        # 错误回调 - 传递完整的 SystemErrorInfo 对象
        def on_error_callback(error_type: str, msg: str):
            """错误回调，广播给所有前端连接"""
            # 尝试从消息中提取 SystemErrorInfo（如果服务传递了完整对象）
            # 目前先使用简单格式，后续可以扩展
            broadcast({
                "type": "error",
                "error_type": error_type,
                "message": msg,
                # 未来可以在这里添加 error 字段传递 SystemErrorInfo 对象
            })
        
        voice_service.set_on_error_callback(on_error_callback)
        
        # ASR连接超时回调
        def on_timeout_callback():
            """ASR连接超时回调，通知前端"""
            logger.warning("[API] ASR连接超时，通知前端")
            broadcast({
                "type": "asr_timeout",
                "message": "语音识别已达到最大连接时长，已自动停止。您可以重新开始录音。",
                "app_id": voice_service._current_app_id if voice_service._current_app_id else None
            })
        
        voice_service.set_on_timeout_callback(on_timeout_callback)
        
        logger.info("[API] 语音服务初始化完成")
    except Exception as e:
        logger.error(f"[API] 语音服务初始化失败: {e}", exc_info=True)
        raise


def setup_cleanup_service():
    """初始化清理服务"""
    global cleanup_service, config
    
    logger.info("[API] 初始化清理服务...")
    
    try:
        if config is None:
            config = Config()
        
        # 初始化清理服务
        cleanup_service = CleanupService(config._config)
        logger.info("[API] 清理服务初始化完成")
    except Exception as e:
        logger.error(f"[API] 清理服务初始化失败: {e}")
        cleanup_service = None


def setup_llm_service():
    """初始化 LLM 服务和知识库服务（知识库延迟加载）"""
    global llm_service, knowledge_service, summary_agent, smart_chat_agent, config
    
    logger.info("[API] 初始化 LLM 服务...")
    
    try:
        if config is None:
            config = Config()
        
        # 初始化 LLM 服务
        llm_service = LLMService(config)
        
        if llm_service.is_available():
            logger.info("[API] LLM 服务初始化完成")
            
            # 初始化知识库服务（延迟加载模式，不阻塞启动）
            try:
                # 从配置读取知识库目录
                data_dir = Path(config.get('storage.data_dir')).expanduser()
                knowledge_relative = Path(config.get('storage.knowledge'))
                
                knowledge_service = KnowledgeService(
                    data_dir=data_dir,
                    knowledge_relative_path=knowledge_relative,
                    embedding_model=config.get('knowledge.embedding_model', 'all-MiniLM-L6-v2'),
                    lazy_load=config.get('knowledge.lazy_load', True)
                )
                logger.info(f"[API] 知识库服务初始化成功（延迟加载模式，路径: {data_dir / knowledge_relative}）")
            except Exception as e:
                logger.warning(f"[API] 知识库服务初始化失败（可能是依赖未安装）: {e}")
                knowledge_service = None
            
            # 初始化 SummaryAgent
            summary_agent = SummaryAgent(llm_service)
            logger.info(f"[API] {summary_agent.name} 初始化完成")
            
            # 初始化 SmartChatAgent
            smart_chat_agent = SmartChatAgent(
                llm_service=llm_service,
                knowledge_service=knowledge_service
            )
            logger.info(f"[API] {smart_chat_agent.name} 初始化完成")
            
            # 初始化 TranslationAgent
            translation_agent = TranslationAgent(llm_service)
            logger.info(f"[API] {translation_agent.name} 初始化完成")
        else:
            logger.warning("[API] LLM 服务不可用，请检查配置")
            summary_agent = None
            smart_chat_agent = None
            translation_agent = None
            knowledge_service = None
            
    except Exception as e:
        logger.error(f"[API] LLM 服务初始化失败: {e}", exc_info=True)
        llm_service = None
        summary_agent = None
        smart_chat_agent = None
        translation_agent = None
        knowledge_service = None


def setup_logging():
    """配置日志"""
    log_level = os.environ.get('LOG_LEVEL', 'INFO').upper()
    log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    date_format = '%Y-%m-%d %H:%M:%S'
    
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format=log_format,
        datefmt=date_format,
        handlers=[logging.StreamHandler(sys.stdout)]
    )
    
    # 设置第三方库日志级别
    logging.getLogger('aiohttp').setLevel(logging.WARNING)
    logging.getLogger('asyncio').setLevel(logging.WARNING)
    
    logger.info(f"[API] 日志系统已初始化，日志级别: {log_level}")




# ==================== HTTP REST API ====================

@app.get("/")
async def root():
    """根路径 - API信息"""
    return {
        "name": "语音桌面助手 API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "status": "/api/status",
            "start": "/api/recording/start",
            "pause": "/api/recording/pause",
            "resume": "/api/recording/resume",
            "stop": "/api/recording/stop",
            "list_records": "/api/records",
            "get_record": "/api/records/{record_id}",
            "delete_record": "/api/records/{record_id}",
            "delete_records": "/api/records/delete",
            "save_text": "/api/text/save",
            "websocket": "/ws"
        }
    }


@app.get("/api/status", response_model=StatusResponse)
async def get_status():
    """获取当前状态"""
    if not voice_service:
        raise HTTPException(status_code=503, detail="语音服务未初始化")
    
    state = voice_service.get_state()
    # 尝试获取当前文本（如果服务有存储）
    current_text = getattr(voice_service, '_current_text', '')
    
    return StatusResponse(
        state=state.value,
        current_text=current_text
    )


class StartRecordingRequest(BaseModel):
    """开始录音请求"""
    app_id: Optional[str] = None  # 应用ID: 'voice-note', 'voice-chat', 'smart-chat'


@app.post("/api/recording/start", response_model=StartRecordingResponse)
async def start_recording(request: StartRecordingRequest = None):
    """开始录音
    
    Args:
        request: 录音请求，包含app_id
    """
    if not voice_service:
        raise HTTPException(status_code=503, detail="语音服务未初始化")
    
    app_id = request.app_id if request else None
    
    try:
        success = voice_service.start_recording(app_id=app_id)
        if success:
            return StartRecordingResponse(
                success=True,
                message="录音已开始"
            )
        else:
            return StartRecordingResponse(
                success=False,
                message="启动录音失败，请检查配置和权限"
            )
    except Exception as e:
        logger.error(f"启动录音失败: {e}", exc_info=True)
        
        # 创建 SystemErrorInfo 对象
        error_msg = str(e)
        error_info = None
        
        # 根据错误类型创建相应的错误对象
        if "Invalid number of channels" in error_msg or "单声道" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.AUDIO_DEVICE_FORMAT_NOT_SUPPORTED,
                details="音频设备不支持单声道录音",
                technical_info=error_msg
            )
        elif "PortAudioError" in error_msg or "Error opening" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.AUDIO_DEVICE_OPEN_FAILED,
                details="无法打开音频设备",
                technical_info=error_msg
            )
        elif "permission" in error_msg.lower() or "权限" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.AUDIO_DEVICE_PERMISSION_DENIED,
                details="无音频设备访问权限",
                technical_info=error_msg
            )
        else:
            error_info = SystemErrorInfo(
                SystemError.AUDIO_STREAM_ERROR,
                details="音频录制出现问题",
                technical_info=error_msg
            )
        
        # 返回包含 SystemErrorInfo 的响应
        return StartRecordingResponse(
            success=False,
            message=error_info.user_message,
            error=error_info.to_dict()  # 需要在响应模型中添加 error 字段
        )


@app.post("/api/recording/pause", response_model=StartRecordingResponse)
async def pause_recording():
    """暂停录音"""
    if not voice_service:
        raise HTTPException(status_code=503, detail="语音服务未初始化")
    
    try:
        success = voice_service.pause_recording()
        if success:
            return StartRecordingResponse(
                success=True,
                message="录音已暂停"
            )
        else:
            return StartRecordingResponse(
                success=False,
                message="暂停录音失败"
            )
    except Exception as e:
        logger.error(f"暂停录音失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/recording/resume", response_model=StartRecordingResponse)
async def resume_recording():
    """恢复录音"""
    if not voice_service:
        raise HTTPException(status_code=503, detail="语音服务未初始化")
    
    try:
        success = voice_service.resume_recording()
        if success:
            return StartRecordingResponse(
                success=True,
                message="录音已恢复"
            )
        else:
            return StartRecordingResponse(
                success=False,
                message="恢复录音失败"
            )
    except Exception as e:
        logger.error(f"恢复录音失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/recording/stop", response_model=StopRecordingResponse)
async def stop_recording(request: StopRecordingRequest = StopRecordingRequest()):
    """停止录音"""
    if not voice_service:
        raise HTTPException(status_code=503, detail="语音服务未初始化")
    
    try:
        final_asr_text = voice_service.stop_recording()
        
        return StopRecordingResponse(
            success=True,
            final_text=final_asr_text,
            message="录音已停止"
        )
    except Exception as e:
        logger.error(f"停止录音失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class SaveTextRequest(BaseModel):
    """直接保存文本请求"""
    text: str
    app_type: str = 'voice-note'
    blocks: Optional[list] = None
    metadata: Optional[dict] = None  # 完整的metadata（包含blocks, noteInfo等）


class SaveTextResponse(BaseModel):
    """直接保存文本响应"""
    success: bool
    record_id: Optional[str] = None
    message: str
    error: Optional[Dict[str, Any]] = None  # SystemErrorInfo 对象


@app.post("/api/text/save", response_model=SaveTextResponse)
async def save_text_directly(request: SaveTextRequest):
    """直接保存文本到历史记录（不依赖ASR会话）"""
    if not voice_service or not voice_service.storage_provider:
        error_info = SystemErrorInfo(
            SystemError.STORAGE_CONNECTION_FAILED,
            details="存储服务未初始化",
            technical_info="voice_service or storage_provider is None"
        )
        return SaveTextResponse(
            success=False,
            message=error_info.user_message,
            error=error_info.to_dict()
        )
    
    try:
        if not request.text or not request.text.strip():
            has_metadata = bool(request.metadata)
            logger.warning(f"[API] 文本保存被拒绝: 内容为空 (app_type={request.app_type}, metadata={'有' if has_metadata else '无'})")
            error_info = SystemErrorInfo(
                SystemError.STORAGE_WRITE_FAILED,
                details="文本内容为空",
                technical_info="Empty text content"
            )
            return SaveTextResponse(
                success=False,
                message=error_info.user_message,
                error=error_info.to_dict()
            )
        
        # 构建 metadata
        # 优先使用前端传来的完整 metadata（包含 blocks, noteInfo, trigger 等）
        if request.metadata:
            # 前端传来了完整的 metadata，直接使用
            metadata = request.metadata
            # 确保包含必要的系统字段
            if 'language' not in metadata:
                metadata['language'] = voice_service.config.get('asr.language', 'zh-CN')
            if 'provider' not in metadata:
                metadata['provider'] = 'manual'
            if 'input_method' not in metadata:
                metadata['input_method'] = 'keyboard'
            if 'app_type' not in metadata:
                metadata['app_type'] = request.app_type
            if 'created_at' not in metadata:
                metadata['created_at'] = voice_service._get_timestamp()
        else:
            # 降级：使用旧的 blocks 字段（向后兼容）
            metadata = {
                'language': voice_service.config.get('asr.language', 'zh-CN'),
                'provider': 'manual',
                'input_method': 'keyboard',
                'app_type': request.app_type,
                'created_at': voice_service._get_timestamp(),
                'blocks': request.blocks
            }
        
        record_id = voice_service.storage_provider.save_record(request.text, metadata)
        
        # 日志：显示保存的数据结构
        has_blocks = bool(metadata.get('blocks'))
        has_note_info = bool(metadata.get('noteInfo'))
        trigger = metadata.get('trigger', 'unknown')
        logger.info(f"[API] 已直接保存文本记录: {record_id}, trigger={trigger}, blocks={'有' if has_blocks else '无'}, noteInfo={'有' if has_note_info else '无'}")
        
        return SaveTextResponse(
            success=True,
            record_id=record_id,
            message="文本已保存"
        )
    except IOError as e:
        # 磁盘空间或权限错误
        error_msg = str(e)
        if "disk full" in error_msg.lower() or "no space" in error_msg.lower():
            error_info = SystemErrorInfo(
                SystemError.STORAGE_DISK_FULL,
                details="磁盘空间不足",
                technical_info=error_msg
            )
        elif "permission" in error_msg.lower():
            error_info = SystemErrorInfo(
                SystemError.STORAGE_WRITE_FAILED,
                details="没有写入权限",
                technical_info=error_msg
            )
        else:
            error_info = SystemErrorInfo(
                SystemError.STORAGE_WRITE_FAILED,
                details="写入失败",
                technical_info=error_msg
            )
        
        logger.error(f"保存文本失败: {e}", exc_info=True)
        return SaveTextResponse(
            success=False,
            message=error_info.user_message,
            error=error_info.to_dict()
        )
    except Exception as e:
        # 其他未知错误
        error_info = SystemErrorInfo(
            SystemError.SYSTEM_INTERNAL_ERROR,
            details=f"保存文本失败: {str(e)}",
            technical_info=f"{type(e).__name__}: {str(e)}"
        )
        logger.error(f"保存文本失败: {e}", exc_info=True)
        return SaveTextResponse(
            success=False,
            message=error_info.user_message,
            error=error_info.to_dict()
        )


@app.put("/api/records/{record_id}", response_model=SaveTextResponse)
async def update_record(record_id: str, request: SaveTextRequest):
    """更新指定的历史记录（用于自动保存）"""
    if not voice_service or not voice_service.storage_provider:
        error_info = SystemErrorInfo(
            SystemError.STORAGE_CONNECTION_FAILED,
            details="存储服务未初始化",
            technical_info="voice_service or storage_provider is None"
        )
        return SaveTextResponse(
            success=False,
            message=error_info.user_message,
            error=error_info.to_dict()
        )
    
    try:
        # 检查记录是否存在
        existing_record = voice_service.storage_provider.get_record(record_id)
        if not existing_record:
            error_info = SystemErrorInfo(
                SystemError.STORAGE_READ_FAILED,
                details=f"记录不存在: {record_id}",
                technical_info="Record not found"
            )
            return SaveTextResponse(
                success=False,
                message=error_info.user_message,
                error=error_info.to_dict()
            )
        
        # 构建更新的 metadata
        # 优先使用前端传来的完整 metadata（包含 blocks, noteInfo, trigger 等）
        if request.metadata:
            # 前端传来了完整的 metadata，直接使用
            metadata = request.metadata
            # 确保包含必要的系统字段
            if 'language' not in metadata:
                metadata['language'] = voice_service.config.get('asr.language', 'zh-CN')
            if 'provider' not in metadata:
                metadata['provider'] = 'manual'
            if 'input_method' not in metadata:
                metadata['input_method'] = 'keyboard'
            if 'app_type' not in metadata:
                metadata['app_type'] = request.app_type
            metadata['updated_at'] = voice_service._get_timestamp()
        else:
            # 降级：使用旧的 blocks 字段（向后兼容）
            metadata = {
                'language': voice_service.config.get('asr.language', 'zh-CN'),
                'provider': 'manual',
                'input_method': 'keyboard',
                'app_type': request.app_type,
                'updated_at': voice_service._get_timestamp(),
                'blocks': request.blocks,
            }
        
        # 更新记录
        success = voice_service.storage_provider.update_record(record_id, request.text, metadata)
        
        if success:
            # 日志：显示保存的数据结构
            has_blocks = bool(metadata.get('blocks'))
            has_note_info = bool(metadata.get('noteInfo'))
            trigger = metadata.get('trigger', 'unknown')
            logger.info(f"[API] 已更新记录: {record_id}, trigger={trigger}, blocks={'有' if has_blocks else '无'}, noteInfo={'有' if has_note_info else '无'}")
            return SaveTextResponse(
                success=True,
                record_id=record_id,
                message="记录已更新"
            )
        else:
            error_info = SystemErrorInfo(
                SystemError.STORAGE_WRITE_FAILED,
                details="更新记录失败",
                technical_info="update_record returned False"
            )
            return SaveTextResponse(
                success=False,
                message=error_info.user_message,
                error=error_info.to_dict()
            )
            
    except IOError as e:
        # 磁盘空间或权限错误
        error_msg = str(e)
        if "No space left" in error_msg or "Disk quota exceeded" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.STORAGE_WRITE_FAILED,
                details="磁盘空间不足",
                suggestion="请清理磁盘空间后重试",
                technical_info=error_msg
            )
        elif "Permission denied" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.STORAGE_PERMISSION_DENIED,
                details="没有写入权限",
                suggestion="请检查文件权限设置",
                technical_info=error_msg
            )
        else:
            error_info = SystemErrorInfo(
                SystemError.STORAGE_WRITE_FAILED,
                details=f"更新记录失败: {error_msg}",
                technical_info=error_msg
            )
        
        logger.error(f"更新记录失败: {e}", exc_info=True)
        return SaveTextResponse(
            success=False,
            message=error_info.user_message,
            error=error_info.to_dict()
        )
    except Exception as e:
        # 其他未知错误
        error_info = SystemErrorInfo(
            SystemError.SYSTEM_INTERNAL_ERROR,
            details=f"更新记录失败: {str(e)}",
            technical_info=f"{type(e).__name__}: {str(e)}"
        )
        logger.error(f"更新记录失败: {e}", exc_info=True)
        return SaveTextResponse(
            success=False,
            message=error_info.user_message,
            error=error_info.to_dict()
        )


@app.get("/api/records", response_model=ListRecordsResponse)
async def list_records(limit: int = 50, offset: int = 0, app_type: str = None):
    """列出历史记录
    
    Args:
        limit: 返回记录数量限制
        offset: 偏移量
        app_type: 应用类型筛选（可选）：'voice-note', 'voice-chat', 'all'
    """
    if not voice_service or not voice_service.storage_provider:
        error_info = SystemErrorInfo(
            SystemError.STORAGE_CONNECTION_FAILED,
            details="存储服务未初始化",
            technical_info="voice_service or storage_provider is None"
        )
        return ListRecordsResponse(
            success=False,
            records=[],
            total=0,
            limit=limit,
            offset=offset,
            error=error_info.to_dict()
        )
    
    try:
        # 'all' 表示查询所有类型
        filter_app_type = None if app_type == 'all' or not app_type else app_type
        
        records = voice_service.storage_provider.list_records(
            limit=limit, 
            offset=offset,
            app_type=filter_app_type
        )
        
        # 使用count_records方法优化总数计算
        if hasattr(voice_service.storage_provider, 'count_records'):
            total = voice_service.storage_provider.count_records(app_type=filter_app_type)
        else:
            # 降级方案：如果存储提供者不支持count，使用旧方法
            all_records = voice_service.storage_provider.list_records(
                limit=10000, 
                offset=0,
                app_type=filter_app_type
            )
            total = len(all_records)
        
        record_items = [
            RecordItem(
                id=r['id'],
                text=r['text'],
                metadata=r.get('metadata', {}),
                created_at=r.get('created_at', '')
            )
            for r in records
        ]
        
        return ListRecordsResponse(
            success=True,
            records=record_items,
            total=total,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        error_info = SystemErrorInfo(
            SystemError.STORAGE_READ_FAILED,
            details=f"读取记录列表失败: {str(e)}",
            technical_info=f"{type(e).__name__}: {str(e)}"
        )
        logger.error(f"列出记录失败: {e}", exc_info=True)
        return ListRecordsResponse(
            success=False,
            records=[],
            total=0,
            limit=limit,
            offset=offset,
            error=error_info.to_dict()
        )


@app.get("/api/records/{record_id}", response_model=RecordItem)
async def get_record(record_id: str):
    """获取单条记录"""
    if not voice_service or not voice_service.storage_provider:
        raise HTTPException(status_code=503, detail="存储服务未初始化")
    
    try:
        record = voice_service.storage_provider.get_record(record_id)
        if not record:
            raise HTTPException(status_code=404, detail="记录不存在")
        
        logger.info(f"[get_record] 返回记录: id={record['id']}, app_type={record.get('app_type', 'voice-note')}, text长度={len(record.get('text', ''))}, metadata类型={type(record.get('metadata'))}")
        
        return RecordItem(
            id=record['id'],
            text=record['text'],
            metadata=record.get('metadata', {}),
            app_type=record.get('app_type', 'voice-note'),  # 添加 app_type
            created_at=record.get('created_at', '')
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取记录失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/records/{record_id}/export")
async def export_record_markdown(record_id: str, format: str = 'md'):
    """
    导出记录为文件
    
    Args:
        record_id: 记录 ID
        format: 导出格式，'md'（Markdown）、'zip'（Markdown+图片打包）或 'html'（单文件HTML）
        
    Returns:
        Markdown 文件流、ZIP 文件流或 HTML 文件流
    """
    if not voice_service or not voice_service.storage_provider:
        raise HTTPException(status_code=503, detail="存储服务未初始化")
    
    try:
        # 获取记录
        record = voice_service.storage_provider.get_record(record_id)
        if not record:
            raise HTTPException(status_code=404, detail="记录不存在")
        
        # 生成时间戳和标题
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        metadata = record.get('metadata', {})
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except:
                metadata = {}
        
        title = "笔记"
        blocks = metadata.get('blocks', [])
        note_info_block = next((b for b in blocks if b.get('type') == 'note-info'), None)
        if note_info_block and note_info_block.get('noteInfo', {}).get('title'):
            title = note_info_block['noteInfo']['title']
            import re
            title = re.sub(r'[<>:"/\\|?*]', '', title).strip()
            if not title:
                title = "笔记"
        
        if format == 'zip':
            # ZIP 打包导出（包含图片）
            from src.core.config import Config
            config = Config()
            # 获取数据目录
            data_dir_str = config.get('storage.data_dir', '~/Library/Application Support/MindVoice')
            data_dir = Path(data_dir_str).expanduser()
            
            zip_content = MarkdownExportService.export_record_to_zip(record, data_dir)
            filename = f"{title}_{timestamp}.zip"
            
            logger.info(f"[Export] 打包导出记录 {record_id} 为 ZIP: {filename}")
            
            from urllib.parse import quote
            encoded_filename = quote(filename.encode('utf-8'))
            
            return Response(
                content=zip_content,
                media_type='application/zip',
                headers={
                    'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_filename}"
                }
            )
        
        elif format == 'html':
            # HTML 单文件导出（图片 Base64 嵌入）
            from src.core.config import Config
            config = Config()
            # 获取数据目录
            data_dir_str = config.get('storage.data_dir', '~/Library/Application Support/MindVoice')
            data_dir = Path(data_dir_str).expanduser()
            
            html_content = HtmlExportService.export_record_to_html(record, data_dir)
            filename = f"{title}_{timestamp}.html"
            
            logger.info(f"[Export] 导出记录 {record_id} 为 HTML: {filename}")
            
            from urllib.parse import quote
            encoded_filename = quote(filename.encode('utf-8'))
            
            return Response(
                content=html_content.encode('utf-8'),
                media_type='text/html; charset=utf-8',
                headers={
                    'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_filename}"
                }
            )
        
        else:
            # Markdown 导出（图片使用 API URL）
            markdown_content = MarkdownExportService.export_record_to_markdown(record)
            filename = f"{title}_{timestamp}.md"
            
            logger.info(f"[Export] 导出记录 {record_id} 为 Markdown: {filename}")
            
            from urllib.parse import quote
            encoded_filename = quote(filename.encode('utf-8'))
            
            return Response(
                content=markdown_content.encode('utf-8'),
                media_type='text/markdown; charset=utf-8',
                headers={
                    'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_filename}"
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Export] 导出失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@app.delete("/api/records/{record_id}")
async def delete_record(record_id: str):
    """删除记录"""
    if not voice_service or not voice_service.storage_provider:
        raise HTTPException(status_code=503, detail="存储服务未初始化")
    
    try:
        success = voice_service.storage_provider.delete_record(record_id)
        if not success:
            raise HTTPException(status_code=404, detail="记录不存在")
        
        return {"success": True, "message": "记录已删除"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除记录失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class DeleteRecordsRequest(BaseModel):
    """批量删除记录请求"""
    record_ids: list[str]


@app.post("/api/records/delete", response_model=dict)
async def delete_records(request: DeleteRecordsRequest):
    """批量删除记录"""
    if not voice_service or not voice_service.storage_provider:
        error_info = SystemErrorInfo(
            SystemError.STORAGE_CONNECTION_FAILED,
            details="存储服务未初始化",
            technical_info="voice_service or storage_provider is None"
        )
        return {
            "success": False,
            "message": error_info.user_message,
            "error": error_info.to_dict()
        }
    
    try:
        if not request.record_ids:
            error_info = SystemErrorInfo(
                SystemError.STORAGE_WRITE_FAILED,
                details="未选择要删除的记录",
                technical_info="Empty record_ids list"
            )
            return {
                "success": False,
                "message": error_info.user_message,
                "error": error_info.to_dict()
            }
        
        # 检查存储提供者是否支持批量删除
        if hasattr(voice_service.storage_provider, 'delete_records'):
            deleted_count = voice_service.storage_provider.delete_records(request.record_ids)
            return {
                "success": True,
                "message": f"已删除 {deleted_count} 条记录",
                "deleted_count": deleted_count
            }
        else:
            # 降级方案：逐个删除
            deleted_count = 0
            for record_id in request.record_ids:
                if voice_service.storage_provider.delete_record(record_id):
                    deleted_count += 1
            return {
                "success": True,
                "message": f"已删除 {deleted_count} 条记录",
                "deleted_count": deleted_count
            }
    except Exception as e:
        error_info = SystemErrorInfo(
            SystemError.STORAGE_WRITE_FAILED,
            details=f"删除记录失败: {str(e)}",
            technical_info=f"{type(e).__name__}: {str(e)}"
        )
        logger.error(f"批量删除记录失败: {e}", exc_info=True)
        return {
            "success": False,
            "message": error_info.user_message,
            "deleted_count": 0,
            "error": error_info.to_dict()
        }


# ==================== 图片管理 API ====================

class SaveImageRequest(BaseModel):
    """保存图片请求"""
    image_data: str = Field(..., description="Base64编码的图片数据")
    filename: Optional[str] = Field(None, description="可选的文件名")


class SaveImageResponse(BaseModel):
    """保存图片响应"""
    success: bool
    image_url: Optional[str] = None
    message: str
    error: Optional[Dict[str, Any]] = None


@app.post("/api/images/save", response_model=SaveImageResponse)
async def save_image(request: SaveImageRequest):
    """保存Base64编码的图片到本地
    
    Args:
        request: 包含Base64图片数据的请求
    
    Returns:
        保存后的图片URL（相对路径）
    """
    try:
        # 解析 Base64 数据
        # 格式可能是: data:image/png;base64,iVBORw0KG...
        # 或直接是: iVBORw0KG...
        image_data = request.image_data
        if ',' in image_data:
            # 移除 data URL 前缀
            image_data = image_data.split(',', 1)[1]
        
        # 解码 Base64
        try:
            image_bytes = base64.b64decode(image_data)
        except Exception as e:
            return SaveImageResponse(
                success=False,
                message="图片数据格式错误",
                error={
                    "code": "INVALID_IMAGE_DATA",
                    "details": f"Base64解码失败: {str(e)}"
                }
            )
        
        # 创建图片存储目录
        data_dir = Path(config.get('storage.data_dir')).expanduser()
        images_relative = Path(config.get('storage.images'))
        images_dir = data_dir / images_relative
        images_dir.mkdir(parents=True, exist_ok=True)
        
        # 生成唯一文件名
        if request.filename:
            filename = request.filename
        else:
            # 使用时间戳 + UUID 生成唯一文件名
            timestamp = int(asyncio.get_event_loop().time() * 1000)
            unique_id = str(uuid.uuid4())[:8]
            filename = f"{timestamp}-{unique_id}.png"
        
        # 保存图片
        image_path = images_dir / filename
        with open(image_path, 'wb') as f:
            f.write(image_bytes)
        
        # 返回相对路径（前端可以通过 /api/images/{filename} 访问）
        relative_url = f"images/{filename}"
        
        logger.info(f"[API] 已保存图片: {relative_url}, 大小: {len(image_bytes)} bytes")
        
        return SaveImageResponse(
            success=True,
            image_url=relative_url,
            message="图片已保存"
        )
        
    except Exception as e:
        logger.error(f"保存图片失败: {e}", exc_info=True)
        return SaveImageResponse(
            success=False,
            message="保存图片失败",
            error={
                "code": "SAVE_IMAGE_FAILED",
                "details": str(e)
            }
        )


@app.get("/api/images/{filename}")
async def get_image(filename: str):
    """获取图片文件
    
    Args:
        filename: 图片文件名
    
    Returns:
        图片文件
    """
    try:
        # 安全检查：防止路径遍历攻击
        if '..' in filename or '/' in filename or '\\' in filename:
            raise HTTPException(status_code=400, detail="无效的文件名")
        
        # 从配置读取图片目录
        data_dir = Path(config.get('storage.data_dir')).expanduser()
        images_relative = Path(config.get('storage.images'))
        image_path = data_dir / images_relative / filename
        
        if not image_path.exists():
            raise HTTPException(status_code=404, detail="图片不存在")
        
        return FileResponse(image_path)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取图片失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="获取图片失败")


# ==================== 音频设备管理 API ====================

class AudioDeviceInfo(BaseModel):
    """音频设备信息"""
    id: int
    name: str
    channels: int
    samplerate: float
    hostapi: int


class ListAudioDevicesResponse(BaseModel):
    """列出音频设备响应"""
    success: bool
    devices: list[AudioDeviceInfo]
    current_device: Optional[int] = None


class SetAudioDeviceRequest(BaseModel):
    """设置音频设备请求"""
    device: Optional[int] = None  # None表示使用默认设备


class SetAudioDeviceResponse(BaseModel):
    """设置音频设备响应"""
    success: bool
    message: str


@app.get("/api/audio/devices", response_model=ListAudioDevicesResponse)
async def list_audio_devices(refresh: bool = False):
    """获取所有输入音频设备列表
    
    Args:
        refresh: 是否强制刷新设备列表（重新扫描系统设备）
    """
    if not recorder:
        raise HTTPException(status_code=503, detail="录音器未初始化")
    
    try:
        # 传递 refresh 参数以支持强制刷新设备列表
        devices = SoundDeviceRecorder.list_input_devices(force_refresh=refresh)
        device_infos = [
            AudioDeviceInfo(
                id=d['id'],
                name=d['name'],
                channels=d['channels'],
                samplerate=d['samplerate'],
                hostapi=d['hostapi']
            )
            for d in devices
        ]
        
        current_device = recorder.device
        
        return ListAudioDevicesResponse(
            success=True,
            devices=device_infos,
            current_device=current_device
        )
    except Exception as e:
        logger.error(f"获取音频设备列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/audio/device", response_model=SetAudioDeviceResponse)
async def set_audio_device(request: SetAudioDeviceRequest):
    """设置音频设备"""
    global recorder, config
    
    if not recorder:
        raise HTTPException(status_code=503, detail="录音器未初始化")
    
    # 检查录音器状态
    if recorder.get_state() != RecordingState.IDLE:
        return SetAudioDeviceResponse(
            success=False,
            message="无法更改设备：请先停止录音"
        )
    
    try:
        # 设置设备
        success = recorder.set_device(request.device)
        if not success:
            return SetAudioDeviceResponse(
                success=False,
                message="设置设备失败"
            )
        
        # 保存到配置
        if config:
            config.set('audio.device', request.device)
            config.save()
            logger.info(f"[API] 音频设备已设置为: {request.device}，配置已保存")
        
        return SetAudioDeviceResponse(
            success=True,
            message=f"音频设备已设置为: {request.device if request.device is not None else '默认设备'}"
        )
    except Exception as e:
        logger.error(f"设置音频设备失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ASR配置管理 API ====================

class ASRConfigResponse(BaseModel):
    """ASR配置响应"""
    success: bool
    config_source: str  # 'user' 或 'vendor'
    current_config: dict
    vendor_config: dict
    message: Optional[str] = None


class SetASRConfigRequest(BaseModel):
    """设置ASR配置请求"""
    use_user_config: bool  # True=使用用户配置，False=使用厂商配置
    config: Optional[dict] = None  # 用户自定义配置（仅在use_user_config=True时需要）


class SetASRConfigResponse(BaseModel):
    """设置ASR配置响应"""
    success: bool
    message: str


@app.get("/api/asr/config", response_model=ASRConfigResponse)
async def get_asr_config():
    """获取ASR配置（包括当前配置、厂商配置和配置源）"""
    if not config:
        raise HTTPException(status_code=503, detail="配置未初始化")
    
    try:
        config_source = config.get_asr_config_source()
        current_config = config.get_asr_config(use_user_config=(config_source == 'user'))
        vendor_config = config.get_vendor_asr_config()
        
        # 隐藏敏感信息（只显示前8个字符）
        def mask_sensitive(value: str) -> str:
            if not value or len(value) <= 8:
                return '***' if value else ''
            return value[:8] + '...'
        
        current_config_masked = {
            'base_url': current_config.get('base_url', ''),
            'app_id': current_config.get('app_id', ''),
            'app_key': mask_sensitive(current_config.get('app_key', '')),
            'access_key': mask_sensitive(current_config.get('access_key', '')),
            'language': current_config.get('language', 'zh-CN')
        }
        
        vendor_config_masked = {
            'base_url': vendor_config.get('base_url', ''),
            'app_id': vendor_config.get('app_id', ''),
            'app_key': mask_sensitive(vendor_config.get('app_key', '')),
            'access_key': mask_sensitive(vendor_config.get('access_key', '')),
            'language': vendor_config.get('language', 'zh-CN')
        }
        
        return ASRConfigResponse(
            success=True,
            config_source=config_source,
            current_config=current_config_masked,
            vendor_config=vendor_config_masked
        )
    except Exception as e:
        logger.error(f"获取ASR配置失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/asr/config", response_model=SetASRConfigResponse)
async def set_asr_config(request: SetASRConfigRequest):
    """设置ASR配置"""
    global voice_service
    
    if not config:
        raise HTTPException(status_code=503, detail="配置未初始化")
    
    # 检查录音器状态
    if voice_service and voice_service.get_state() != RecordingState.IDLE:
        return SetASRConfigResponse(
            success=False,
            message="无法更改配置：请先停止录音"
        )
    
    try:
        if request.use_user_config:
            # 使用用户自定义配置
            if not request.config:
                return SetASRConfigResponse(
                    success=False,
                    message="使用用户配置时，必须提供配置内容"
                )
            
            # 验证配置
            required_fields = ['app_id', 'app_key', 'access_key']
            for field in required_fields:
                if not request.config.get(field):
                    return SetASRConfigResponse(
                        success=False,
                        message=f"配置不完整：缺少 {field}"
                    )
            
            # 保存用户配置
            user_config = {
                'base_url': request.config.get('base_url', 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel'),
                'app_id': request.config.get('app_id', ''),
                'app_key': request.config.get('app_key', ''),
                'access_key': request.config.get('access_key', ''),
                'language': request.config.get('language', 'zh-CN')
            }
            config.save_user_asr_config(user_config)
            
            # 重新加载ASR提供商
            if voice_service:
                voice_service.reload_asr_provider(use_user_config=True)
            
            return SetASRConfigResponse(
                success=True,
                message="用户自定义配置已保存并生效"
            )
        else:
            # 使用厂商配置（删除用户配置）
            config.delete_user_asr_config()
            
            # 重新加载ASR提供商
            if voice_service:
                voice_service.reload_asr_provider(use_user_config=False)
            
            return SetASRConfigResponse(
                success=True,
                message="已切换到厂商配置"
            )
    except Exception as e:
        logger.error(f"设置ASR配置失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== LLM API ====================

@app.get("/api/llm/info", response_model=LLMInfoResponse)
async def get_llm_info():
    """获取LLM服务信息"""
    if not llm_service:
        return LLMInfoResponse(available=False)
    
    try:
        info = llm_service.get_provider_info()
        return LLMInfoResponse(**info)
    except Exception as e:
        logger.error(f"获取LLM信息失败: {e}")
        return LLMInfoResponse(available=False)


@app.post("/api/llm/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """LLM对话接口（非流式）
    
    请求示例：
    {
        "messages": [
            {"role": "system", "content": "你是一个助手"},
            {"role": "user", "content": "你好"}
        ],
        "temperature": 0.7,
        "max_tokens": 2000
    }
    """
    if not llm_service or not llm_service.is_available():
        error_info = SystemErrorInfo(
            SystemError.LLM_SERVICE_UNAVAILABLE,
            details="LLM服务不可用",
            technical_info="llm_service is None or not available"
        )
        return ChatResponse(
            success=False,
            error=error_info.to_dict()
        )
    
    try:
        # 转换消息格式
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
        
        # 调用LLM服务
        response = await llm_service.chat(
            messages=messages,
            stream=False,
            temperature=request.temperature,
            max_tokens=request.max_tokens
        )
        
        return ChatResponse(success=True, message=response)
        
    except Exception as e:
        # LLM服务已经在内部进行了错误分类，这里捕获异常后创建错误信息
        error_msg = str(e).lower()
        
        if "rate" in error_msg or "limit" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_RATE_LIMIT,
                details="请求频率超限",
                technical_info=str(e)
            )
        elif "auth" in error_msg or "401" in error_msg or "403" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_AUTH_FAILED,
                details="认证失败",
                technical_info=str(e)
            )
        elif "timeout" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_REQUEST_TIMEOUT,
                details="请求超时",
                technical_info=str(e)
            )
        elif "quota" in error_msg or "balance" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_QUOTA_EXCEEDED,
                details="配额已用完",
                technical_info=str(e)
            )
        else:
            error_info = SystemErrorInfo(
                SystemError.LLM_SERVICE_UNAVAILABLE,
                details=f"LLM对话失败: {str(e)}",
                technical_info=f"{type(e).__name__}: {str(e)}"
            )
        
        logger.error(f"LLM对话失败: {e}", exc_info=True)
        return ChatResponse(success=False, error=error_info.to_dict())


@app.post("/api/llm/simple-chat", response_model=ChatResponse)
async def simple_chat(request: SimpleChatRequest):
    """简化的LLM对话接口（单轮对话）
    
    支持流式和非流式响应。
    
    请求示例：
    {
        "message": "你好，请介绍一下你自己",
        "system_prompt": "你是一个友好的助手",
        "temperature": 0.7,
        "stream": false
    }
    
    流式响应格式（SSE）：
    data: {"chunk": "文本片段"}
    data: [DONE]
    """
    if not llm_service or not llm_service.is_available():
        error_info = SystemErrorInfo(
            SystemError.LLM_SERVICE_UNAVAILABLE,
            details="LLM服务不可用",
            technical_info="llm_service is None or not available"
        )
        return ChatResponse(
            success=False,
            error=error_info.to_dict()
        )
    
    try:
        # 判断是否使用流式输出
        if request.stream:
            # 返回流式响应
            async def generate():
                try:
                    async for chunk in llm_service.simple_chat(
                        user_message=request.message,
                        system_prompt=request.system_prompt,
                        stream=True,
                        temperature=request.temperature,
                        max_tokens=request.max_tokens
                    ):
                        # 使用SSE格式发送数据
                        yield f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                except Exception as e:
                    logger.error(f"流式响应失败: {e}", exc_info=True)
                    # 发送结构化错误信息
                    error_info = SystemErrorInfo(
                        SystemError.LLM_SERVICE_UNAVAILABLE,
                        details=f"流式响应失败: {str(e)}",
                        technical_info=f"{type(e).__name__}: {str(e)}"
                    )
                    yield f"data: {json.dumps({'error': error_info.to_dict()}, ensure_ascii=False)}\n\n"
            
            return StreamingResponse(
                generate(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        else:
            # 非流式响应
            response = await llm_service.simple_chat(
                user_message=request.message,
                system_prompt=request.system_prompt,
                stream=False,
                temperature=request.temperature,
                max_tokens=request.max_tokens
            )
            
            return ChatResponse(success=True, message=response)
        
    except Exception as e:
        error_msg = str(e).lower()
        
        if "rate" in error_msg or "limit" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_RATE_LIMIT,
                details="请求频率超限",
                technical_info=str(e)
            )
        elif "auth" in error_msg or "401" in error_msg or "403" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_AUTH_FAILED,
                details="认证失败",
                technical_info=str(e)
            )
        elif "timeout" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_REQUEST_TIMEOUT,
                details="请求超时",
                technical_info=str(e)
            )
        else:
            error_info = SystemErrorInfo(
                SystemError.LLM_SERVICE_UNAVAILABLE,
                details=f"LLM简单对话失败: {str(e)}",
                technical_info=f"{type(e).__name__}: {str(e)}"
            )
        
        logger.error(f"LLM简单对话失败: {e}", exc_info=True)
        return ChatResponse(success=False, error=error_info.to_dict())


@app.post("/api/summary/generate")
async def generate_summary(request: SimpleChatRequest):
    """生成会议小结（使用专门的SummaryAgent）
    
    请求示例：
    {
        "message": "会议记录内容...",
        "stream": true
    }
    
    注意：
    - system_prompt将被忽略，使用SummaryAgent内置的提示词
    - 输入内容会自动过滤掉已有的小结块
    - 支持流式和非流式输出
    """
    if not summary_agent or not summary_agent.is_available():
        error_info = SystemErrorInfo(
            SystemError.LLM_SERVICE_UNAVAILABLE,
            details="小结服务不可用",
            technical_info="summary_agent is None or not available"
        )
        return ChatResponse(
            success=False,
            error=error_info.to_dict()
        )
    
    try:
        # 判断是否使用流式输出
        if request.stream:
            # 返回流式响应
            async def generate():
                try:
                    # generate_summary 返回 AsyncIterator，直接迭代
                    async for chunk in await summary_agent.generate_summary(
                        content=request.message,
                        stream=True,
                        temperature=request.temperature,
                        max_tokens=request.max_tokens
                    ):
                        # 使用SSE格式发送数据
                        yield f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                except Exception as e:
                    logger.error(f"流式生成小结失败: {e}", exc_info=True)
                    error_info = SystemErrorInfo(
                        SystemError.LLM_SERVICE_UNAVAILABLE,
                        details=f"流式生成小结失败: {str(e)}",
                        technical_info=f"{type(e).__name__}: {str(e)}"
                    )
                    yield f"data: {json.dumps({'error': error_info.to_dict()}, ensure_ascii=False)}\n\n"
            
            return StreamingResponse(
                generate(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        else:
            # 非流式响应
            summary = await summary_agent.generate_summary(
                content=request.message,
                stream=False,
                temperature=request.temperature,
                max_tokens=request.max_tokens
            )
            
            return ChatResponse(success=True, message=summary)
        
    except ValueError as e:
        # 输入验证错误
        logger.warning(f"输入验证失败: {e}")
        error_info = SystemErrorInfo(
            SystemError.STORAGE_INVALID_CONTENT,
            details="输入内容验证失败",
            technical_info=str(e)
        )
        return ChatResponse(success=False, error=error_info.to_dict())
    except Exception as e:
        error_msg = str(e).lower()
        
        if "rate" in error_msg or "limit" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_RATE_LIMIT,
                details="请求频率超限",
                technical_info=str(e)
            )
        elif "timeout" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_REQUEST_TIMEOUT,
                details="请求超时",
                technical_info=str(e)
            )
        else:
            error_info = SystemErrorInfo(
                SystemError.LLM_SERVICE_UNAVAILABLE,
                details=f"生成小结失败: {str(e)}",
                technical_info=f"{type(e).__name__}: {str(e)}"
            )
        
        logger.error(f"生成小结失败: {e}", exc_info=True)
        return ChatResponse(success=False, error=error_info.to_dict())


# ==================== 翻译 API ====================

@app.post("/api/translate")
async def translate_text(request: TranslateRequest):
    """
    翻译单条文本
    
    支持流式和非流式输出
    """
    if not translation_agent or not translation_agent.is_available():
        error_info = SystemErrorInfo(
            SystemError.LLM_SERVICE_UNAVAILABLE,
            details="翻译服务不可用",
            technical_info="translation_agent is None or not available"
        )
        return ChatResponse(success=False, error=error_info.to_dict())
    
    try:
        if request.stream:
            # 流式翻译
            async def generate():
                try:
                    result = await translation_agent.translate(
                        text=request.text,
                        source_lang=request.source_lang,
                        target_lang=request.target_lang,
                        stream=True
                    )
                    
                    async for chunk in result:
                        yield f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
                    
                    yield "data: [DONE]\n\n"
                    
                except Exception as e:
                    logger.error(f"[API] 流式翻译失败: {e}")
                    error_info = SystemErrorInfo(
                        SystemError.LLM_ERROR,
                        details=f"流式翻译失败: {str(e)}",
                        technical_info=f"{type(e).__name__}: {str(e)}"
                    )
                    yield f"data: {json.dumps({'error': error_info.to_dict()}, ensure_ascii=False)}\n\n"
            
            return StreamingResponse(
                generate(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                }
            )
        else:
            # 非流式翻译
            result = await translation_agent.translate(
                text=request.text,
                source_lang=request.source_lang,
                target_lang=request.target_lang,
                stream=False
            )
            
            return {
                "success": True,
                "translation": result
            }
    
    except Exception as e:
        logger.error(f"[API] 翻译失败: {e}")
        error_info = SystemErrorInfo(
            SystemError.LLM_ERROR,
            details=f"翻译失败: {str(e)}",
            technical_info=f"{type(e).__name__}: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=error_info.to_dict())


@app.post("/api/translate/batch")
async def batch_translate(request: BatchTranslateRequest):
    """
    批量翻译多条文本
    
    用于语言切换时一次性翻译所有block
    """
    if not translation_agent or not translation_agent.is_available():
        error_info = SystemErrorInfo(
            SystemError.LLM_SERVICE_UNAVAILABLE,
            details="翻译服务不可用",
            technical_info="translation_agent is None or not available"
        )
        return {"success": False, "error": error_info.to_dict()}
    
    try:
        results = await translation_agent.batch_translate(
            texts=request.texts,
            source_lang=request.source_lang,
            target_lang=request.target_lang
        )
        
        return {
            "success": True,
            "translations": results
        }
    
    except Exception as e:
        logger.error(f"[API] 批量翻译失败: {e}")
        error_info = SystemErrorInfo(
            SystemError.LLM_ERROR,
            details=f"批量翻译失败: {str(e)}",
            technical_info=f"{type(e).__name__}: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=error_info.to_dict())


# ==================== SmartChat API ====================

class SmartChatRequest(BaseModel):
    """SmartChat 请求模型"""
    message: str = Field(..., description="用户消息")
    stream: bool = Field(default=False, description="是否流式输出")
    use_history: bool = Field(default=True, description="是否使用对话历史")
    use_knowledge: bool = Field(default=True, description="是否检索知识库")
    knowledge_top_k: int = Field(default=3, description="知识库检索数量")
    temperature: Optional[float] = Field(default=None, description="温度参数")
    max_tokens: Optional[int] = Field(default=None, description="最大token数")


class SmartChatHistoryResponse(BaseModel):
    """对话历史响应"""
    success: bool
    total_turns: int
    total_messages: int
    has_knowledge_service: bool


@app.post("/api/smartchat/chat")
async def smart_chat(request: SmartChatRequest):
    """SmartChat 智能对话
    
    功能：
    - 支持多轮对话（自动管理上下文）
    - 自动检索知识库（如果可用）
    - 流式和非流式输出
    
    请求示例：
    {
        "message": "你好，请介绍一下知识库的内容",
        "stream": true,
        "use_history": true,
        "use_knowledge": true
    }
    """
    if not smart_chat_agent or not smart_chat_agent.is_available():
        error_info = SystemErrorInfo(
            SystemError.LLM_SERVICE_UNAVAILABLE,
            details="SmartChat 服务不可用",
            technical_info="smart_chat_agent is None or not available"
        )
        return ChatResponse(
            success=False,
            error=error_info.to_dict()
        )
    
    try:
        # 准备参数
        kwargs = {}
        if request.temperature is not None:
            kwargs['temperature'] = request.temperature
        if request.max_tokens is not None:
            kwargs['max_tokens'] = request.max_tokens
        
        if request.stream:
            # 流式响应
            async def generate():
                try:
                    result = await smart_chat_agent.chat(
                        user_message=request.message,
                        stream=True,
                        use_history=request.use_history,
                        use_knowledge=request.use_knowledge,
                        knowledge_top_k=request.knowledge_top_k,
                        **kwargs
                    )
                    
                    async for chunk in result:
                        yield f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
                    
                    yield "data: [DONE]\n\n"
                    
                except Exception as e:
                    logger.error(f"SmartChat 流式生成失败: {e}", exc_info=True)
                    error_info = SystemErrorInfo(
                        SystemError.LLM_SERVICE_UNAVAILABLE,
                        details=f"对话失败: {str(e)}",
                        technical_info=f"{type(e).__name__}: {str(e)}"
                    )
                    yield f"data: {json.dumps({'error': error_info.to_dict()}, ensure_ascii=False)}\n\n"
            
            return StreamingResponse(
                generate(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )
        else:
            # 非流式响应
            response = await smart_chat_agent.chat(
                user_message=request.message,
                stream=False,
                use_history=request.use_history,
                use_knowledge=request.use_knowledge,
                knowledge_top_k=request.knowledge_top_k,
                **kwargs
            )
            
            return ChatResponse(success=True, message=response)
    
    except Exception as e:
        logger.error(f"SmartChat 对话失败: {e}", exc_info=True)
        error_msg = str(e).lower()
        
        if "rate" in error_msg or "limit" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_RATE_LIMIT,
                details="请求频率超限",
                technical_info=str(e)
            )
        elif "timeout" in error_msg:
            error_info = SystemErrorInfo(
                SystemError.LLM_REQUEST_TIMEOUT,
                details="请求超时",
                technical_info=str(e)
            )
        else:
            error_info = SystemErrorInfo(
                SystemError.LLM_SERVICE_UNAVAILABLE,
                details=f"对话失败: {str(e)}",
                technical_info=f"{type(e).__name__}: {str(e)}"
            )
        
        return ChatResponse(success=False, error=error_info.to_dict())


@app.post("/api/smartchat/clear_history")
async def clear_chat_history():
    """清空对话历史"""
    if not smart_chat_agent:
        raise HTTPException(status_code=503, detail="SmartChat 服务不可用")
    
    smart_chat_agent.clear_history()
    return {"success": True, "message": "对话历史已清空"}


@app.get("/api/smartchat/history_status")
async def get_history_status():
    """获取对话历史状态"""
    if not smart_chat_agent:
        raise HTTPException(status_code=503, detail="SmartChat 服务不可用")
    
    summary = smart_chat_agent.get_conversation_summary()
    return SmartChatHistoryResponse(success=True, **summary)


# ==================== 清理服务 API ====================

@app.post("/api/cleanup/manual")
async def manual_cleanup(clean_logs: bool = True, clean_images: bool = True):
    """手动触发清理任务
    
    Args:
        clean_logs: 是否清理日志文件
        clean_images: 是否清理孤儿图片
    
    Returns:
        清理结果
    """
    if not cleanup_service:
        raise HTTPException(status_code=503, detail="清理服务未初始化")
    
    try:
        result = await cleanup_service.manual_cleanup(clean_logs, clean_images)
        return result
    except Exception as e:
        logger.error(f"手动清理失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"清理失败: {str(e)}")


@app.get("/api/cleanup/status")
async def get_cleanup_status():
    """获取清理服务状态"""
    if not cleanup_service:
        return {
            "enabled": False,
            "message": "清理服务未初始化"
        }
    
    return {
        "enabled": cleanup_service.enabled,
        "running": cleanup_service._running,
        "interval_hours": cleanup_service.interval_hours,
        "log_retention_days": cleanup_service.log_retention_days,
        "orphan_images_enabled": cleanup_service.orphan_images_enabled
    }


# ==================== 知识库 API ====================

class KnowledgeUploadRequest(BaseModel):
    """知识库上传请求"""
    filename: str = Field(..., description="文件名")
    content: str = Field(..., description="文件内容")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="元数据")


class KnowledgeSearchRequest(BaseModel):
    """知识库搜索请求"""
    query: str = Field(..., description="搜索查询")
    top_k: int = Field(default=3, description="返回结果数量")


@app.post("/api/knowledge/upload")
async def upload_knowledge_file(request: KnowledgeUploadRequest):
    """上传文件到知识库
    
    支持的文件类型：.md, .txt
    """
    if not knowledge_service or not knowledge_service.is_available():
        raise HTTPException(status_code=503, detail="知识库服务不可用")
    
    try:
        result = await knowledge_service.upload_file(
            filename=request.filename,
            content=request.content,
            metadata=request.metadata
        )
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"上传文件失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


@app.post("/api/knowledge/search")
async def search_knowledge(request: KnowledgeSearchRequest):
    """搜索知识库
    
    使用语义相似度搜索
    """
    if not knowledge_service or not knowledge_service.is_available():
        raise HTTPException(status_code=503, detail="知识库服务不可用")
    
    try:
        results = await knowledge_service.search(
            query=request.query,
            top_k=request.top_k
        )
        return {"success": True, "results": results}
    except Exception as e:
        logger.error(f"搜索知识库失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")


@app.get("/api/knowledge/files")
async def list_knowledge_files():
    """列出所有知识库文件"""
    if not knowledge_service or not knowledge_service.is_available():
        raise HTTPException(status_code=503, detail="知识库服务不可用")
    
    try:
        files = await knowledge_service.list_files()
        return {"success": True, "files": files}
    except Exception as e:
        logger.error(f"列出文件失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"列出文件失败: {str(e)}")


@app.delete("/api/knowledge/files/{file_id}")
async def delete_knowledge_file(file_id: str):
    """删除知识库文件"""
    if not knowledge_service or not knowledge_service.is_available():
        raise HTTPException(status_code=503, detail="知识库服务不可用")
    
    try:
        success = await knowledge_service.delete_file(file_id)
        if success:
            return {"success": True, "message": "文件已删除"}
        else:
            raise HTTPException(status_code=404, detail="文件不存在或删除失败")
    except Exception as e:
        logger.error(f"删除文件失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")


@app.get("/api/knowledge/files/{file_id}/content")
async def get_knowledge_file_content(file_id: str):
    """获取文件内容"""
    if not knowledge_service or not knowledge_service.is_available():
        raise HTTPException(status_code=503, detail="知识库服务不可用")
    
    try:
        content = await knowledge_service.get_file_content(file_id)
        if content is not None:
            return {"success": True, "content": content}
        else:
            raise HTTPException(status_code=404, detail="文件不存在")
    except Exception as e:
        logger.error(f"获取文件内容失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}")


# ==================== 轮询 API（替代 WebSocket）====================

@app.get("/api/messages")
async def get_messages(after_id: int = 0):
    """
    获取指定 ID 之后的所有消息（用于 Electron 主进程轮询）
    
    参数：
        after_id: 上次接收到的最大消息 ID，返回此 ID 之后的所有新消息
    
    返回：
        {
            "success": true,
            "messages": [
                {
                    "id": 1,
                    "message": { "type": "text_update", "text": "..." },
                    "timestamp": 1704326400.123
                },
                ...
            ],
            "server_time": 1704326400.456
        }
    """
    try:
        messages = message_buffer.get_after(after_id)
        import time
        return {
            "success": True,
            "messages": messages,
            "server_time": time.time()
        }
    except Exception as e:
        logger.error(f"[API] 获取消息失败: {e}")
        return {
            "success": False,
            "error": str(e),
            "messages": []
        }


@app.post("/api/messages/clear")
async def clear_messages():
    """
    清空消息缓冲区（用于前端重启或HMR时避免消息堆积）
    
    返回：
        {
            "success": true,
            "message": "消息缓冲区已清空"
        }
    """
    try:
        old_size = len(message_buffer.messages)
        old_counter = message_buffer.counter
        message_buffer.clear()
        logger.info(f"[API] 消息缓冲区已清空: 清除了 {old_size} 条消息，counter从 {old_counter} 重置为 0")
        return {
            "success": True,
            "message": f"消息缓冲区已清空（清除了 {old_size} 条消息）",
            "cleared_count": old_size
        }
    except Exception as e:
        logger.error(f"[API] 清空消息缓冲区失败: {e}")
        return {
            "success": False,
            "error": str(e)
        }


# ==================== 服务器启动 ====================

def run_server(host: str = "127.0.0.1", port: int = 8765):
    """运行API服务器"""
    logger.info(f"[API] 启动API服务器: http://{host}:{port}")
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=True
    )


if __name__ == "__main__":
    run_server()

