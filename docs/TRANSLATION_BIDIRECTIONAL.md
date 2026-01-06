# 双向翻译功能说明

## 当前状态（2026-01-06）

### ✅ 已完成实现

#### 1. 前端语言选项更新为互译形式
- `zh-en` - 中英互译（🇨🇳 - 🇬🇧）
- `zh-ja` - 中日互译（🇨🇳 - 🇯🇵）
- `zh-ko` - 中韩互译（🇨🇳 - 🇰🇷）
- `en-ja` - 英日互译（🇬🇧 - 🇯🇵）
- `en-ko` - 英韩互译（🇬🇧 - 🇰🇷）

#### 2. 后端自动语言检测
- ✅ 实现了 `detect_language()` 方法
- ✅ 支持中文、英文、日文、韩文的自动检测
- ✅ 基于字符统计的检测算法

#### 3. 双向翻译逻辑
- ✅ `translate_with_pair()` - 单条文本自动判断方向
- ✅ `batch_translate_with_pair()` - 批量翻译，每条文本独立判断
- ✅ `resolve_translation_direction()` - 智能判断翻译方向

#### 4. API 升级
- ✅ 支持 `language_pair` 参数（推荐）
- ✅ 保留 `source_lang` + `target_lang` 参数（向后兼容）

### 🎯 功能说明

**双向互译工作原理**：
1. 用户选择语言对（如 `zh-en`）
2. 后端检测每条文本的实际语言
3. 自动决定翻译方向：
   - 检测到中文 → 翻译成英文
   - 检测到英文 → 翻译成中文
4. 混合语言内容自动处理

## 语言检测算法

### 当前实现（TranslationAgent.detect_language）

```python
def detect_language(self, text: str) -> str:
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
    if japanese_hiragana + japanese_katakana > 0:
        return 'ja'
    
    # 韩文检测（韩文字符）
    if korean_chars > 0:
        return 'ko'
    
    # 默认英文
    return 'en'
```

**优点**：
- 无需第三方库
- 速度快
- 适合大多数场景

**局限**：
- 混合语言内容可能误判
- 无法处理罕见语言

### 未来改进方案

#### 方案1：使用 langdetect 库（推荐）

```bash
pip install langdetect
```

```python
from langdetect import detect

def detect_language_accurate(text: str) -> str:
    try:
        lang = detect(text)
        lang_map = {
            'zh-cn': 'zh', 'zh-tw': 'zh',
            'en': 'en', 'ja': 'ja', 'ko': 'ko'
        }
        return lang_map.get(lang, 'en')
    except:
        return 'en'
```

**优点**：
- 更准确
- 支持更多语言
- 处理混合语言更好

**缺点**：
- 需要额外依赖

#### 方案2：前端语言检测（备选）

在 `VoiceNote.tsx` 的 `translateAllBlocks` 函数中添加语言检测：

```typescript
const detectLanguage = (text: string): string => {
  // 简单的语言检测逻辑
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
  const totalChars = text.length;
  const chineseRatio = chineseChars ? chineseChars.length / totalChars : 0;
  
  if (chineseRatio > 0.3) return 'zh';
  
  // 日文检测
  const japaneseChars = text.match(/[\u3040-\u309f\u30a0-\u30ff]/g);
  if (japaneseChars && japaneseChars.length > 0) return 'ja';
  
  // 韩文检测
  const koreanChars = text.match(/[\uac00-\ud7af]/g);
  if (koreanChars && koreanChars.length > 0) return 'ko';
  
  // 默认英文
  return 'en';
};

// 在翻译时根据内容决定方向
const languagePair = parseLanguagePair(languageType);
if (languagePair) {
  const detectedLang = detectLanguage(block.content);
  
  // 如果检测到的语言是 source，按原方向翻译
  // 如果检测到的语言是 target，反向翻译
  const actualSource = detectedLang === languagePair.target 
    ? languagePair.target 
    : languagePair.source;
  const actualTarget = actualSource === languagePair.source 
    ? languagePair.target 
    : languagePair.source;
  
  // 调用翻译 API
  const response = await fetch(`${API_BASE_URL}/api/translate/batch`, {
    method: 'POST',
    body: JSON.stringify({
      texts,
      source_lang: actualSource,
      target_lang: actualTarget
    })
  });
}
```

## 使用示例

### 前端调用
```typescript
// 选择语言对
const languagePair = 'zh-en';  // 中英互译

// 调用批量翻译 API
const response = await fetch(`${API_BASE_URL}/api/translate/batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    texts: ['你好世界', 'Hello World', '再见'],
    language_pair: 'zh-en'  // 使用语言对参数
  })
});

// 结果：
// '你好世界' → 'Hello World'
// 'Hello World' → '你好世界'
// '再见' → 'Goodbye'
```

### 向后兼容
```typescript
// 仍然支持固定方向翻译
body: JSON.stringify({
  texts: ['你好世界'],
  source_lang: 'zh',
  target_lang: 'en'
})
```

## 测试建议

### 单元测试
```python
# 测试语言检测
assert agent.detect_language("你好") == "zh"
assert agent.detect_language("Hello") == "en"
assert agent.detect_language("こんにちは") == "ja"
assert agent.detect_language("안녕하세요") == "ko"

# 测试翻译方向判断
assert agent.resolve_translation_direction("zh-en", "你好") == ("zh", "en")
assert agent.resolve_translation_direction("zh-en", "Hello") == ("en", "zh")
```

### 集成测试
1. 选择中英互译
2. 输入混合内容：
   ```
   今天天气很好。
   The weather is nice today.
   明天见！
   ```
3. 验证每句话都正确翻译

## 相关文件

### 前端
- 语言选择器：`electron-app/src/components/shared/LanguageSelector.tsx`
- 翻译逻辑：`electron-app/src/components/apps/VoiceNote/VoiceNote.tsx`
  - `handleLanguageChange()` - 语言切换处理
  - `translateAllBlocks()` - 批量翻译

### 后端
- 翻译 Agent：`src/agents/translation_agent.py`
  - `detect_language()` - 语言检测
  - `resolve_translation_direction()` - 方向判断
  - `translate_with_pair()` - 单条翻译
  - `batch_translate_with_pair()` - 批量翻译
- API 端点：`src/api/server.py`
  - `POST /api/translate/batch` - 批量翻译接口

## 技术总结

✅ **已实现**：
- 5种语言对的双向互译
- 自动语言检测（基于字符统计）
- 智能翻译方向判断
- 前后端完整集成

🎯 **核心优势**：
- 用户体验简化：只需选择语言对，不用关心方向
- 智能化处理：自动检测内容语言
- 高效批量处理：每条独立判断，支持混合内容

🔮 **未来优化**：
- 集成 langdetect 提高检测准确率
- 支持更多语言对
- 优化混合语言内容处理

