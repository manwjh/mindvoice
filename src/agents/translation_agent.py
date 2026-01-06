"""
翻译Agent

专门用于语音笔记的多语言翻译，支持双向互译
"""
from typing import AsyncIterator, Union, Optional, Dict, Any, Tuple
import re
from .base_agent import BaseAgent
from .prompts import PromptLoader


class TranslationAgent(BaseAgent):
    """翻译Agent - 支持双向互译
    
    功能：
    - 支持多语言对互译（中英日韩）
    - 自动检测源语言并判断翻译方向
    - 保留原文的语气和风格
    - 针对ASR文本优化（处理口语化表达）
    - 支持流式和非流式输出
    """
    
    # 支持的语言对（互译对，会根据内容自动判断翻译方向）
    SUPPORTED_PAIRS = {
        'zh-en': ('zh', 'en', '中文', '英文'),
        'zh-ja': ('zh', 'ja', '中文', '日文'),
        'zh-ko': ('zh', 'ko', '中文', '韩文'),
        'en-ja': ('en', 'ja', '英文', '日文'),
        'en-ko': ('en', 'ko', '英文', '韩文'),
    }
    
    # 语言代码到名称的映射
    LANGUAGE_NAMES = {
        'zh': '中文',
        'en': '英文',
        'ja': '日文',
        'ko': '韩文',
    }
    
    def __init__(self, llm_service, config: Optional[Dict[str, Any]] = None):
        """初始化TranslationAgent
        
        Args:
            llm_service: LLM服务实例
            config: Agent配置（可选）
        """
        super().__init__(llm_service, config)
        
        # 加载提示词配置
        self.prompt_config = PromptLoader.load('translation_agent')
        
        # 使用提示词配置中的默认参数
        prompt_params = self.prompt_config.get('parameters', {})
        self.config = {**prompt_params, **(config or {})}
    
    @property
    def name(self) -> str:
        return self.prompt_config['metadata']['name']
    
    @property
    def description(self) -> str:
        return self.prompt_config['metadata']['description']
    
    def detect_language(self, text: str) -> str:
        """检测文本的语言
        
        使用简单的字符统计方法进行语言检测
        
        Args:
            text: 待检测文本
            
        Returns:
            语言代码（zh/en/ja/ko）
        """
        if not text or not text.strip():
            return 'en'  # 默认英文
        
        # 统计各语言字符数量
        chinese_chars = len(re.findall(r'[\u4e00-\u9fa5]', text))
        japanese_hiragana = len(re.findall(r'[\u3040-\u309f]', text))
        japanese_katakana = len(re.findall(r'[\u30a0-\u30ff]', text))
        korean_chars = len(re.findall(r'[\uac00-\ud7af]', text))
        
        total_chars = len(text)
        
        # 中文检测（汉字占比 > 20%）
        if chinese_chars / total_chars > 0.2:
            return 'zh'
        
        # 日文检测（平假名或片假名）
        japanese_chars = japanese_hiragana + japanese_katakana
        if japanese_chars > 0:
            return 'ja'
        
        # 韩文检测（韩文字符）
        if korean_chars > 0:
            return 'ko'
        
        # 默认英文
        return 'en'
    
    def resolve_translation_direction(self, pair_key: str, text: str) -> Tuple[str, str, bool]:
        """根据语言对和文本内容，自动判断翻译方向
        
        Args:
            pair_key: 语言对键（如 'zh-en'）
            text: 待翻译文本
            
        Returns:
            (source_lang, target_lang, is_valid) 元组
            - source_lang: 源语言
            - target_lang: 目标语言  
            - is_valid: 是否检测到互译语种（True=可翻译，False=语种不匹配）
            
        Examples:
            pair_key='zh-en', text='你好' -> ('zh', 'en', True)
            pair_key='zh-en', text='Hello' -> ('en', 'zh', True)
            pair_key='zh-en', text='こんにちは' -> ('zh', 'en', False)  # 日文不在zh-en中
            pair_key='en-ja', text='Hello' -> ('en', 'ja', True)
            pair_key='en-ja', text='こんにちは' -> ('ja', 'en', True)
        """
        if pair_key not in self.SUPPORTED_PAIRS:
            raise ValueError(f"不支持的语言对: {pair_key}")
        
        lang1_code, lang2_code, _, _ = self.SUPPORTED_PAIRS[pair_key]
        
        # 检测文本语言
        detected_lang = self.detect_language(text)
        
        self.logger.debug(f"[{self.name}] 语言对={pair_key}, 检测到语言={detected_lang}")
        
        # 检查检测到的语言是否在互译对中
        is_valid = detected_lang in [lang1_code, lang2_code]
        
        # 如果检测到的语言是 lang2，则反向翻译
        if detected_lang == lang2_code:
            source_lang = lang2_code
            target_lang = lang1_code
        else:
            # 默认正向翻译（包括检测到 lang1 或其他语言的情况）
            source_lang = lang1_code
            target_lang = lang2_code
        
        if is_valid:
            self.logger.info(f"[{self.name}] 翻译方向: {source_lang} -> {target_lang}")
        else:
            self.logger.warning(f"[{self.name}] 未检测到互译语种: pair={pair_key}, detected={detected_lang}")
        
        return source_lang, target_lang, is_valid
    
    def get_system_prompt(self, source_lang: str, target_lang: str) -> str:
        """获取系统提示词（动态生成）
        
        Args:
            source_lang: 源语言代码
            target_lang: 目标语言代码
            
        Returns:
            系统提示词
        """
        base_prompt = self.prompt_config['system_prompt']
        
        # 获取语言名称
        source_name = self.LANGUAGE_NAMES.get(source_lang, source_lang)
        target_name = self.LANGUAGE_NAMES.get(target_lang, target_lang)
        
        # 替换占位符
        return base_prompt.format(
            source_language=source_name,
            target_language=target_name
        )
    
    def preprocess_input(self, input_text: str) -> str:
        """预处理输入文本
        
        功能：
        1. 清理输入
        2. 检测空内容
        
        Args:
            input_text: 原始输入文本
            
        Returns:
            清理后的文本
        """
        cleaned = input_text.strip()
        
        if not cleaned:
            raise ValueError("输入内容为空")
        
        return cleaned
    
    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        stream: bool = False,
        **kwargs
    ) -> Union[str, AsyncIterator[str]]:
        """翻译文本（指定源语言和目标语言）
        
        Args:
            text: 待翻译文本
            source_lang: 源语言代码（zh/en/ja/ko）
            target_lang: 目标语言代码（zh/en/ja/ko）
            stream: 是否使用流式输出
            **kwargs: 其他参数
            
        Returns:
            翻译结果（字符串或流式迭代器）
        """
        # 预处理输入
        text = self.preprocess_input(text)
        
        # 获取针对该语言对的系统提示词
        system_prompt = self.get_system_prompt(source_lang, target_lang)
        
        # 调用LLM生成翻译
        self.logger.info(f"[{self.name}] 开始翻译: {source_lang} -> {target_lang}, 长度={len(text)}")
        
        try:
            if stream:
                # 流式生成
                result = await self.llm_service.simple_chat(
                    user_message=text,
                    system_prompt=system_prompt,
                    stream=True,
                    **kwargs
                )
                return result
            else:
                # 非流式生成
                response = await self.llm_service.simple_chat(
                    user_message=text,
                    system_prompt=system_prompt,
                    stream=False,
                    **kwargs
                )
                
                self.logger.info(f"[{self.name}] 翻译完成，长度={len(response)}")
                return response
                
        except Exception as e:
            self.logger.error(f"[{self.name}] 翻译失败: {e}", exc_info=True)
            raise
    
    async def translate_with_pair(
        self,
        text: str,
        pair_key: str,
        stream: bool = False,
        **kwargs
    ) -> Union[str, AsyncIterator[str], Dict[str, Any]]:
        """使用语言对进行翻译（自动检测方向）
        
        Args:
            text: 待翻译文本
            pair_key: 语言对键（如 'zh-en', 'en-ja'）
            stream: 是否使用流式输出
            **kwargs: 其他参数
            
        Returns:
            翻译结果（字符串或流式迭代器）
            如果检测到语种不匹配，返回 {"error": "language_not_detected", "message": "..."}
        """
        # 自动判断翻译方向
        source_lang, target_lang, is_valid = self.resolve_translation_direction(pair_key, text)
        
        # 如果检测到的语种不在互译对中，返回错误
        if not is_valid:
            error_msg = f"未检测到互译语种（{pair_key}）"
            self.logger.warning(f"[{self.name}] {error_msg}: text={text[:50]}...")
            return {
                "error": "language_not_detected",
                "message": error_msg,
                "detected_lang": self.detect_language(text),
                "expected_langs": [source_lang, target_lang]
            }
        
        # 调用标准翻译方法
        return await self.translate(text, source_lang, target_lang, stream, **kwargs)
    
    async def batch_translate(
        self,
        texts: list[str],
        source_lang: str,
        target_lang: str,
        **kwargs
    ) -> list[str]:
        """批量翻译（指定源语言和目标语言）
        
        Args:
            texts: 待翻译文本列表
            source_lang: 源语言代码
            target_lang: 目标语言代码
            **kwargs: 其他参数
            
        Returns:
            翻译结果列表
        """
        results = []
        for text in texts:
            if not text.strip():
                results.append("")
                continue
            
            result = await self.translate(
                text, source_lang, target_lang, 
                stream=False, **kwargs
            )
            results.append(result)
        
        self.logger.info(f"[{self.name}] 批量翻译完成: {len(texts)} 条")
        return results
    
    async def batch_translate_with_pair(
        self,
        texts: list[str],
        pair_key: str,
        **kwargs
    ) -> list[Union[str, Dict[str, Any]]]:
        """批量翻译（使用语言对，自动检测每条文本的翻译方向）
        
        Args:
            texts: 待翻译文本列表
            pair_key: 语言对键（如 'zh-en', 'en-ja'）
            **kwargs: 其他参数
            
        Returns:
            翻译结果列表
            - 成功：返回翻译后的字符串
            - 失败：返回 {"error": "language_not_detected", "message": "..."}
        """
        results = []
        for text in texts:
            if not text.strip():
                results.append("")
                continue
            
            # 每条文本单独判断翻译方向
            result = await self.translate_with_pair(
                text, pair_key, 
                stream=False, **kwargs
            )
            results.append(result)
        
        self.logger.info(f"[{self.name}] 批量翻译完成: {len(texts)} 条，语言对={pair_key}")
        return results

