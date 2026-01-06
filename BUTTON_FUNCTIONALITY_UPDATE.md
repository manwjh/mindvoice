# BottomToolbar 按钮功能更新

## 更新日期
2026-01-06

## 更新内容

### 1. 原文（LanguageSelector）按钮
**变更**：移除禁用条件
- **之前**：`disabled={!hasContent}` - 没有内容时禁用
- **之后**：`disabled={false}` - 始终可用
- **原因**：note_info 总是有标题信息内容，所以可以随时切换语言

### 2. 复制按钮
**变更**：移除禁用条件，增强功能
- **之前**：
  - 禁用条件：`disabled={!hasContent}`
  - 只复制 text 字段
- **之后**：
  - 禁用条件：`disabled={false}` - 始终可用
  - 点击时自动强制保存到数据库（确保 note_info + blocks 完整保存）
  - 复制内容包含：note_info + blocks（完整笔记信息）
- **功能增强**：
  ```typescript
  // 纯文本复制：包含笔记信息
  📋 笔记信息
  📌 标题: xxx
  🏷️ 类型: xxx
  👥 相关人员: xxx
  📍 地点: xxx
  ⏰ 开始时间: xxx
  ⏱️ 结束时间: xxx
  
  ---
  
  [笔记内容]
  ```
  - 富文本复制：通过 `/api/records/{id}/export?format=html` 获取，包含图片

### 3. 导出按钮
**变更**：简化禁用条件
- **之前**：`disabled={!currentWorkingRecordId || asrState !== 'idle'}` - 需要已保存记录且 ASR 空闲
- **之后**：`disabled={asrState !== 'idle'}` - 仅检查 ASR 空闲
- **功能增强**：
  - 点击时自动强制保存到数据库（确保 note_info + blocks 完整保存）
  - 导出内容始终包含：note_info + blocks（完整笔记信息）

### 4. 小结按钮
**无变更**：保持原有禁用逻辑
- 禁用条件：`asrState !== 'idle' || !hasContent || isSummarizing`
- 原因：小结需要有实际内容才能生成

## 技术实现

### 新增功能：强制立即保存
在 `App.tsx` 中新增 `forceSave` 函数：
```typescript
const forceSave = async () => {
  console.log('[强制保存] 开始强制保存到数据库');
  try {
    await voiceNoteAutoSave.saveToDatabase('manual', true); // immediate = true
    console.log('[强制保存] 保存完成');
  } catch (error) {
    console.error('[强制保存] 保存失败:', error);
    throw error;
  }
};
```

### 复制功能增强
修改 `copyText` 函数，从 blocks 提取完整内容：
```typescript
const copyText = async () => {
  // 获取所有 blocks 和 noteInfo
  const blocks = blockEditorRef.current.getBlocks();
  const noteInfo = blockEditorRef.current.getNoteInfo();
  
  // 构建包含 note_info 的文本
  let textToCopy = '';
  
  // 添加笔记信息
  if (noteInfo) {
    textToCopy += '📋 笔记信息\n';
    // ... 添加各种信息
  }
  
  // 添加内容 blocks（包括图片占位符）
  const contentText = blocks
    .filter((b: any) => b.type !== 'note-info' && !b.isBufferBlock)
    .map((b: any) => {
      if (b.type === 'image') {
        return `[IMAGE: ${b.imageUrl || ''}]${b.imageCaption ? ' ' + b.imageCaption : ''}`;
      }
      return b.content;
    })
    .join('\n');
  
  textToCopy += contentText;
  await navigator.clipboard.writeText(textToCopy);
};
```

### VoiceNote 组件更新
1. 新增 `onForceSave?: () => Promise<void>` prop
2. 复制和导出前调用 `onForceSave()`：
```typescript
const handleCopyClick = useCallback(async () => {
  if (onForceSave) {
    await onForceSave(); // 强制立即保存
    await new Promise(resolve => setTimeout(resolve, 300)); // 等待状态更新
  }
  setShowCopyDialog(true);
}, [onForceSave]);
```

## 用户体验改进

### 改进前
- ❌ 原文按钮在没有内容时禁用（但 note_info 始终存在）
- ❌ 复制按钮需要先有内容才能点击
- ❌ 导出按钮需要先手动保存，否则显示灰色
- ❌ 复制的内容可能不包含笔记信息

### 改进后
- ✅ 原文按钮始终可用
- ✅ 复制按钮始终可用，自动保存后复制完整内容（note_info + blocks）
- ✅ 导出按钮在非录音状态下始终可用，自动保存后导出完整内容
- ✅ 复制的内容包含完整的笔记信息和图片占位符

## 测试建议

### 测试场景 1：复制空笔记
1. 创建新笔记，只填写 note_info（标题、类型等）
2. 不输入任何内容
3. 点击复制按钮
4. **预期结果**：复制成功，剪贴板包含 note_info

### 测试场景 2：导出未保存笔记
1. 创建新笔记，输入一些内容
2. 不手动保存
3. 点击导出按钮
4. **预期结果**：自动保存后导出成功，包含完整内容

### 测试场景 3：复制含图片笔记
1. 创建笔记，粘贴图片
2. 点击复制按钮 → 选择纯文本
3. **预期结果**：复制的文本包含 `[IMAGE: images/xxx.png]` 占位符

### 测试场景 4：切换语言
1. 创建新笔记，只填写 note_info
2. 不输入任何内容
3. 点击原文下拉菜单
4. **预期结果**：可以正常选择翻译语言

## 相关文件

### 修改的文件
- `electron-app/src/components/apps/VoiceNote/BottomToolbar.tsx`
  - 移除原文、复制、导出按钮的禁用条件
  - 更新按钮的 title 提示信息

- `electron-app/src/components/apps/VoiceNote/VoiceNote.tsx`
  - 新增 `onForceSave` prop
  - 修改 `handleCopyClick` 和 `handleExportClick`，添加强制保存逻辑

- `electron-app/src/App.tsx`
  - 新增 `forceSave` 函数
  - 增强 `copyText` 函数，包含 note_info 和 blocks
  - 传递 `onForceSave` prop 给 VoiceNote

### 相关 API
- `POST /api/records/{record_id}` - 更新记录（由 AutoSaveService 调用）
- `GET /api/records/{record_id}/export?format=html` - 导出富文本（复制功能使用）
- `GET /api/records/{record_id}/export?format=zip` - 导出 ZIP（导出功能使用）

## 注意事项

1. **自动保存机制**：
   - 复制和导出会触发强制立即保存
   - 保存使用 `AutoSaveService.saveToDatabase('manual', true)`
   - `immediate=true` 表示跳过 debounce，立即执行

2. **数据完整性**：
   - 确保 note_info 总是被保存到 metadata
   - 确保 blocks 总是被保存到 metadata
   - text 字段包含图片占位符 `[IMAGE: xxx]`

3. **兼容性**：
   - 纯文本复制：所有应用都支持
   - 富文本复制：需要浏览器支持 Clipboard API（Chrome/Edge/Firefox）

## 版本信息
- 更新版本：v1.2.x
- 更新类型：功能增强 + 用户体验改进

