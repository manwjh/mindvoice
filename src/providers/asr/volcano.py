"""
火山引擎 ASR 提供商实现
采用官方参考架构：发送和接收完全并发，通过队列解耦
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
    def new_full_client_request(seq: int, enable_nonstream: bool = False) -> bytes:
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
                "enable_nonstream": enable_nonstream
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
            # 最后一包：使用 NEG_WITH_SEQUENCE 标志，序列号设为负值
            header.with_message_type_specific_flags(MessageTypeSpecificFlags.NEG_WITH_SEQUENCE)
            seq = -seq
        else:
            # 普通音频包：使用 POS_SEQUENCE 标志
            header.with_message_type_specific_flags(MessageTypeSpecificFlags.POS_SEQUENCE)
        
        req = bytearray()
        req.extend(header.to_bytes())
        
        # 总是包含序列号（包括最后一包，但最后一包的序列号是负数）
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
                logger.error("[ASR-WS] ✗ 响应消息太短")
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
                    logger.error(f"[ASR-WS] ✗ 解压缩失败: {e}")
                    return response
            
            try:
                if serialization_type == SerializationType.JSON:
                    response.payload_msg = json.loads(payload.decode('utf-8'))
            except Exception as e:
                logger.error(f"[ASR-WS] ✗ JSON解析失败: {e}")
                return response
        except Exception as e:
            logger.error(f"[ASR-WS] ✗ 解析响应失败: {e}")
            return response
        
        return response


class VolcanoASRProvider(BaseASRProvider):
    """火山引擎 ASR 提供商 - 采用官方参考架构：发送/接收完全并发"""
    
    PROVIDER_NAME = "volcano"
    
    def __init__(self):
        super().__init__()
        self.base_url = ""
        self.app_id = ""
        self.app_key = ""
        self.access_key = ""
        self.enable_nonstream = False
        self.session: Optional[aiohttp.ClientSession] = None
        self.conn = None
        self.seq = 1
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        
        self._streaming_active = False
        self._audio_queue: Optional[asyncio.Queue] = None
        self._sender_task: Optional[asyncio.Task] = None
        self._receiver_task: Optional[asyncio.Task] = None
        self._on_text_callback: Optional[Callable[[str, bool, dict], None]] = None
        self._last_text = ""
        self._current_text = ""
    
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
        self.enable_nonstream = config.get('enable_nonstream', False)
        
        if not self.access_key or not self.access_key.strip():
            logger.error("[ASR-Init] ✗ 配置不完整：缺少 access_key")
            logger.error("[ASR-Init] 请检查 config.yml 中的 asr.access_key 配置")
            return False
        
        if not self.app_key or not self.app_key.strip():
            logger.error("[ASR-Init] ✗ 配置不完整：缺少 app_key 或 app_id")
            logger.error("[ASR-Init] 请检查 config.yml 中的 asr.app_key 或 asr.app_id 配置")
            return False
        
        logger.info(f"[ASR-Init] 配置加载: base_url={self.base_url}")
        logger.info(f"[ASR-Init] app_id={'已设置' if self.app_id else '未设置'}")
        logger.info(f"[ASR-Init] app_key=已设置 ({len(self.app_key)} 字符)")
        logger.info(f"[ASR-Init] access_key=已设置 ({len(self.access_key)} 字符)")
        logger.info(f"[ASR-Init] enable_nonstream={'开启' if self.enable_nonstream else '关闭'}")
        
        return super().initialize(config)
    
    async def _connect(self) -> bool:
        """连接 ASR 服务"""
        # 验证凭证格式
        if not self.access_key or not self.access_key.strip():
            logger.error("[ASR-WS] ✗ 认证失败: access_key 为空，请检查 config.yml")
            return False
        
        if not self.app_key or not self.app_key.strip():
            logger.error("[ASR-WS] ✗ 认证失败: app_key 为空，请检查 config.yml")
            return False
        
        max_retries = 3
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                headers = RequestBuilder.new_auth_headers(self.access_key, self.app_key)
                logger.info(f"[ASR-WS] 连接尝试 {attempt + 1}/{max_retries}")
                logger.info(f"[ASR-WS] URL: {self.base_url}")
                logger.debug(f"[ASR-WS] Headers: {headers}")
                
                timeout = aiohttp.ClientTimeout(total=30)
                
                if self.session and not self.session.closed:
                    await self.session.close()
                self.session = aiohttp.ClientSession(timeout=timeout)
                
                # 连接 WebSocket
                self.conn = await self.session.ws_connect(self.base_url, headers=headers)
                
                # 记录连接成功
                logger.info(f"[ASR-WS] ✓ 连接成功")
                logger.info(f"[ASR-WS] 协议: {self.conn.protocol if hasattr(self.conn, 'protocol') else 'wss'}")
                logger.info(f"[ASR-WS] 状态: {'已连接' if not self.conn.closed else '已关闭'}")
                
                self._loop = asyncio.get_event_loop()
                return True
                
            except aiohttp.ClientResponseError as e:
                error_msg = f"HTTP错误 {e.status}: {e.message}"
                if e.status == 403:
                    error_msg += " (认证失败)"
                    logger.error(f"[ASR-WS] ✗ {error_msg}")
                    logger.error(f"[ASR-WS] 请检查：")
                    logger.error(f"[ASR-WS]   1. access_key 和 app_key 是否正确")
                    logger.error(f"[ASR-WS]   2. 凭证是否已过期或被撤销")
                    logger.error(f"[ASR-WS]   3. 凭证是否有访问 ASR 服务的权限")
                    logger.error(f"[ASR-WS]   4. access_key 前缀: {self.access_key[:8]}...")
                    logger.error(f"[ASR-WS]   5. app_key 前缀: {self.app_key[:8]}...")
                else:
                    logger.error(f"[ASR-WS] ✗ {error_msg} (第{attempt + 1}次尝试)")
                
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"[ASR-WS] ✗ 连接最终失败，已重试{max_retries}次")
                    return False
                    
            except asyncio.TimeoutError as e:
                logger.warning(f"[ASR-WS] ⚠ 连接超时 (第{attempt + 1}次尝试)")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"[ASR-WS] ✗ 连接最终超时，所有重试失败")
                    return False
                    
            except Exception as e:
                logger.warning(f"[ASR-WS] ⚠ 连接错误 (第{attempt + 1}次尝试): {str(e)}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"[ASR-WS] ✗ 连接最终失败: {str(e)}")
                    return False
        
        return False
    
    async def _disconnect(self):
        """断开连接"""
        try:
            logger.info("[ASR-WS] 开始断开连接...")
            
            # 关闭WebSocket连接
            if self.conn:
                if not self.conn.closed:
                    logger.info("[ASR-WS] 正在关闭WebSocket...")
                    await self.conn.close()
                    logger.info("[ASR-WS] ✓ WebSocket已关闭")
                self.conn = None
            
            # 关闭HTTP会话
            if self.session:
                if not self.session.closed:
                    await self.session.close()
                    logger.debug("[ASR-WS] ✓ HTTP会话已关闭")
                self.session = None
            
            logger.info("[ASR-WS] ✓ 连接已断开")
        except Exception as e:
            logger.error(f"[ASR-WS] ✗ 断开连接失败: {e}", exc_info=True)
            # 即使关闭失败，也清空引用
            self.conn = None
            self.session = None
    
    def _is_conn_available(self) -> bool:
        """检查连接是否可用"""
        return self.conn is not None and not self.conn.closed
    
    async def _send_full_request(self):
        """发送完整客户端请求"""
        try:
            if not self._is_conn_available():
                logger.error("[ASR-WS] ✗ 连接不可用，无法发送完整请求")
                raise ConnectionError("WebSocket连接不可用")
            
            request = RequestBuilder.new_full_client_request(self.seq, self.enable_nonstream)
            logger.info(f"[ASR-WS] → 发送完整请求 (seq={self.seq}, size={len(request)}B, enable_nonstream={self.enable_nonstream})")
            await self.conn.send_bytes(request)
            self.seq += 1
            logger.info(f"[ASR-WS] ✓ 完整请求已发送")
        except Exception as e:
            logger.error(f"[ASR-WS] ✗ 发送完整请求失败: {e}")
            raise
    
    def is_available(self) -> bool:
        """检查服务是否可用"""
        return self._initialized and bool(self.access_key and self.app_key)
    
    def set_on_text_callback(self, callback: Optional[Callable[[str, bool, dict], None]]):
        """设置文本回调函数
        
        Args:
            callback: 回调函数 (text: str, is_definite_utterance: bool, time_info: dict)
                      text: 识别的文本
                      is_definite_utterance: 是否为确定的utterance（ASR返回definite=True）
                      time_info: 时间信息 {start_time: 毫秒, end_time: 毫秒}
        """
        self._on_text_callback = callback
    
    async def start_streaming_recognition(self, language: str = "zh-CN") -> bool:
        if self._streaming_active:
            logger.warning("[ASR-WS] ⚠ 流式识别已在进行中")
            return False
        
        logger.info("[ASR-WS] 准备开始流式识别...")
        
        if not await self._connect():
            logger.error("[ASR-WS] ✗ 连接失败")
            return False
        
        try:
            self._last_text = ""
            self._current_text = ""
            self.seq = 1
            self._audio_queue = asyncio.Queue()
            
            await self._send_full_request()
            
            self._sender_task = asyncio.create_task(self._audio_sender())
            self._receiver_task = asyncio.create_task(self._audio_receiver())
            
            self._streaming_active = True
            logger.info("[ASR-WS] ✓ 流式识别已启动")
            return True
        except Exception as e:
            logger.error(f"[ASR-WS] ✗ 启动失败: {e}")
            await self._disconnect()
            return False
    
    async def send_audio_chunk(self, audio_data: bytes):
        if not self._streaming_active or not self._audio_queue:
            return
        
        try:
            await self._audio_queue.put(audio_data)
        except Exception as e:
            logger.error(f"[ASR-WS] ✗ 音频数据入队失败: {e}")
    
    async def stop_streaming_recognition(self) -> str:
        if not self._streaming_active:
            return self._last_text
        
        self._streaming_active = False
        
        if self._audio_queue:
            try:
                self._audio_queue.put_nowait(None)
            except:
                pass
        
        return self._last_text
    
    async def _audio_sender(self):
        try:
            last_audio = None
            
            while True:
                audio_data = await self._audio_queue.get()
                
                # 检查连接是否可用
                if not self._is_conn_available():
                    logger.warning("[ASR-WS] ⚠ 连接不可用，停止发送音频数据")
                    break
                
                if audio_data is None:
                    if last_audio is not None:
                        request = RequestBuilder.new_audio_only_request(self.seq, last_audio, is_last=True)
                        if self._is_conn_available():
                            await self.conn.send_bytes(request)
                            logger.info(f"[ASR-WS] → 最后音频包 (seq=-{self.seq}, {len(last_audio)}B)")
                        else:
                            logger.warning("[ASR-WS] ⚠ 连接已断开，无法发送最后音频包")
                    else:
                        request = RequestBuilder.new_audio_only_request(self.seq, b"", is_last=True)
                        if self._is_conn_available():
                            await self.conn.send_bytes(request)
                            logger.info(f"[ASR-WS] → 空结束标记 (seq=-{self.seq})")
                        else:
                            logger.warning("[ASR-WS] ⚠ 连接已断开，无法发送结束标记")
                    break
                
                if last_audio is not None:
                    request = RequestBuilder.new_audio_only_request(self.seq, last_audio, is_last=False)
                    if self._is_conn_available():
                        await self.conn.send_bytes(request)
                        self.seq += 1
                    else:
                        logger.warning("[ASR-WS] ⚠ 连接已断开，停止发送音频数据")
                        break
                
                last_audio = audio_data
                
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[ASR-WS] ✗ 发送任务异常: {e}")
    
    async def _audio_receiver(self):
        try:
            if not self._is_conn_available():
                logger.warning("[ASR-WS] ⚠ 连接不可用，无法接收消息")
                return
            
            async for msg in self.conn:
                if msg.type == aiohttp.WSMsgType.BINARY:
                    response = ResponseParser.parse_response(msg.data)
                    
                    if response.payload_msg:
                        result = response.payload_msg.get('result', {})
                        if isinstance(result, dict):
                            text = result.get('text', '')
                            if text:
                                self._handle_recognition_result(result, response.is_last_package)
                    
                    if response.code != 0:
                        if response.code != 45000081:
                            logger.error(f"[ASR-WS] ✗ 错误码 {response.code}")
                        break
                    
                    if response.is_last_package:
                        break
                        
                elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSED):
                    logger.warning("[ASR-WS] ⚠ WebSocket连接已关闭或出错")
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[ASR-WS] ✗ 接收任务异常: {e}")
        finally:
            await self._disconnect()
    
    def _detect_definite_utterance(self, result: dict, text: str) -> tuple[bool, dict]:
        """检测是否为确定的utterance并提取时间信息
        
        基于ASR服务返回的utterances中的definite字段判断。
        当enable_nonstream开启时，此字段标记非流式模型重新识别的准确结果。
        
        Returns:
            tuple[bool, dict]: (是否为确定utterance, 时间信息)
        """
        utterances = result.get('utterances', [])
        
        if not utterances:
            return False, {}
        
        for utterance in utterances:
            if isinstance(utterance, dict) and utterance.get('definite', False):
                start_time = utterance.get('start_time', utterance.get('start_ms', utterance.get('begin_time', utterance.get('begin', 0))))
                end_time = utterance.get('end_time', utterance.get('end_ms', utterance.get('end', 0)))
                
                if self.enable_nonstream:
                    logger.info(f"[ASR-Result] 🎯 二遍识别结果 (definite=true, 准确率更高)")
                
                return True, {
                    'start_time': start_time,
                    'end_time': end_time
                }
        
        return False, {}
    
    def _handle_recognition_result(self, result: dict, is_last_package: bool):
        text = result.get('text', '')
        if not text:
            return
        
        is_definite_utterance, time_info = self._detect_definite_utterance(result, text)
        
        self._last_text = text
        self._current_text = text
        
        if is_definite_utterance:
            logger.info(f"[ASR] 确定结果: '{text}'")
        elif is_last_package:
            logger.info(f"[ASR] 最终结果: '{text}'")
        
        if self._on_text_callback:
            self._on_text_callback(text, is_definite_utterance, time_info)
    
    def _handle_error_response(self, code: int):
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
            45000081: "连接超时或音频流中断"
        }
        reason = error_reasons.get(code, f"未知错误码: {code}")
        logger.error(f"[ASR-WS] ✗ 错误码 {code}: {reason}")
