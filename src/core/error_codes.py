"""
系统错误码定义
定义了所有系统级别的错误码，用于统一错误处理和日志记录
"""
from enum import Enum
from typing import Dict, Optional


class ErrorCategory(str, Enum):
    """错误类别"""
    NETWORK = "NETWORK"           # 网络相关错误
    AUDIO_DEVICE = "AUDIO_DEVICE" # 音频设备错误
    ASR_SERVICE = "ASR_SERVICE"   # ASR服务错误
    LLM_SERVICE = "LLM_SERVICE"   # LLM服务错误
    STORAGE = "STORAGE"           # 存储相关错误
    AUTH = "AUTH"                 # 认证相关错误
    CONFIG = "CONFIG"             # 配置相关错误
    SYSTEM = "SYSTEM"             # 系统级错误


class SystemError:
    """系统错误定义"""
    
    # ==================== 网络错误 (1000-1099) ====================
    NETWORK_UNREACHABLE = {
        "code": 1000,
        "category": ErrorCategory.NETWORK,
        "message": "网络不可达",
        "user_message": "网络连接失败，请检查网络连接",
        "suggestion": "1. 检查网络连接\n2. 检查防火墙设置\n3. 确认API服务器地址正确"
    }
    
    NETWORK_TIMEOUT = {
        "code": 1001,
        "category": ErrorCategory.NETWORK,
        "message": "网络请求超时",
        "user_message": "连接超时，请稍后重试",
        "suggestion": "1. 检查网络速度\n2. 尝试重新连接\n3. 检查服务器状态"
    }
    
    WEBSOCKET_CONNECTION_FAILED = {
        "code": 1002,
        "category": ErrorCategory.NETWORK,
        "message": "WebSocket连接失败",
        "user_message": "实时连接失败，请刷新页面",
        "suggestion": "1. 刷新页面重试\n2. 检查API服务器状态\n3. 查看浏览器控制台日志"
    }
    
    WEBSOCKET_DISCONNECTED = {
        "code": 1003,
        "category": ErrorCategory.NETWORK,
        "message": "WebSocket连接断开",
        "user_message": "连接已断开，正在尝试重连...",
        "suggestion": "系统会自动重连，请稍候"
    }
    
    API_SERVER_UNAVAILABLE = {
        "code": 1004,
        "category": ErrorCategory.NETWORK,
        "message": "API服务器不可用",
        "user_message": "服务器暂时不可用，请稍后重试",
        "suggestion": "1. 确认后端服务已启动\n2. 检查端口是否被占用\n3. 查看服务器日志"
    }
    
    # ==================== 音频设备错误 (2000-2099) ====================
    AUDIO_DEVICE_NOT_FOUND = {
        "code": 2000,
        "category": ErrorCategory.AUDIO_DEVICE,
        "message": "未找到音频输入设备",
        "user_message": "未找到麦克风设备，请连接麦克风",
        "suggestion": "1. 检查麦克风是否已连接\n2. 检查设备驱动是否正常\n3. 在系统设置中确认麦克风可用"
    }
    
    AUDIO_DEVICE_BUSY = {
        "code": 2001,
        "category": ErrorCategory.AUDIO_DEVICE,
        "message": "音频设备被占用",
        "user_message": "麦克风正被其他程序使用，请关闭其他音频应用",
        "suggestion": "1. 关闭其他使用麦克风的应用\n2. 重启应用\n3. 检查系统音频设置"
    }
    
    AUDIO_DEVICE_PERMISSION_DENIED = {
        "code": 2002,
        "category": ErrorCategory.AUDIO_DEVICE,
        "message": "无音频设备访问权限",
        "user_message": "没有麦克风访问权限，请在系统设置中授予权限",
        "suggestion": "1. 打开系统设置 → 隐私与安全 → 麦克风\n2. 允许本应用访问麦克风\n3. 重启应用"
    }
    
    AUDIO_DEVICE_FORMAT_NOT_SUPPORTED = {
        "code": 2003,
        "category": ErrorCategory.AUDIO_DEVICE,
        "message": "音频设备不支持所需格式",
        "user_message": "当前麦克风不支持所需的音频格式",
        "suggestion": "1. 尝试使用其他麦克风\n2. 检查设备是否支持16kHz单声道\n3. 更新音频驱动程序"
    }
    
    AUDIO_DEVICE_OPEN_FAILED = {
        "code": 2004,
        "category": ErrorCategory.AUDIO_DEVICE,
        "message": "无法打开音频设备",
        "user_message": "无法打开麦克风，请检查设备状态",
        "suggestion": "1. 重新插拔麦克风\n2. 重启应用\n3. 检查设备管理器中的设备状态"
    }
    
    AUDIO_STREAM_ERROR = {
        "code": 2005,
        "category": ErrorCategory.AUDIO_DEVICE,
        "message": "音频流错误",
        "user_message": "音频录制出现问题，请重试",
        "suggestion": "1. 停止录音后重新开始\n2. 检查麦克风连接\n3. 重启应用"
    }
    
    # ==================== ASR服务错误 (3000-3099) ====================
    ASR_AUTH_FAILED = {
        "code": 3000,
        "category": ErrorCategory.ASR_SERVICE,
        "message": "ASR服务认证失败",
        "user_message": "语音识别服务认证失败，请检查配置",
        "suggestion": "1. 检查config.yml中的access_key和app_key\n2. 确认凭证未过期\n3. 验证凭证权限是否正确"
    }
    
    ASR_QUOTA_EXCEEDED = {
        "code": 3001,
        "category": ErrorCategory.ASR_SERVICE,
        "message": "ASR服务配额超限",
        "user_message": "语音识别服务配额已用完，请充值或稍后再试",
        "suggestion": "1. 检查服务账户余额\n2. 联系服务提供商充值\n3. 检查是否有未支付账单"
    }
    
    ASR_SERVICE_UNAVAILABLE = {
        "code": 3002,
        "category": ErrorCategory.ASR_SERVICE,
        "message": "ASR服务不可用",
        "user_message": "语音识别服务暂时不可用，请稍后重试",
        "suggestion": "1. 稍后重试\n2. 检查服务商状态页面\n3. 查看是否有服务公告"
    }
    
    ASR_REQUEST_TIMEOUT = {
        "code": 3003,
        "category": ErrorCategory.ASR_SERVICE,
        "message": "ASR请求超时",
        "user_message": "语音识别请求超时，请检查网络连接",
        "suggestion": "1. 检查网络速度\n2. 尝试重新识别\n3. 缩短单次录音时长"
    }
    
    ASR_AUDIO_FORMAT_ERROR = {
        "code": 3004,
        "category": ErrorCategory.ASR_SERVICE,
        "message": "ASR音频格式错误",
        "user_message": "音频格式不符合要求",
        "suggestion": "1. 确认音频为16kHz采样率\n2. 确认为单声道音频\n3. 检查音频设备配置"
    }
    
    ASR_RATE_LIMIT = {
        "code": 3005,
        "category": ErrorCategory.ASR_SERVICE,
        "message": "ASR请求频率超限",
        "user_message": "请求过于频繁，请稍后再试",
        "suggestion": "1. 等待几秒后重试\n2. 减少请求频率\n3. 考虑升级服务套餐"
    }
    
    ASR_CONNECTION_BROKEN = {
        "code": 3006,
        "category": ErrorCategory.ASR_SERVICE,
        "message": "ASR连接中断",
        "user_message": "语音识别连接中断，正在重连...",
        "suggestion": "1. 系统会自动重连\n2. 如持续失败请检查网络\n3. 尝试重启应用"
    }
    
    ASR_NOT_CONFIGURED = {
        "code": 3007,
        "category": ErrorCategory.ASR_SERVICE,
        "message": "ASR服务未配置",
        "user_message": "语音识别服务未配置，请在设置中配置",
        "suggestion": "1. 打开设置页面\n2. 配置ASR服务凭证\n3. 保存并重启服务"
    }
    
    # ==================== LLM服务错误 (4000-4099) ====================
    LLM_AUTH_FAILED = {
        "code": 4000,
        "category": ErrorCategory.LLM_SERVICE,
        "message": "LLM服务认证失败",
        "user_message": "AI服务认证失败，请检查API密钥",
        "suggestion": "1. 检查config.yml中的api_key\n2. 确认密钥未过期\n3. 验证密钥格式正确"
    }
    
    LLM_QUOTA_EXCEEDED = {
        "code": 4001,
        "category": ErrorCategory.LLM_SERVICE,
        "message": "LLM服务配额超限",
        "user_message": "AI服务配额已用完，请充值或稍后再试",
        "suggestion": "1. 检查服务账户余额\n2. 联系服务提供商充值\n3. 考虑切换其他模型"
    }
    
    LLM_SERVICE_UNAVAILABLE = {
        "code": 4002,
        "category": ErrorCategory.LLM_SERVICE,
        "message": "LLM服务不可用",
        "user_message": "AI服务暂时不可用，请稍后重试",
        "suggestion": "1. 稍后重试\n2. 检查服务提供商状态\n3. 尝试切换模型"
    }
    
    LLM_REQUEST_TIMEOUT = {
        "code": 4003,
        "category": ErrorCategory.LLM_SERVICE,
        "message": "LLM请求超时",
        "user_message": "AI响应超时，请重试",
        "suggestion": "1. 减少输入长度\n2. 降低max_tokens设置\n3. 检查网络连接"
    }
    
    LLM_RATE_LIMIT = {
        "code": 4004,
        "category": ErrorCategory.LLM_SERVICE,
        "message": "LLM请求频率超限",
        "user_message": "请求过于频繁，请稍后再试",
        "suggestion": "1. 等待几秒后重试\n2. 减少请求频率\n3. 考虑升级服务套餐"
    }
    
    LLM_MODEL_NOT_FOUND = {
        "code": 4005,
        "category": ErrorCategory.LLM_SERVICE,
        "message": "LLM模型不存在",
        "user_message": "指定的AI模型不存在或不可用",
        "suggestion": "1. 检查config.yml中的model配置\n2. 确认模型名称正确\n3. 查看服务商支持的模型列表"
    }
    
    LLM_RESPONSE_FORMAT_ERROR = {
        "code": 4006,
        "category": ErrorCategory.LLM_SERVICE,
        "message": "LLM响应格式错误",
        "user_message": "AI响应格式异常",
        "suggestion": "1. 检查提示词配置\n2. 尝试重新发送\n3. 查看后端日志"
    }
    
    LLM_NOT_CONFIGURED = {
        "code": 4007,
        "category": ErrorCategory.LLM_SERVICE,
        "message": "LLM服务未配置",
        "user_message": "AI服务未配置，请在设置中配置",
        "suggestion": "1. 打开设置页面\n2. 配置LLM服务凭证\n3. 保存并重启服务"
    }
    
    LLM_ERROR = {
        "code": 4008,
        "category": ErrorCategory.LLM_SERVICE,
        "message": "LLM服务错误",
        "user_message": "AI服务出现错误",
        "suggestion": "1. 稍后重试\n2. 检查后端日志\n3. 确认服务配置正确"
    }
    
    TRANSLATION_LANGUAGE_MISMATCH = {
        "code": 4009,
        "category": ErrorCategory.LLM_SERVICE,
        "message": "翻译语种不匹配",
        "user_message": "未检测到互译语种",
        "suggestion": "1. 确认输入的语言是否正确\n2. 检查选择的翻译语言对\n3. 尝试使用其他翻译选项"
    }
    
    # ==================== 存储错误 (5000-5099) ====================
    STORAGE_CONNECTION_FAILED = {
        "code": 5000,
        "category": ErrorCategory.STORAGE,
        "message": "存储连接失败",
        "user_message": "数据库连接失败",
        "suggestion": "1. 检查数据库文件权限\n2. 确认磁盘空间充足\n3. 重启应用"
    }
    
    STORAGE_WRITE_FAILED = {
        "code": 5001,
        "category": ErrorCategory.STORAGE,
        "message": "存储写入失败",
        "user_message": "保存数据失败，请重试",
        "suggestion": "1. 检查磁盘空间\n2. 确认文件权限\n3. 重试保存操作"
    }
    
    STORAGE_READ_FAILED = {
        "code": 5002,
        "category": ErrorCategory.STORAGE,
        "message": "存储读取失败",
        "user_message": "读取数据失败",
        "suggestion": "1. 检查数据库文件是否存在\n2. 确认文件未损坏\n3. 尝试重启应用"
    }
    
    STORAGE_DISK_FULL = {
        "code": 5003,
        "category": ErrorCategory.STORAGE,
        "message": "磁盘空间不足",
        "user_message": "磁盘空间不足，无法保存数据",
        "suggestion": "1. 清理磁盘空间\n2. 删除不需要的历史记录\n3. 更换存储位置"
    }
    
    # ==================== 配置错误 (6000-6099) ====================
    CONFIG_FILE_NOT_FOUND = {
        "code": 6000,
        "category": ErrorCategory.CONFIG,
        "message": "配置文件不存在",
        "user_message": "配置文件未找到",
        "suggestion": "1. 从config.yml.example复制配置文件\n2. 重命名为config.yml\n3. 填入正确的配置信息"
    }
    
    CONFIG_PARSE_ERROR = {
        "code": 6001,
        "category": ErrorCategory.CONFIG,
        "message": "配置文件解析失败",
        "user_message": "配置文件格式错误",
        "suggestion": "1. 检查YAML语法\n2. 参考config.yml.example\n3. 确认缩进正确"
    }
    
    CONFIG_VALIDATION_ERROR = {
        "code": 6002,
        "category": ErrorCategory.CONFIG,
        "message": "配置验证失败",
        "user_message": "配置信息不完整或错误",
        "suggestion": "1. 检查必需配置项\n2. 验证配置值格式\n3. 参考文档说明"
    }
    
    # ==================== 系统错误 (9000-9099) ====================
    SYSTEM_INTERNAL_ERROR = {
        "code": 9000,
        "category": ErrorCategory.SYSTEM,
        "message": "系统内部错误",
        "user_message": "系统出现内部错误，请联系管理员",
        "suggestion": "1. 查看详细日志\n2. 重启应用\n3. 联系技术支持"
    }
    
    SYSTEM_NOT_INITIALIZED = {
        "code": 9001,
        "category": ErrorCategory.SYSTEM,
        "message": "系统未初始化",
        "user_message": "系统正在初始化，请稍候",
        "suggestion": "1. 等待初始化完成\n2. 如长时间无响应请重启\n3. 查看启动日志"
    }
    
    SYSTEM_RESOURCE_EXHAUSTED = {
        "code": 9002,
        "category": ErrorCategory.SYSTEM,
        "message": "系统资源耗尽",
        "user_message": "系统资源不足",
        "suggestion": "1. 关闭其他应用释放资源\n2. 重启应用\n3. 升级系统配置"
    }


class SystemErrorInfo:
    """系统错误信息封装"""
    
    def __init__(
        self,
        error_def: Dict,
        details: Optional[str] = None,
        technical_info: Optional[str] = None
    ):
        """
        初始化错误信息
        
        Args:
            error_def: 错误定义字典
            details: 额外的错误详情
            technical_info: 技术信息（不展示给用户）
        """
        self.code = error_def["code"]
        self.category = error_def["category"]
        self.message = error_def["message"]
        self.user_message = error_def["user_message"]
        self.suggestion = error_def["suggestion"]
        self.details = details
        self.technical_info = technical_info
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        result = {
            "code": self.code,
            "category": self.category.value,
            "message": self.message,
            "user_message": self.user_message,
            "suggestion": self.suggestion
        }
        if self.details:
            result["details"] = self.details
        if self.technical_info:
            result["technical_info"] = self.technical_info
        return result
    
    def __str__(self) -> str:
        """字符串表示"""
        return f"[{self.code}] {self.message}" + (f": {self.details}" if self.details else "")


def get_error_by_code(code: int) -> Optional[Dict]:
    """根据错误码获取错误定义"""
    for attr_name in dir(SystemError):
        if not attr_name.startswith('_'):
            attr = getattr(SystemError, attr_name)
            if isinstance(attr, dict) and attr.get('code') == code:
                return attr
    return None

