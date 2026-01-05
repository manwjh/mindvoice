"""
LiteLLM 提供商实现
支持通过 LiteLLM 统一调用多种 LLM 服务
"""
import logging
from typing import Dict, Any, AsyncIterator, Union, Tuple, Optional
from .base_llm import BaseLLMProvider

logger = logging.getLogger(__name__)


class LiteLLMProvider(BaseLLMProvider):
    """LiteLLM 提供商
    
    通过 LiteLLM 库统一调用多种 LLM 服务，支持：
    - OpenAI、Azure OpenAI
    - Anthropic (Claude)
    - Google (Gemini)
    - 国内厂商：通义千问、文心一言、ChatGLM 等
    - 以及任何兼容 OpenAI API 的服务
    """
    
    def __init__(self):
        super().__init__()
        self._client = None
        self._last_usage: Optional[Dict[str, int]] = None  # 最后一次调用的token使用情况
    
    @property
    def name(self) -> str:
        return "litellm"
    
    def initialize(self, config: Dict[str, Any]) -> bool:
        """初始化 LiteLLM 提供商
        
        Args:
            config: 配置字典，包含：
                - api_key: API 密钥
                - base_url: API 基础 URL（可选，用于自定义端点）
                - model: 模型名称
                - provider: 提供商名称（可选，用于标识）
                - max_context_tokens: 最大上下文长度（可选）
                
        Returns:
            是否初始化成功
        """
        try:
            # 延迟导入 litellm，避免未安装时影响其他功能
            import litellm
            
            self._config = config
            
            # 配置 LiteLLM
            if config.get('api_key'):
                # 设置 API key（LiteLLM 会根据模型名称自动推断使用哪个 key）
                litellm.api_key = config['api_key']
            
            if config.get('base_url'):
                # 设置自定义 base_url
                litellm.api_base = config['base_url']
            
            # 验证配置
            if not config.get('model'):
                logger.error("[LiteLLM] 缺少 model 配置")
                return False
            
            self._initialized = True
            logger.info(f"[LiteLLM] 初始化成功，模型: {config.get('model')}, 提供商: {config.get('provider', 'auto')}")
            return True
            
        except ImportError:
            logger.error("[LiteLLM] 未安装 litellm 库，请运行: pip install litellm")
            return False
        except Exception as e:
            logger.error(f"[LiteLLM] 初始化失败: {e}")
            return False
    
    async def chat(
        self, 
        messages: list[Dict[str, str]], 
        stream: bool = False, 
        **kwargs
    ) -> Union[str, AsyncIterator[str]]:
        """对话接口
        
        Args:
            messages: 消息列表，格式 [{"role": "user", "content": "..."}]
            stream: 是否流式返回
            **kwargs: 其他参数
                - temperature: 温度参数（0-1）
                - max_tokens: 最大生成 token 数
                - top_p: nucleus sampling 参数
                
        Returns:
            如果 stream=True，返回 AsyncIterator[str]
            如果 stream=False，返回完整响应文本 str
        """
        if not self._initialized:
            raise RuntimeError("LiteLLM provider not initialized")
        
        try:
            import litellm
            
            # 准备请求参数
            model = self._config.get('model')
            
            # 合并参数
            request_params = {
                'model': model,
                'messages': messages,
                'stream': stream,
            }
            
            # 添加可选参数
            if 'temperature' in kwargs:
                request_params['temperature'] = kwargs['temperature']
            if 'max_tokens' in kwargs:
                request_params['max_tokens'] = kwargs['max_tokens']
            if 'top_p' in kwargs:
                request_params['top_p'] = kwargs['top_p']
            
            # 如果配置了自定义 base_url，需要特殊处理
            if self._config.get('base_url'):
                request_params['api_base'] = self._config['base_url']
            if self._config.get('api_key'):
                request_params['api_key'] = self._config['api_key']
            
            # 流式模式下请求包含 usage 信息
            if stream:
                request_params['stream_options'] = {'include_usage': True}
            
            logger.info(f"[LiteLLM] 发送请求到模型: {model}, 流式: {stream}")
            
            if stream:
                # 流式返回
                return self._stream_chat(request_params)
            else:
                # 非流式返回
                response = await litellm.acompletion(**request_params)
                content = response.choices[0].message.content
                
                # 提取token使用信息
                if hasattr(response, 'usage') and response.usage:
                    self._last_usage = {
                        'prompt_tokens': response.usage.prompt_tokens,
                        'completion_tokens': response.usage.completion_tokens,
                        'total_tokens': response.usage.total_tokens
                    }
                    logger.info(f"[LiteLLM] Token使用: prompt={self._last_usage['prompt_tokens']}, "
                              f"completion={self._last_usage['completion_tokens']}, "
                              f"total={self._last_usage['total_tokens']}")
                else:
                    self._last_usage = None
                
                logger.info(f"[LiteLLM] 收到响应，长度: {len(content)}")
                return content
                
        except Exception as e:
            logger.error(f"[LiteLLM] 对话请求失败: {e}")
            raise
    
    async def _stream_chat(self, request_params: Dict[str, Any]) -> AsyncIterator[str]:
        """流式对话生成器
        
        Args:
            request_params: 请求参数
            
        Yields:
            生成的文本片段
        """
        try:
            import litellm
            
            response = await litellm.acompletion(**request_params)
            
            # 重置token使用信息
            self._last_usage = None
            
            async for chunk in response:
                # 提取token使用信息（流式响应中通常在最后一个chunk）
                if hasattr(chunk, 'usage') and chunk.usage:
                    self._last_usage = {
                        'prompt_tokens': chunk.usage.prompt_tokens,
                        'completion_tokens': chunk.usage.completion_tokens,
                        'total_tokens': chunk.usage.total_tokens
                    }
                
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield content
            
            # 流式结束后记录token使用
            if self._last_usage:
                logger.info(f"[LiteLLM] 流式完成，Token使用: prompt={self._last_usage['prompt_tokens']}, "
                          f"completion={self._last_usage['completion_tokens']}, "
                          f"total={self._last_usage['total_tokens']}")
                    
        except Exception as e:
            logger.error(f"[LiteLLM] 流式响应错误: {e}")
            raise
    
    def get_last_usage(self) -> Optional[Dict[str, int]]:
        """获取最后一次调用的token使用情况
        
        Returns:
            包含 prompt_tokens, completion_tokens, total_tokens 的字典，
            如果没有可用数据则返回 None
        """
        return self._last_usage
    
    def is_available(self) -> bool:
        """检查服务是否可用"""
        if not self._initialized:
            return False
        
        try:
            import litellm
            return True
        except ImportError:
            return False

