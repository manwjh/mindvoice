"""
FastAPI服务器 - 提供HTTP和WebSocket API
独立的后端服务，不依赖任何前端框架
"""
import asyncio
import logging
import sys
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Set, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from src.core.config import Config
from src.core.base import RecordingState
from src.services.voice_service import VoiceService
from src.services.llm_service import LLMService
from src.utils.audio_recorder import SoundDeviceRecorder

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    setup_voice_service()
    setup_llm_service()
    
    yield
    
    global voice_service, llm_service, recorder
    logger.info("[API] 正在关闭服务...")
    
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
config: Optional[Config] = None
recorder: Optional[SoundDeviceRecorder] = None

# WebSocket连接管理
active_connections: Set[WebSocket] = set()


# ==================== API响应模型 ====================

class StatusResponse(BaseModel):
    """状态响应模型"""
    state: str
    current_text: str


class StartRecordingResponse(BaseModel):
    """开始录音响应"""
    success: bool
    message: str


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
    created_at: str


class ListRecordsResponse(BaseModel):
    """列出记录响应"""
    success: bool
    records: list[RecordItem]
    total: int
    limit: int
    offset: int


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
    error: Optional[str] = None


class SimpleChatRequest(BaseModel):
    """简单聊天请求模型"""
    message: str = Field(..., description="用户消息")
    system_prompt: Optional[str] = Field(default=None, description="系统提示")
    temperature: float = Field(default=0.7, ge=0, le=2, description="温度参数")
    max_tokens: Optional[int] = Field(default=None, description="最大生成token数")


class LLMInfoResponse(BaseModel):
    """LLM信息响应"""
    available: bool
    name: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    max_context_tokens: Optional[int] = None


# ==================== WebSocket广播函数 ====================

async def broadcast_safe(message: dict):
    """安全的广播，保证消息顺序和可靠性
    
    改进点：
    1. 不使用全局锁（避免事件循环冲突）
    2. 使用gather等待所有发送完成
    3. 统一错误处理
    """
    if not active_connections:
        return
    
    disconnected = set()
    tasks = []
    
    # 为每个连接创建发送任务
    for connection in list(active_connections):
        task = connection.send_json(message)
        tasks.append((connection, task))
    
    # 等待所有发送完成
    results = await asyncio.gather(*[t for _, t in tasks], return_exceptions=True)
    
    # 处理发送结果
    for (conn, _), result in zip(tasks, results):
        if isinstance(result, Exception):
            logger.error(f"[API] 广播失败: {result}")
            disconnected.add(conn)
    
    # 移除失败的连接
    if disconnected:
        active_connections.difference_update(disconnected)
        logger.info(f"[API] 已移除 {len(disconnected)} 个失败的连接，当前连接数: {len(active_connections)}")

def broadcast(message: dict):
    """向所有WebSocket连接广播消息（同步接口，兼容旧代码）"""
    if not active_connections:
        return
    
    # 🔧 修复：获取当前运行的事件循环
    try:
        loop = asyncio.get_running_loop()
        # 在当前事件循环中创建任务
        asyncio.create_task(broadcast_safe(message))
    except RuntimeError:
        # 如果没有运行的事件循环，记录警告
        logger.warning("[API] 无法广播消息：没有运行的事件循环")


# ==================== 服务初始化 ====================

def setup_voice_service():
    """初始化语音服务"""
    global voice_service, config, recorder
    
    logger.info("[API] 初始化语音服务...")
    
    try:
        # 加载配置
        config = Config()
        
        # 初始化录音器
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
            device=audio_device
        )
        
        # 初始化语音服务
        voice_service = VoiceService(config)
        voice_service.set_recorder(recorder)
        
        # 设置回调 - 直接通过WebSocket广播
        # 根据 is_definite 决定消息类型：中间结果用 text_update，确定结果用 text_final
        # 注：text 已在后端累加处理，前端直接显示即可
        # 🔧 优化：使用broadcast函数（内部会调用broadcast_safe保证顺序）
        def on_text_callback(text: str, is_definite: bool, time_info: dict):
            message = {
                "type": "text_final" if is_definite else "text_update",
                "text": text
            }
            # 仅在确定的utterance时添加时间信息
            if is_definite and time_info:
                message["start_time"] = time_info.get('start_time', 0)
                message["end_time"] = time_info.get('end_time', 0)
            broadcast(message)
        
        voice_service.set_on_text_callback(on_text_callback)
        voice_service.set_on_state_change_callback(
            lambda state: broadcast({"type": "state_change", "state": state.value})
        )
        voice_service.set_on_error_callback(
            lambda error_type, msg: broadcast({"type": "error", "error_type": error_type, "message": msg})
        )
        
        logger.info("[API] 语音服务初始化完成")
    except Exception as e:
        logger.error(f"[API] 语音服务初始化失败: {e}", exc_info=True)
        raise


def setup_llm_service():
    """初始化 LLM 服务"""
    global llm_service, config
    
    logger.info("[API] 初始化 LLM 服务...")
    
    try:
        if config is None:
            config = Config()
        
        # 初始化 LLM 服务
        llm_service = LLMService(config)
        
        if llm_service.is_available():
            logger.info("[API] LLM 服务初始化完成")
        else:
            logger.warning("[API] LLM 服务不可用，请检查配置")
            
    except Exception as e:
        logger.error(f"[API] LLM 服务初始化失败: {e}", exc_info=True)
        llm_service = None


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


@app.post("/api/recording/start", response_model=StartRecordingResponse)
async def start_recording():
    """开始录音"""
    if not voice_service:
        raise HTTPException(status_code=503, detail="语音服务未初始化")
    
    try:
        success = voice_service.start_recording()
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
        raise HTTPException(status_code=500, detail=str(e))


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
        # 停止录音，获取ASR最终文本
        # 注意：不自动保存记录，只有用户点击SAVE按钮时才会保存
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
    app_type: str = 'voice-note'  # 应用类型，默认为voice-note
    blocks: Optional[list] = None  # ⭐ 新增：完整的 blocks 数据（包含时间信息和类型）


class SaveTextResponse(BaseModel):
    """直接保存文本响应"""
    success: bool
    record_id: Optional[str] = None
    message: str


@app.post("/api/text/save", response_model=SaveTextResponse)
async def save_text_directly(request: SaveTextRequest):
    """直接保存文本到历史记录（不依赖ASR会话）"""
    if not voice_service or not voice_service.storage_provider:
        raise HTTPException(status_code=503, detail="存储服务未初始化")
    
    try:
        if not request.text or not request.text.strip():
            return SaveTextResponse(
                success=False,
                message="文本内容为空"
            )
        
        # 保存文本记录
        metadata = {
            'language': voice_service.config.get('asr.language', 'zh-CN'),
            'provider': 'manual',  # 标记为手动输入
            'input_method': 'keyboard',  # 输入方式：键盘
            'app_type': request.app_type,  # 应用类型
            'created_at': voice_service._get_timestamp(),
            'blocks': request.blocks  # ⭐ 新增：保存完整的 blocks 数据
        }
        
        record_id = voice_service.storage_provider.save_record(request.text, metadata)
        logger.info(f"[API] 已直接保存文本记录: {record_id}, blocks数据: {'有' if request.blocks else '无'}")
        
        return SaveTextResponse(
            success=True,
            record_id=record_id,
            message="文本已保存"
        )
    except Exception as e:
        logger.error(f"直接保存文本失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/records", response_model=ListRecordsResponse)
async def list_records(limit: int = 50, offset: int = 0, app_type: str = None):
    """列出历史记录
    
    Args:
        limit: 返回记录数量限制
        offset: 偏移量
        app_type: 应用类型筛选（可选）：'voice-note', 'voice-chat', 'all'
    """
    if not voice_service or not voice_service.storage_provider:
        raise HTTPException(status_code=503, detail="存储服务未初始化")
    
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
        logger.error(f"列出记录失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/records/{record_id}", response_model=RecordItem)
async def get_record(record_id: str):
    """获取单条记录"""
    if not voice_service or not voice_service.storage_provider:
        raise HTTPException(status_code=503, detail="存储服务未初始化")
    
    try:
        record = voice_service.storage_provider.get_record(record_id)
        if not record:
            raise HTTPException(status_code=404, detail="记录不存在")
        
        return RecordItem(
            id=record['id'],
            text=record['text'],
            metadata=record.get('metadata', {}),
            created_at=record.get('created_at', '')
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取记录失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=503, detail="存储服务未初始化")
    
    try:
        if not request.record_ids:
            return {"success": False, "message": "未选择要删除的记录"}
        
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
        logger.error(f"批量删除记录失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
async def list_audio_devices():
    """获取所有输入音频设备列表"""
    if not recorder:
        raise HTTPException(status_code=503, detail="录音器未初始化")
    
    try:
        devices = SoundDeviceRecorder.list_input_devices()
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
        raise HTTPException(status_code=503, detail="LLM服务不可用")
    
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
        logger.error(f"LLM对话失败: {e}", exc_info=True)
        return ChatResponse(success=False, error=str(e))


@app.post("/api/llm/simple-chat", response_model=ChatResponse)
async def simple_chat(request: SimpleChatRequest):
    """简化的LLM对话接口（单轮对话）
    
    请求示例：
    {
        "message": "你好，请介绍一下你自己",
        "system_prompt": "你是一个友好的助手",
        "temperature": 0.7
    }
    """
    if not llm_service or not llm_service.is_available():
        raise HTTPException(status_code=503, detail="LLM服务不可用")
    
    try:
        # 调用简化接口
        response = await llm_service.simple_chat(
            user_message=request.message,
            system_prompt=request.system_prompt,
            stream=False,
            temperature=request.temperature,
            max_tokens=request.max_tokens
        )
        
        return ChatResponse(success=True, message=response)
        
    except Exception as e:
        logger.error(f"LLM简单对话失败: {e}", exc_info=True)
        return ChatResponse(success=False, error=str(e))


# ==================== WebSocket API ====================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket端点 - 用于实时文本和状态更新
    
    消息类型：
    1. initial_state - 初始状态
       { "type": "initial_state", "state": "idle|recording|paused|stopping", "text"?: "..." }
    
    2. text_update - 中间识别结果（实时更新）
       { "type": "text_update", "text": "..." }
    
    3. text_final - 确定的完整utterance（包含时间信息，文本已在后端累加处理）
       { "type": "text_final", "text": "...", "start_time": 1234, "end_time": 5678 }
       注：start_time 和 end_time 单位为毫秒，相对于音频流开始时间
           text 字段已包含后端累加后的完整文本（间隔<800ms的句子会自动累加）
    
    4. state_change - 状态变更
       { "type": "state_change", "state": "idle|recording|paused|stopping" }
    
    5. error - 错误消息
       { "type": "error", "error_type": "...", "message": "..." }
    """
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(f"[API] WebSocket连接已建立，当前连接数: {len(active_connections)}")
    
    try:
        # 发送初始状态（原生app设计：初始状态应该是干净的）
        if voice_service:
            state = voice_service.get_state()
            current_text = getattr(voice_service, '_current_text', '')
            # 只在有实际文本时才包含text字段（原生app初始状态应该是空的）
            initial_state_msg = {
                "type": "initial_state",
                "state": state.value
            }
            if current_text:  # 只在有文本时包含
                initial_state_msg["text"] = current_text
            await websocket.send_json(initial_state_msg)
        
        # 保持连接，等待客户端消息
        while True:
            try:
                data = await websocket.receive_json()
                logger.debug(f"[API] 收到WebSocket消息: {data}")
                # 可以在这里处理客户端发送的消息（如ping/pong等）
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"[API] WebSocket消息处理错误: {e}")
                break
    except WebSocketDisconnect:
        pass
    finally:
        active_connections.discard(websocket)
        logger.info(f"[API] WebSocket连接已断开，当前连接数: {len(active_connections)}")


# ==================== 服务器启动 ====================

def run_server(host: str = "127.0.0.1", port: int = 8765):
    """运行API服务器"""
    logger.info(f"[API] 启动API服务器: http://{host}:{port}")
    logger.info(f"[API] WebSocket端点: ws://{host}:{port}/ws")
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=True
    )


if __name__ == "__main__":
    run_server()

