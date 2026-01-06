# 实时翻译功能测试指南

## 测试准备

### 1. 启动服务
```bash
# 启动后端
cd /Users/wangjunhui/playcode/语音桌面助手
source venv/bin/activate
python api_server.py

# 启动前端（新终端）
cd electron-app
npm run dev
```

### 2. 打开开发者工具
- 在 Electron 应用中按 `Cmd+Option+I`（Mac）或 `Ctrl+Shift+I`（Windows/Linux）
- 切换到 Console 标签页

## 测试步骤

### 测试 1：基本实时翻译（中→英）

**步骤**：
1. 点击"开始工作"进入笔记编辑
2. 点击语言选择器，选择 `🇨🇳 - 🇬🇧`（中英互译）
3. 在第一个 block 中输入："你好世界"
4. 点击其他地方（或按 Tab 键）使 block 失焦

**预期日志**：
```
[VoiceNote] 🔍 handleBlockBlur 触发: block-xxx 当前语言: zh-en
[VoiceNote] ✅ 触发实时翻译: block-xxx 语言对: zh-en
[VoiceNote] 🌐 translateSingleBlock 开始: block-xxx
[VoiceNote] 📝 Block 信息: {id: "block-xxx", type: "paragraph", content: "你好世界", hasTranslation: false}
[VoiceNote] 🚀 开始翻译 block: block-xxx 语言对: zh-en
[VoiceNote] 📨 翻译 API 响应: {success: true, translations: ["Hello World"]}
[VoiceNote] 📋 翻译结果: Hello World
[VoiceNote] ✅ 实时翻译完成: block-xxx zh-en
[VoiceNote] 🏁 translateSingleBlock 结束: block-xxx
```

**验证**：
- 切换到翻译视图（点击语言选择器，确认选中 `🇨🇳 - 🇬🇧`）
- 应该看到："Hello World"

---

### 测试 2：反向翻译（英→中）

**步骤**：
1. 确保语言选择器仍为 `🇨🇳 - 🇬🇧`
2. 在新的 block 中输入："Hello World"
3. 失焦

**预期日志**：
```
[VoiceNote] 🔍 handleBlockBlur 触发: block-yyy 当前语言: zh-en
[VoiceNote] ✅ 触发实时翻译: block-yyy 语言对: zh-en
[VoiceNote] 🚀 开始翻译 block: block-yyy 语言对: zh-en
[VoiceNote] 📋 翻译结果: 你好世界
[VoiceNote] ✅ 实时翻译完成: block-yyy zh-en
```

**验证**：
- 翻译视图应该显示："你好世界"

---

### 测试 3：语种不匹配（日文输入）

**步骤**：
1. 确保语言选择器为 `🇨🇳 - 🇬🇧`
2. 在新的 block 中输入："こんにちは"
3. 失焦

**预期日志**：
```
[VoiceNote] 🔍 handleBlockBlur 触发: block-zzz 当前语言: zh-en
[VoiceNote] ✅ 触发实时翻译: block-zzz 语言对: zh-en
[VoiceNote] 🚀 开始翻译 block: block-zzz 语言对: zh-en
[VoiceNote] 📋 翻译结果: {error: "language_not_detected", message: "未检测到互译语种（zh-en）"}
[VoiceNote] ⚠️  未检测到互译语种: block-zzz 未检测到互译语种（zh-en）
```

**验证**：
- 翻译视图应该显示："⚠️ 未检测到互译语种"

---

### 测试 4：切换语言对

**步骤**：
1. 点击语言选择器，选择 `🇨🇳 - 🇯🇵`（中日互译）
2. 在新的 block 中输入："你好"
3. 失焦

**预期日志**：
```
[VoiceNote] 🔍 handleBlockBlur 触发: block-www 当前语言: zh-ja
[VoiceNote] ✅ 触发实时翻译: block-www 语言对: zh-ja
[VoiceNote] 🚀 开始翻译 block: block-www 语言对: zh-ja
[VoiceNote] 📋 翻译结果: こんにちは
[VoiceNote] ✅ 实时翻译完成: block-www zh-ja
```

**验证**：
- 翻译视图应该显示："こんにちは"

---

### 测试 5：空内容跳过

**步骤**：
1. 在新的 block 中不输入任何内容
2. 直接失焦

**预期日志**：
```
[VoiceNote] 🔍 handleBlockBlur 触发: block-empty 当前语言: zh-ja
[VoiceNote] ✅ 触发实时翻译: block-empty 语言对: zh-ja
[VoiceNote] 🌐 translateSingleBlock 开始: block-empty
[VoiceNote] 📝 Block 信息: {id: "block-empty", type: "paragraph", content: "", hasTranslation: false}
[VoiceNote] ⏭️  内容为空，跳过
```

**验证**：
- 不应该调用翻译 API

---

### 测试 6：已有翻译跳过

**步骤**：
1. 回到之前翻译过的 block（如"你好世界"）
2. 再次点击进入编辑
3. 不修改内容，直接失焦

**预期日志**：
```
[VoiceNote] 🔍 handleBlockBlur 触发: block-xxx 当前语言: zh-en
[VoiceNote] ✅ 触发实时翻译: block-xxx 语言对: zh-en
[VoiceNote] 🌐 translateSingleBlock 开始: block-xxx
[VoiceNote] 📝 Block 信息: {id: "block-xxx", type: "paragraph", content: "你好世界", hasTranslation: true}
[VoiceNote] ⏭️  Block 已有翻译，跳过: block-xxx
```

**验证**：
- 不应该重复调用翻译 API

---

### 测试 7：原文模式不翻译

**步骤**：
1. 点击语言选择器，选择 `📄 原文`
2. 在新的 block 中输入："测试内容"
3. 失焦

**预期日志**：
```
[VoiceNote] 🔍 handleBlockBlur 触发: block-test 当前语言: original
[VoiceNote] ⏭️  跳过翻译（当前为原文模式）
```

**验证**：
- 不应该触发翻译

---

## 常见问题排查

### 问题 1：没有看到翻译日志

**可能原因**：
- 语言选择器还是"原文"状态
- Block 失焦事件没有触发

**解决方法**：
1. 确认语言选择器显示的是互译图标（如 🇨🇳 - 🇬🇧）
2. 确保点击了其他地方让 block 失焦
3. 查看控制台是否有 `handleBlockBlur` 日志

---

### 问题 2：翻译 API 调用失败

**可能原因**：
- 后端服务未启动
- LLM 服务不可用

**解决方法**：
1. 检查后端日志是否有错误
2. 查看控制台的错误信息
3. 确认 `config.yml` 中的 LLM 配置正确

---

### 问题 3：翻译结果不显示

**可能原因**：
- 没有切换到翻译视图
- Block 的 translations 字段没有更新

**解决方法**：
1. 确认语言选择器选中了互译选项
2. 查看控制台日志确认翻译成功
3. 检查 `[VoiceNote] ✅ 实时翻译完成` 日志

---

## 后端日志检查

在后端终端查看翻译相关日志：

```
[TranslationAgent] 语言对=zh-en, 检测到语言=zh
[TranslationAgent] 翻译方向: zh -> en
[TranslationAgent] 开始翻译: zh -> en, 长度=12
[API] 使用语言对批量翻译: zh-en, 文本数=1
[TranslationAgent] 批量翻译完成: 1 条，语言对=zh-en
```

如果看到警告：
```
[TranslationAgent] 未检测到互译语种: pair=zh-en, detected=ja
```
说明语种检测功能正常工作。

---

## 测试检查清单

- [ ] 中文 → 英文翻译
- [ ] 英文 → 中文翻译（反向）
- [ ] 语种不匹配提示
- [ ] 切换语言对
- [ ] 空内容跳过
- [ ] 已有翻译跳过
- [ ] 原文模式不翻译
- [ ] 翻译结果正确显示
- [ ] 控制台日志完整
- [ ] 后端日志正常

---

## 性能测试

### 测试多个 Block 连续翻译

**步骤**：
1. 选择 `🇨🇳 - 🇬🇧`
2. 快速输入 5 个 block：
   - Block 1: "你好"
   - Block 2: "世界"
   - Block 3: "测试"
   - Block 4: "Hello"
   - Block 5: "World"
3. 依次失焦

**预期**：
- 每个 block 独立翻译
- 不阻塞 UI
- 翻译状态正确跟踪

---

## 成功标准

✅ 所有测试用例通过  
✅ 控制台日志完整清晰  
✅ 翻译结果准确  
✅ 错误提示正确显示  
✅ 性能流畅无卡顿  

---

**测试人员**: ___________  
**测试日期**: ___________  
**测试结果**: ⬜ 通过 / ⬜ 失败  
**备注**: ___________

