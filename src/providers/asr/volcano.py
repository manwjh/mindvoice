"""
火山引擎 ASR 提供商实现
基于 ChefMate 3 项目的 asr_client.py
"""
import asyncio
import aiohttp
import struct
import gzip
import uuid
import json
import logging
from typing import Dict, Any, Optional, Callable
from ..asr.base_asr import BaseASRProvider

logger = logging.getLogger(__name__)

# 火山ASR协议相关常量
class ProtocolVersion:
    V1 = 0b0001

class MessageType:
    CLIENT_FULL_REQUEST = 0b0001
    CLIENT_AUDIO_ONLY_REQUEST = 0b0010
    SERVER_FULL_RESPONSE = 0b1001
    SERVER_ERROR_RESPONSE = 0b1111

class MessageTypeSpecificFlags:
    NO_SEQUENCE = 0b0000
    POS_SEQUENCE = 0b0001
    NEG_SEQUENCE = 0b0010
    NEG_WITH_SEQUENCE = 0b0011

class SerializationType:
    NO_SERIALIZATION = 0b0000
    JSON = 0b0001

class CompressionType:
    GZIP = 0b0001


class AsrRequestHeader:
    """协议头构造"""
    def __init__(self):
        self.message_type = MessageType.CLIENT_FULL_REQUEST
        self.message_type_specific_flags = MessageTypeSpecificFlags.POS_SEQUENCE
        self.serialization_type = SerializationType.JSON
        self.compression_type = CompressionType.GZIP
        self.reserved_data = bytes([0x00])

    def with_message_type(self, message_type: int):
        self.message_type = message_type
        return self

    def with_message_type_specific_flags(self, flags: int):
        self.message_type_specific_flags = flags
        return self

    def with_serialization_type(self, serialization_type: int):
        self.serialization_type = serialization_type
        return self

    def with_compression_type(self, compression_type: int):
        self.compression_type = compression_type
        return self

    def to_bytes(self) -> bytes:
        header = bytearray()
        header.append((ProtocolVersion.V1 << 4) | 1)
        header.append((self.message_type << 4) | self.message_type_specific_flags)
        header.append((self.serialization_type << 4) | self.compression_type)
        header.extend(self.reserved_data)
        return bytes(header)

    @staticmethod
    def default_header():
        return AsrRequestHeader()


class RequestBuilder:
    """请求构造"""
    @staticmethod
    def new_auth_headers(access_key: str, app_key: str) -> dict:
        reqid = str(uuid.uuid4())
        return {
            "X-Api-Resource-Id": "volc.bigasr.sauc.duration",
            "X-Api-Request-Id": reqid,
            "X-Api-Access-Key": access_key,
            "X-Api-App-Key": app_key
        }

    @staticmethod
    def new_full_client_request(seq: int) -> bytes:
        header = AsrRequestHeader.default_header() \
            .with_message_type_specific_flags(MessageTypeSpecificFlags.POS_SEQUENCE)
        
        payload = {
            "user": {"uid": "demo_uid"},
            "audio": {
                "format": "pcm",
                "codec": "raw",
                "rate": 16000,
                "bits": 16,
                "channel": 1
            },
            "request": {
                "model_name": "bigmodel",
                "enable_itn": True,
                "enable_punc": True,
                "enable_ddc": True,
                "show_utterances": True,
                "result_type": "single",
                "vad_segment_duration": 600,
                "enable_nonstream": False
            }
        }
        payload_bytes = json.dumps(payload).encode('utf-8')
        compressed_payload = gzip.compress(payload_bytes)
        payload_size = len(compressed_payload)
        
        req = bytearray()
        req.extend(header.to_bytes())
        req.extend(struct.pack('>i', seq))
        req.extend(struct.pack('>I', payload_size))
        req.extend(compressed_payload)
        return bytes(req)

    @staticmethod
    def new_audio_only_request(seq: int, segment: bytes, is_last: bool = False) -> bytes:
        header = AsrRequestHeader.default_header().with_message_type(MessageType.CLIENT_AUDIO_ONLY_REQUEST)
        if is_last:
            # 根据协议规格：客户端发送最后一包时使用 NEG_SEQUENCE (0b0010)
            # header后4个字节不为sequence number，仅指示此为最后一包
            header.with_message_type_specific_flags(MessageTypeSpecificFlags.NEG_SEQUENCE)
        else:
            header.with_message_type_specific_flags(MessageTypeSpecificFlags.POS_SEQUENCE)
        
        req = bytearray()
        req.extend(header.to_bytes())
        
        # 只有在非最后一包时才包含 sequence number
        # 最后一包使用 NEG_SEQUENCE (0b0010)，不包含 sequence number
        if not is_last:
            req.extend(struct.pack('>i', seq))
        
        compressed_segment = gzip.compress(segment)
        req.extend(struct.pack('>I', len(compressed_segment)))
        req.extend(compressed_segment)
        return bytes(req)


class AsrResponse:
    """响应解析"""
    def __init__(self):
        self.code = 0
        self.event = 0
        self.is_last_package = False
        self.payload_sequence = 0
        self.payload_size = 0
        self.payload_msg = None
        self.message_type_specific_flags = 0


class ResponseParser:
    """响应解析器"""
    @staticmethod
    def parse_response(msg: bytes) -> AsrResponse:
        response = AsrResponse()
        
        try:
            if len(msg) < 4:
                logger.error("响应消息太短")
                return response
            
            header_size_words = msg[0] & 0x0F
            message_type = (msg[1] >> 4) & 0x0F
            message_type_specific_flags = msg[1] & 0x0F
            serialization_type = (msg[2] >> 4) & 0x0F
            compression_type = msg[2] & 0x0F
            
            response.message_type_specific_flags = message_type_specific_flags
            
            offset = header_size_words * 4
            payload = msg[offset:]
            
            if message_type_specific_flags & 0x01:
                if len(payload) < 4:
                    return response
                response.payload_sequence = struct.unpack('>i', payload[:4])[0]
                payload = payload[4:]
            
            if message_type_specific_flags & 0x02:
                response.is_last_package = True
            
            if message_type_specific_flags & 0x04:
                if len(payload) < 4:
                    return response
                response.event = struct.unpack('>i', payload[:4])[0]
                payload = payload[4:]
            
            if message_type == MessageType.SERVER_FULL_RESPONSE:
                if len(payload) < 4:
                    return response
                response.payload_size = struct.unpack('>I', payload[:4])[0]
                payload = payload[4:]
            elif message_type == MessageType.SERVER_ERROR_RESPONSE:
                if len(payload) < 8:
                    return response
                response.code = struct.unpack('>i', payload[:4])[0]
                response.payload_size = struct.unpack('>I', payload[4:8])[0]
                payload = payload[8:]
            
            if not payload:
                return response
            
            if compression_type == CompressionType.GZIP:
                try:
                    payload = gzip.decompress(payload)
                except Exception as e:
                    logger.error(f"Failed to decompress payload: {e}")
                    return response
            
            try:
                if serialization_type == SerializationType.JSON:
                    response.payload_msg = json.loads(payload.decode('utf-8'))
            except Exception as e:
                logger.error(f"Failed to parse payload: {e}")
                return response
        except Exception as e:
            logger.error(f"解析响应失败: {e}")
            return response
        
        return response


class VolcanoASRProvider(BaseASRProvider):
    """火山引擎 ASR 提供商"""
    
    PROVIDER_NAME = "volcano"
    
    def __init__(self):
        super().__init__()
        self.base_url = ""
        self.app_id = ""
        self.app_key = ""
        self.access_key = ""
        self.session: Optional[aiohttp.ClientSession] = None
        self.conn = None
        self.seq = 1
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._result_text = ""
        self._recognition_event: Optional[asyncio.Event] = None
        
        self._streaming_active = False
        self._stopping = False
        self._receive_task: Optional[asyncio.Task] = None
        self._on_text_callback: Optional[Callable[[str, bool], None]] = None
        self._last_text = ""
    
    @property
    def name(self) -> str:
        return "volcano"
    
    @property
    def supported_languages(self) -> list[str]:
        return ["zh-CN", "en-US"]
    
    def initialize(self, config: Dict[str, Any]) -> bool:
        """初始化火山引擎 ASR"""
        self.base_url = config.get('base_url', 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel')
        self.app_id = config.get('app_id', '')
        self.app_key = config.get('app_key', '') or config.get('app_id', '')
        self.access_key = config.get('access_key', '')
        
        if not self.access_key or not self.access_key.strip():
            logger.error("火山引擎 ASR 配置不完整：缺少 access_key")
            logger.error("请检查 config.yml 中的 asr.access_key 配置")
            return False
        
        if not self.app_key or not self.app_key.strip():
            logger.error("火山引擎 ASR 配置不完整：缺少 app_key 或 app_id")
            logger.error("请检查 config.yml 中的 asr.app_key 或 asr.app_id 配置")
            return False
        
        logger.info(f"[ASR] 初始化配置: base_url={self.base_url}")
        logger.info(f"[ASR] app_id={self.app_id if self.app_id else '(未设置)'}")
        logger.info(f"[ASR] app_key={'已设置 (' + str(len(self.app_key)) + ' 字符)' if self.app_key else '未设置'}")
        logger.info(f"[ASR] access_key={'已设置 (' + str(len(self.access_key)) + ' 字符)' if self.access_key else '未设置'}")
        
        return super().initialize(config)
    
    async def _connect(self) -> bool:
        """连接 ASR 服务"""
        # 验证凭证格式
        if not self.access_key or not self.access_key.strip():
            logger.error("[ASR] 认证失败: access_key 为空，请检查 config.yml")
            return False
        
        if not self.app_key or not self.app_key.strip():
            logger.error("[ASR] 认证失败: app_key 为空，请检查 config.yml")
            return False
        
        max_retries = 3
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                headers = RequestBuilder.new_auth_headers(self.access_key, self.app_key)
                logger.info(f"[ASR] 连接尝试 {attempt + 1}/{max_retries}")
                logger.info(f"[ASR] 认证信息: access_key={self.access_key[:8]}...{self.access_key[-4:] if len(self.access_key) > 12 else '***'}, "
                           f"app_key={self.app_key[:8]}...{self.app_key[-4:] if len(self.app_key) > 12 else '***'}")
                
                timeout = aiohttp.ClientTimeout(total=30)
                
                if self.session and not self.session.closed:
                    await self.session.close()
                self.session = aiohttp.ClientSession(timeout=timeout)
                
                logger.info(f"[ASR] 连接URL: {self.base_url}")
                self.conn = await self.session.ws_connect(self.base_url, headers=headers)
                logger.info(f"[ASR] WebSocket连接成功")
                
                self._loop = asyncio.get_event_loop()
                
                logger.info(f"成功连接到火山引擎 ASR 服务: {self.base_url}")
                return True
                
            except aiohttp.ClientResponseError as e:
                error_msg = f"HTTP错误 {e.status}: {e.message}"
                if e.status == 403:
                    error_msg += " (认证失败，请检查 access_key 和 app_key 是否正确)"
                    error_msg += "\n提示：请确认："
                    error_msg += "\n  1. access_key 和 app_key 是否从火山引擎控制台正确获取"
                    error_msg += "\n  2. 凭证是否已过期或已被撤销"
                    error_msg += "\n  3. 凭证是否有访问 ASR 服务的权限"
                    error_msg += f"\n  4. 当前使用的 access_key 前8位: {self.access_key[:8]}..."
                    error_msg += f"\n  5. 当前使用的 app_key 前8位: {self.app_key[:8]}..."
                logger.error(f"[ASR] 连接错误 (第{attempt + 1}次尝试): {error_msg}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"[ASR] 连接最终失败: {error_msg}")
                    return False
                    
            except asyncio.TimeoutError as e:
                logger.warning(f"[ASR] 连接超时 (第{attempt + 1}次尝试): {str(e)}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"[ASR] 连接最终超时，所有重试失败")
                    return False
                    
            except Exception as e:
                error_msg = str(e)
                logger.warning(f"[ASR] 连接错误 (第{attempt + 1}次尝试): {error_msg}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"[ASR] 连接最终失败: {error_msg}")
                    return False
        
        return False
    
    async def _disconnect(self):
        """断开连接"""
        try:
            # 关闭WebSocket连接
            if self.conn:
                if not self.conn.closed:
                    logger.debug("[ASR] 正在关闭WebSocket连接...")
                    await self.conn.close()
                    logger.debug("[ASR] WebSocket连接已关闭")
                else:
                    logger.debug("[ASR] WebSocket连接已关闭，无需再次关闭")
                self.conn = None
            
            # 关闭HTTP会话
            if self.session:
                if not self.session.closed:
                    logger.debug("[ASR] 正在关闭HTTP会话...")
                    await self.session.close()
                    logger.debug("[ASR] HTTP会话已关闭")
                else:
                    logger.debug("[ASR] HTTP会话已关闭，无需再次关闭")
                self.session = None
            
            logger.info("[ASR] ASR WebSocket连接已断开")
        except Exception as e:
            logger.error(f"[ASR] 断开连接失败: {e}", exc_info=True)
            # 即使关闭失败，也清空引用
            self.conn = None
            self.session = None
    
    async def _send_full_request(self):
        """发送完整客户端请求"""
        try:
            request = RequestBuilder.new_full_client_request(self.seq)
            await self.conn.send_bytes(request)
            self.seq += 1
        except Exception as e:
            logger.error(f"发送完整客户端请求失败: {e}")
            raise
    
    async def _send_audio_data(self, audio_data: bytes, is_last: bool = False):
        """发送音频数据"""
        try:
            if not self.conn or self.conn.closed:
                logger.error("[ASR] 连接已关闭或不可用，无法发送音频数据")
                return
            request = RequestBuilder.new_audio_only_request(self.seq, audio_data, is_last)
            request_size = len(request)
            # logger.info(f"[ASR] 发送音频数据: seq={self.seq}, 音频大小={len(audio_data)}字节, 请求大小={request_size}字节, is_last={is_last}")
            await self.conn.send_bytes(request)
            # 只有在非最后一包时才递增序列号（最后一包不包含序列号，因此不递增）
            if not is_last:
                self.seq += 1
                logger.debug(f"[ASR] 音频数据已发送，下一个seq={self.seq}")
            else:
                logger.debug(f"[ASR] 最后一个音频包已发送（使用NEG_SEQUENCE，不包含序列号）")
        except Exception as e:
            logger.error(f"[ASR] 发送音频数据失败: {e}", exc_info=True)
    
    async def _receive_results(self):
        """接收 ASR 结果"""
        try:
            async for msg in self.conn:
                logger.debug(f"[ASR] 收到消息类型: {msg.type}")
                if msg.type == aiohttp.WSMsgType.BINARY:
                    try:
                        response = ResponseParser.parse_response(msg.data)
                        
                        logger.debug(f"[ASR] 响应解析: code={response.code}, "
                                   f"is_last_package={response.is_last_package}")
                        
                        if response.payload_msg:
                            logger.debug(f"[ASR] ASR响应: {json.dumps(response.payload_msg, ensure_ascii=False, indent=2)}")
                            
                            result = response.payload_msg.get('result', {})
                            if isinstance(result, dict):
                                # 使用统一的处理方法，确保回调被正确调用
                                self._handle_recognition_result(result, response.is_last_package)
                        
                        if response.code != 0:
                            error_reasons = {
                                1001: "参数错误",
                                1002: "认证失败",
                                1003: "配额超限",
                                1004: "服务不可用",
                                1005: "内部错误",
                                1006: "请求超时",
                                1007: "音频格式错误",
                                1008: "音频长度错误",
                                1009: "音频采样率错误",
                                1010: "音频声道数错误",
                                45000081: "连接超时或音频流中断（可能因暂停录音导致）"
                            }
                            reason = error_reasons.get(response.code, f"未知错误码: {response.code}")
                            logger.error(f"[ASR] 错误码: {response.code}, 原因: {reason}")
                            if self._recognition_event:
                                self._recognition_event.set()
                            break
                        
                        if response.is_last_package:
                            logger.debug(f"[ASR] 接收结束: is_last_package={response.is_last_package}")
                            if self._recognition_event:
                                self._recognition_event.set()
                            break
                    except Exception as e:
                        logger.error(f"[ASR] 解析响应失败: {e}", exc_info=True)
                        continue
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    logger.error(f"[ASR] WebSocket错误: {msg.data}")
                    if self._recognition_event:
                        self._recognition_event.set()
                    break
                elif msg.type == aiohttp.WSMsgType.CLOSED:
                    logger.info("[ASR] WebSocket连接已关闭")
                    if self._recognition_event:
                        self._recognition_event.set()
                    break
        except Exception as e:
            logger.error(f"[ASR] 接收结果异常: {e}", exc_info=True)
            if self._recognition_event:
                self._recognition_event.set()
    
    def recognize(self, audio_data: bytes, language: str = "zh-CN", **kwargs) -> str:
        """识别音频（同步接口，内部使用异步）"""
        if not self._initialized:
            return ""
        
        # 使用事件循环运行异步识别
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        return loop.run_until_complete(self._recognize_async(audio_data, language))
    
    async def _recognize_async(self, audio_data: bytes, language: str = "zh-CN") -> str:
        """异步识别音频"""
        self._result_text = ""
        self._recognition_event = asyncio.Event()
        self.seq = 1
        
        # 连接
        if not await self._connect():
            logger.error("[ASR] 连接失败，无法进行识别")
            return ""
        
        receive_task = None
        try:
            # 发送完整请求
            logger.debug("[ASR] 发送完整客户端请求")
            await self._send_full_request()
            await asyncio.sleep(0.2)
            
            # 启动结果接收任务
            logger.debug("[ASR] 启动结果接收任务")
            receive_task = asyncio.create_task(self._receive_results())
            await asyncio.sleep(0.2)
            
            # 发送音频数据
            logger.info(f"[ASR] 准备发送音频数据进行识别，长度: {len(audio_data)} 字节")
            await self._send_audio_data(audio_data, is_last=True)
            logger.info("[ASR] 音频数据已发送，等待识别结果...")
            
            # 等待结果（最多10秒）
            try:
                await asyncio.wait_for(self._recognition_event.wait(), timeout=10.0)
                logger.debug("[ASR] 收到识别结果信号")
            except asyncio.TimeoutError:
                logger.warning("[ASR] 识别超时")
            
            # 等待接收任务完成
            await asyncio.sleep(0.5)
            if receive_task and not receive_task.done():
                receive_task.cancel()
                try:
                    await receive_task
                except asyncio.CancelledError:
                    pass
            
            logger.info(f"[ASR] 识别完成，结果: '{self._result_text}'")
            return self._result_text
        except Exception as e:
            logger.error(f"[ASR] 识别过程出错: {e}")
            return ""
        finally:
            await self._disconnect()
    
    def is_available(self) -> bool:
        """检查服务是否可用"""
        return self._initialized and bool(self.access_key and self.app_key)
    
    def set_on_text_callback(self, callback: Optional[Callable[[str, bool], None]]):
        """设置文本回调函数
        
        Args:
            callback: 回调函数 (text: str, is_definite_utterance: bool)
                      is_definite_utterance: 是否为确定的utterance（当ASR服务返回definite=True时，此值为True）
                                             表示一个完整的、确定的语音识别单元已完成
        """
        self._on_text_callback = callback
    
    async def start_streaming_recognition(self, language: str = "zh-CN") -> bool:
        """开始流式识别"""
        if self._streaming_active:
            logger.warning("[ASR] 流式识别已在进行中")
            return False
        
        # 连接
        if not await self._connect():
            logger.error("[ASR] 连接失败，无法开始流式识别")
            return False
        
        try:
            self._last_text = ""
            self._result_text = ""
            self._stopping = False
            self.seq = 1
            self._recognition_event = asyncio.Event()
            
            await self._send_full_request()
            await asyncio.sleep(0.2)
            
            self._receive_task = asyncio.create_task(self._receive_streaming_results())
            await asyncio.sleep(0.2)
            
            self._streaming_active = True
            logger.info("[ASR] 流式识别已启动")
            return True
        except Exception as e:
            logger.error(f"[ASR] 启动流式识别失败: {e}")
            await self._disconnect()
            return False
    
    async def send_audio_chunk(self, audio_data: bytes):
        """发送音频数据块"""
        if not self.conn or self.conn.closed:
            return
        
        if not self._streaming_active:
            return
        
        try:
            await self._send_audio_data(audio_data, is_last=False)
        except Exception as e:
            logger.error(f"[ASR] 发送音频数据块失败: {e}", exc_info=True)
    
    async def stop_streaming_recognition(self) -> str:
        """停止流式识别并返回最终结果"""
        logger.info("[ASR] 开始停止流式识别...")
        
        # 如果流式识别未激活，但连接仍然存在，也需要关闭连接
        if not self._streaming_active:
            logger.warning("[ASR] 流式识别未激活，但检查并关闭连接")
            # 即使未激活，也要确保连接被关闭
            await self._disconnect()
            return self._last_text
        
        try:
            self._stopping = True
            logger.debug("[ASR] 发送最后一个音频包（空包）以结束流式识别...")
            
            # 发送最后一个空音频包，标记流式识别结束
            if self.conn and not self.conn.closed:
                try:
                    await self._send_audio_data(b"", is_last=True)
                    logger.debug("[ASR] 最后一个音频包已发送")
                except Exception as e:
                    logger.warning(f"[ASR] 发送最后一个音频包失败: {e}")
            
            # 等待最终结果（最多5秒，与voice_service的超时时间一致）
            if self._recognition_event:
                try:
                    await asyncio.wait_for(self._recognition_event.wait(), timeout=5.0)
                    logger.debug("[ASR] 收到最终结果信号")
                except asyncio.TimeoutError:
                    logger.warning("[ASR] 等待最终结果超时，继续关闭连接")
            
            # 等待更长时间，确保服务器处理完成并收到所有结果
            # 给接收任务更多时间来处理可能延迟到达的最终结果
            await asyncio.sleep(1.0)
            
            # 再等待一小段时间，确保回调函数已处理最终结果
            await asyncio.sleep(0.5)
            
            # 取消接收任务
            if self._receive_task and not self._receive_task.done():
                logger.debug("[ASR] 取消接收任务...")
                self._receive_task.cancel()
                try:
                    await self._receive_task
                except asyncio.CancelledError:
                    logger.debug("[ASR] 接收任务已取消")
                    pass
            
            logger.info(f"[ASR] 流式识别完成，最终结果: '{self._last_text}'")
            return self._last_text
        except Exception as e:
            logger.error(f"[ASR] 停止流式识别失败: {e}", exc_info=True)
            return self._last_text
        finally:
            # 确保状态被重置
            self._streaming_active = False
            self._stopping = False
            
            # 确保连接被关闭
            logger.info("[ASR] 关闭WebSocket连接...")
            await self._disconnect()
            logger.info("[ASR] WebSocket连接已关闭")
    
    def _detect_definite_utterance(self, result: dict, text: str) -> bool:
        """检测是否为确定的utterance
        
        使用 utterances 中的 definite 字段来判断utterance是否确定。
        需要 show_utterances=True 才能获取 utterances 数据。
        definite=True 表示确定的utterance（一个完整的语音识别单元），此时返回 True。
        
        如果没有 utterances 数据，返回 False（不允许使用标点符号判断）。
        
        Returns:
            bool: True表示检测到确定的utterance，False表示未检测到
        """
        utterances = result.get('utterances', [])
        
        if not utterances:
            # 如果没有 utterances 数据，返回 False
            # 注意：不允许使用标点符号判断，必须依赖 ASR 服务返回的 definite 字段
            return False
        
        # 检查是否有 definite=True 的 utterance
        for utterance in utterances:
            if isinstance(utterance, dict):
                is_definite = utterance.get('definite', False)
                if is_definite:
                    utterance_text = utterance.get('text', '')
                    logger.debug(f"[ASR] 检测到确定utterance: '{utterance_text[:50]}...' (definite=True)")
                    return True
        
        # 如果没有 definite utterance，返回 False
        return False
    
    def _handle_recognition_result(self, result: dict, is_last_package: bool):
        """处理识别结果
        
        Args:
            result: ASR识别结果字典
            is_last_package: 是否为最后一个数据包
        """
        text = result.get('text', '')
        if not text:
            return
        
        # 检测是否为确定的utterance（基于ASR服务的definite字段）
        is_definite_utterance = self._detect_definite_utterance(result, text)
        
        self._last_text = text
        
        # 更新结果文本（用于非流式识别的返回值）
        self._result_text = text
        if is_definite_utterance or is_last_package:
            logger.info(f"[ASR] 最终结果: '{text}'")
        else:
            logger.debug(f"[ASR] 中间结果: '{text}'")
        
        # 调用回调函数（用于流式识别），直接传递原始文本
        if self._on_text_callback:
            self._on_text_callback(text, is_definite_utterance)
    
    def _handle_error_response(self, code: int):
        """处理错误响应"""
        error_reasons = {
            1001: "参数错误",
            1002: "认证失败",
            1003: "配额超限",
            1004: "服务不可用",
            1005: "内部错误",
            1006: "请求超时",
            1007: "音频格式错误",
            1008: "音频长度错误",
            1009: "音频采样率错误",
            1010: "音频声道数错误",
            45000081: "连接超时或音频流中断（可能因暂停录音导致）"
        }
        reason = error_reasons.get(code, f"未知错误码: {code}")
        logger.error(f"[ASR] 错误码: {code}, 原因: {reason}")
        if self._recognition_event:
            self._recognition_event.set()
    
    def _should_continue_streaming(self, is_last_package: bool) -> bool:
        """判断是否应该继续流式识别"""
        if not is_last_package:
            return True
        
        if self._stopping:
            logger.debug("[ASR] 收到停止信号，结束流式识别")
            if self._recognition_event:
                self._recognition_event.set()
            return False
        
        logger.debug("[ASR] 当前语音片段结束，继续等待后续音频")
        return True
    
    async def _receive_streaming_results(self):
        """接收流式识别结果"""
        try:
            async for msg in self.conn:
                logger.debug(f"[ASR] 收到消息类型: {msg.type}")
                
                if msg.type == aiohttp.WSMsgType.BINARY:
                    try:
                        response = ResponseParser.parse_response(msg.data)
                        
                        if response.payload_msg:
                            logger.debug(f"[ASR] ASR响应: {json.dumps(response.payload_msg, ensure_ascii=False, indent=2)}")
                            
                            result = response.payload_msg.get('result', {})
                            if isinstance(result, dict):
                                self._handle_recognition_result(result, response.is_last_package)
                            
                            if response.code != 0:
                                # 45000081 错误码处理：
                                # - 如果是用户主动停止（_stopping=True），这是正常的关闭过程，优雅处理
                                # - 如果是暂停状态，可能是连接超时，也应该优雅处理
                                if response.code == 45000081:
                                    if self._stopping:
                                        logger.info(f"[ASR] 连接关闭（错误码: {response.code}），用户主动停止，正常结束")
                                    else:
                                        logger.warning(f"[ASR] 连接超时（错误码: {response.code}），可能是暂停录音导致，继续等待...")
                                    # 设置事件以允许正常结束流程
                                    if self._recognition_event:
                                        self._recognition_event.set()
                                    # 如果是停止状态，正常结束；如果是暂停状态，继续等待
                                    if self._stopping:
                                        break
                                    else:
                                        continue
                                else:
                                    self._handle_error_response(response.code)
                                    break
                            
                            if not self._should_continue_streaming(response.is_last_package):
                                break
                                
                    except Exception as e:
                        logger.error(f"[ASR] 解析流式响应失败: {e}", exc_info=True)
                        continue
                        
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    logger.error(f"[ASR] WebSocket错误: {msg.data}")
                    if self._recognition_event:
                        self._recognition_event.set()
                    break
                    
                elif msg.type == aiohttp.WSMsgType.CLOSED:
                    logger.info("[ASR] WebSocket连接已关闭")
                    if self._recognition_event:
                        self._recognition_event.set()
                    break
                    
        except Exception as e:
            logger.error(f"[ASR] 接收流式结果异常: {e}", exc_info=True)
            if self._recognition_event:
                self._recognition_event.set()
