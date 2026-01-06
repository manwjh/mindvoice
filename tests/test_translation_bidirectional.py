"""
测试双向翻译功能

运行方式：
    python -m pytest tests/test_translation_bidirectional.py -v
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from src.agents.translation_agent import TranslationAgent


class MockLLMService:
    """模拟 LLM 服务"""
    def is_available(self):
        return True
    
    async def generate(self, *args, **kwargs):
        return "Mocked translation"


class TestLanguageDetection:
    """测试语言检测功能"""
    
    def setup_method(self):
        """每个测试前初始化"""
        self.agent = TranslationAgent(MockLLMService())
    
    def test_detect_chinese(self):
        """测试中文检测"""
        assert self.agent.detect_language("你好世界") == "zh"
        assert self.agent.detect_language("今天天气很好") == "zh"
        assert self.agent.detect_language("这是一段中文文本，包含一些English单词") == "zh"
    
    def test_detect_english(self):
        """测试英文检测"""
        assert self.agent.detect_language("Hello World") == "en"
        assert self.agent.detect_language("The weather is nice today") == "en"
        assert self.agent.detect_language("This is a test") == "en"
    
    def test_detect_japanese(self):
        """测试日文检测"""
        assert self.agent.detect_language("こんにちは") == "ja"
        assert self.agent.detect_language("ありがとう") == "ja"
        assert self.agent.detect_language("カタカナ") == "ja"
    
    def test_detect_korean(self):
        """测试韩文检测"""
        assert self.agent.detect_language("안녕하세요") == "ko"
        assert self.agent.detect_language("감사합니다") == "ko"
    
    def test_detect_empty(self):
        """测试空文本"""
        assert self.agent.detect_language("") == "en"
        assert self.agent.detect_language("   ") == "en"


class TestTranslationDirection:
    """测试翻译方向判断"""
    
    def setup_method(self):
        """每个测试前初始化"""
        self.agent = TranslationAgent(MockLLMService())
    
    def test_zh_en_chinese_input(self):
        """测试中英互译：中文输入"""
        source, target = self.agent.resolve_translation_direction("zh-en", "你好")
        assert source == "zh"
        assert target == "en"
    
    def test_zh_en_english_input(self):
        """测试中英互译：英文输入"""
        source, target = self.agent.resolve_translation_direction("zh-en", "Hello")
        assert source == "en"
        assert target == "zh"
    
    def test_en_ja_english_input(self):
        """测试英日互译：英文输入"""
        source, target = self.agent.resolve_translation_direction("en-ja", "Hello")
        assert source == "en"
        assert target == "ja"
    
    def test_en_ja_japanese_input(self):
        """测试英日互译：日文输入"""
        source, target = self.agent.resolve_translation_direction("en-ja", "こんにちは")
        assert source == "ja"
        assert target == "en"
    
    def test_zh_ko_chinese_input(self):
        """测试中韩互译：中文输入"""
        source, target = self.agent.resolve_translation_direction("zh-ko", "你好")
        assert source == "zh"
        assert target == "ko"
    
    def test_zh_ko_korean_input(self):
        """测试中韩互译：韩文输入"""
        source, target = self.agent.resolve_translation_direction("zh-ko", "안녕하세요")
        assert source == "ko"
        assert target == "zh"
    
    def test_invalid_pair(self):
        """测试无效的语言对"""
        with pytest.raises(ValueError, match="不支持的语言对"):
            self.agent.resolve_translation_direction("invalid-pair", "test")


class TestSupportedPairs:
    """测试支持的语言对"""
    
    def test_supported_pairs(self):
        """验证支持的语言对"""
        agent = TranslationAgent(MockLLMService())
        
        expected_pairs = {
            'zh-en': ('zh', 'en', '中文', '英文'),
            'zh-ja': ('zh', 'ja', '中文', '日文'),
            'zh-ko': ('zh', 'ko', '中文', '韩文'),
            'en-ja': ('en', 'ja', '英文', '日文'),
            'en-ko': ('en', 'ko', '英文', '韩文'),
        }
        
        assert agent.SUPPORTED_PAIRS == expected_pairs


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

