# 数据永久化来源详解

本文档详细说明被保存到数据库的数据来源及其处理流程。

---

## 🎯 核心答案

**被用于永久化记录的数据来源：前端 BlockEditor 组件中的 `blocks` 状态（经过 `blocksToContent` 函数转换）**

---

## 📊 数据流向图

```
ASR 识别结果 (text_final)
    ↓
BlockEditor.appendAsrText()
    ↓
blocks 状态更新（Block 数组）
    ↓
blocksToContent() 转换
    ↓
onContentChange 回调
    ↓
App.tsx: setText(newText)
    ↓
text 状态（React State）
    ↓
用户点击"保存"按钮
    ↓
App.tsx: saveText() 函数
    ↓
构建 contentToSave（添加笔记信息）
    ↓
POST /api/text/save
    ↓
API Server: save_text_directly()
    ↓
SQLiteStorageProvider.save_record()
    ↓
SQLite 数据库 (history.db)
```

---

## 🔍 详细流程分析

### 1. ASR 识别数据到达前端

```typescript
// App.tsx: 267-306
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'text_final':
      // 确定的结果（完整 utterance）- 包含时间信息
      blockEditorRef.current?.appendAsrText(
        data.text || '',           // ⭐ 这是 ASR 识别的文本（已在后端累加）
        true,                      // is_definite_utterance = true
        {
          startTime: data.start_time,
          endTime: data.end_time
        }
      );
      break;
  }
};
```

**数据来源**：
- `data.text` - 来自 ASR Provider 识别并累加后的文本
- 例如："今天天气真好"

---

### 2. BlockEditor 接收并存储数据

```typescript
// BlockEditor.tsx: 176-227
const appendAsrText = useCallback(
  (newText: string, isDefiniteUtterance: boolean = false, timeInfo?: {...}) => {
    setBlocks((prev) => {
      const updated = [...prev];
      
      if (isDefiniteUtterance) {
        // 确定的 utterance：固化到当前 block
        updated[currentIdx] = {
          ...updated[currentIdx],
          content: newText,          // ⭐ 保存文本内容
          isAsrWriting: false,
          startTime: timeInfo?.startTime,
          endTime: timeInfo?.endTime,
        };
        
        // 创建新的空 block 用于下一个输入
        const nextBlock = createEmptyBlock(true);
        updated.push(nextBlock);
      }
      
      // ⭐ 触发回调，将 blocks 转换为纯文本
      const content = blocksToContent(updated);
      onContentChange?.(content, isDefiniteUtterance);
      
      return updated;
    });
  },
  [isAsrActive, ensureAsrWritingBlock, onContentChange]
);
```

**Block 数据结构**：
```typescript
interface Block {
  id: string;              // "block-1234567890-0.123"
  type: BlockType;         // "paragraph"
  content: string;         // "今天天气真好" ⭐ 这是实际的文本内容
  isAsrWriting?: boolean;  // false
  startTime?: number;      // 1000 (毫秒)
  endTime?: number;        // 2500 (毫秒)
}
```

**blocks 数组示例**：
```typescript
[
  {
    id: "block-noteinfo-123",
    type: "note-info",
    content: "",
    noteInfo: { title: "会议记录", ... }
  },
  {
    id: "block-456",
    type: "paragraph",
    content: "今天天气真好",  // ⭐ 第一句
    startTime: 1000,
    endTime: 2500
  },
  {
    id: "block-789",
    type: "paragraph",
    content: "明天呢",        // ⭐ 第二句
    startTime: 5000,
    endTime: 6200
  }
]
```

---

### 3. Blocks 转换为纯文本

```typescript
// BlockEditor.tsx: 102-105
function blocksToContent(blocks: Block[]): string {
  // ⭐ 排除 note-info 类型的 block
  // ⭐ 提取所有 block 的 content 字段
  // ⭐ 用换行符连接
  return blocks
    .filter(b => b.type !== 'note-info')
    .map((b) => b.content)
    .join('\n');
}
```

**转换示例**：
```typescript
// 输入（blocks 数组）
[
  { type: "note-info", content: "", noteInfo: {...} },
  { type: "paragraph", content: "今天天气真好" },
  { type: "paragraph", content: "明天呢" }
]

// 输出（纯文本）
"今天天气真好\n明天呢"
```

---

### 4. 文本传递到 App 组件

```typescript
// VoiceNote.tsx: 115-120
const handleTextChange = (newText: string) => {
  if (!isWorkSessionActive && newText.trim().length > 0) {
    onStartWork();
  }
  onTextChange(newText);  // ⭐ 调用 App.tsx 的 setText
};
```

```typescript
// BlockEditor.tsx: 220-221
const content = blocksToContent(updated);
onContentChange?.(content, isDefiniteUtterance);
```

```typescript
// VoiceNote.tsx: 269
<BlockEditor
  initialContent={text}
  onContentChange={handleTextChange}  // ⭐ 传递回调
  ...
/>
```

```typescript
// App.tsx: 636-643
<VoiceNote
  text={text}                  // ⭐ text 状态
  onTextChange={setText}       // ⭐ setText 更新 text 状态
  ...
/>
```

**数据流向**：
```
BlockEditor.appendAsrText()
    ↓
blocksToContent(blocks)  → "今天天气真好\n明天呢"
    ↓
onContentChange("今天天气真好\n明天呢")
    ↓
handleTextChange("今天天气真好\n明天呢")
    ↓
setText("今天天气真好\n明天呢")
    ↓
App.tsx 中的 text 状态 = "今天天气真好\n明天呢"
```

---

### 5. 用户触发保存操作

用户点击"保存"按钮时：

```typescript
// App.tsx: 410-471
const saveText = async (noteInfo?: any) => {
  // 1. 检查状态
  if (asrState !== 'idle') {
    setToast({ message: '只有在ASR处于空闲状态时才能保存', type: 'info' });
    return;
  }

  if (!text?.trim()) {
    setToast({ message: '没有内容可保存', type: 'info' });
    return;
  }

  try {
    // 2. 根据当前活动视图确定应用类型
    const appType = activeView === 'voice-chat' ? 'voice-chat' : 'voice-note';
    
    // 3. ⭐ 构建保存的文本内容
    let contentToSave = text.trim();  // ⭐ 来自 text 状态
    
    // 4. 如果有笔记信息，添加到前面
    if (noteInfo && appType === 'voice-note') {
      const infoHeader = [
        `📋 笔记信息`,
        noteInfo.title ? `📌 标题: ${noteInfo.title}` : '',
        noteInfo.type ? `🏷️ 类型: ${noteInfo.type}` : '',
        noteInfo.relatedPeople ? `👥 相关人员: ${noteInfo.relatedPeople}` : '',
        noteInfo.location ? `📍 地点: ${noteInfo.location}` : '',
        `⏰ 开始时间: ${noteInfo.startTime}`,
        noteInfo.endTime ? `⏱️ 结束时间: ${noteInfo.endTime}` : '',
        '',
        '---',
        '',
      ].filter(line => line).join('\n');
      
      contentToSave = infoHeader + contentToSave;
    }
    
    // 5. ⭐ 发送保存请求
    const response = await fetch(`${API_BASE_URL}/api/text/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        text: contentToSave,    // ⭐ 最终要保存的文本
        app_type: appType
      }),
    });
    
    // 6. 处理响应
    const data = await response.json();
    if (data.success) {
      setToast({ message: '已保存到历史记录', type: 'success' });
      localStorage.removeItem('voiceNoteDraft');
      setText('');  // 清空文本
    }
  } catch (e) {
    setToast({ message: '保存失败，请重试', type: 'error' });
  }
};
```

**实际保存的数据示例**：
```
📋 笔记信息
📌 标题: 今日工作记录
🏷️ 类型: 会议
👥 相关人员: 张三、李四
📍 地点: 会议室A
⏰ 开始时间: 2025-12-31 14:30:00
⏱️ 结束时间: 2025-12-31 15:45:00

---

今天天气真好
明天呢
```

---

### 6. API Server 接收保存请求

```python
# src/api/server.py: 463-495
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
        
        # ⭐ 保存文本记录
        metadata = {
            'language': voice_service.config.get('asr.language', 'zh-CN'),
            'provider': 'manual',          # 标记为手动输入
            'input_method': 'keyboard',    # 输入方式：键盘
            'app_type': request.app_type,  # 应用类型
            'created_at': voice_service._get_timestamp()
        }
        
        # ⭐ 调用存储提供商保存
        record_id = voice_service.storage_provider.save_record(
            request.text,    # ⭐ 这是要保存的文本内容
            metadata
        )
        logger.info(f"[API] 已直接保存文本记录: {record_id}")
        
        return SaveTextResponse(
            success=True,
            record_id=record_id,
            message="文本已保存"
        )
    except Exception as e:
        logger.error(f"直接保存文本失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

**接收的数据**：
```json
{
  "text": "📋 笔记信息\n📌 标题: 今日工作记录\n...\n今天天气真好\n明天呢",
  "app_type": "voice-note"
}
```

---

### 7. SQLite 存储提供商持久化数据

```python
# src/providers/storage/sqlite.py: 57-74
def save_record(self, text: str, metadata: Dict[str, Any]) -> str:
    """保存记录"""
    import uuid
    record_id = str(uuid.uuid4())
    
    # 从metadata中提取app_type，默认为'voice-note'
    app_type = metadata.get('app_type', 'voice-note')
    
    conn = self._get_connection()
    cursor = conn.cursor()
    
    # ⭐ 插入数据库
    cursor.execute('''
        INSERT INTO records (id, text, metadata, app_type)
        VALUES (?, ?, ?, ?)
    ''', (
        record_id, 
        text,                                      # ⭐ 文本内容
        json.dumps(metadata, ensure_ascii=False),  # ⭐ 元数据（JSON）
        app_type                                   # ⭐ 应用类型
    ))
    
    conn.commit()
    conn.close()
    
    return record_id
```

**数据库表结构**：
```sql
CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,              -- UUID
    text TEXT NOT NULL,               -- ⭐ 文本内容（这是核心数据）
    metadata TEXT,                    -- 元数据（JSON 字符串）
    app_type TEXT DEFAULT 'voice-note', -- 应用类型
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 创建时间
)
```

**插入的数据示例**：
```sql
INSERT INTO records (id, text, metadata, app_type) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  '📋 笔记信息
📌 标题: 今日工作记录
🏷️ 类型: 会议
👥 相关人员: 张三、李四
📍 地点: 会议室A
⏰ 开始时间: 2025-12-31 14:30:00
⏱️ 结束时间: 2025-12-31 15:45:00

---

今天天气真好
明天呢',
  '{
    "language": "zh-CN",
    "provider": "manual",
    "input_method": "keyboard",
    "app_type": "voice-note",
    "created_at": "2025-12-31T15:45:00"
  }',
  'voice-note'
);
```

---

## 🎯 数据来源总结

### 问：被用于永久化记录的数据，是哪个位置的数据？

### 答：

**直接来源**：`App.tsx` 中的 `text` 状态变量

**最终来源**：`BlockEditor.tsx` 中的 `blocks` 状态（经过 `blocksToContent` 函数转换）

**更深层来源**：ASR Provider 识别的文本（已经过后端智能累加处理）

---

## 📋 完整数据链路

```
1. 用户说话
   ↓
2. 录音器采集音频 → 音频数据块 (bytes)
   ↓
3. ASR Provider 识别 → "今天天气真好" (经后端累加)
   ↓
4. WebSocket 推送 → { type: "text_final", text: "今天天气真好", ... }
   ↓
5. App.tsx 接收 → blockEditorRef.current.appendAsrText("今天天气真好", ...)
   ↓
6. BlockEditor 更新 → blocks[i].content = "今天天气真好"
   ↓
7. blocksToContent() → "今天天气真好\n明天呢\n..."
   ↓
8. onContentChange() → setText("今天天气真好\n明天呢\n...")
   ↓
9. App.tsx 的 text 状态 = "今天天气真好\n明天呢\n..."  ⭐⭐⭐ 这是保存的数据
   ↓
10. 用户点击"保存" → saveText(noteInfo)
   ↓
11. 构建 contentToSave = noteInfo + text  ⭐⭐⭐ 添加笔记信息头部
   ↓
12. POST /api/text/save → { text: contentToSave, app_type: "voice-note" }
   ↓
13. API Server → voice_service.storage_provider.save_record(text, metadata)
   ↓
14. SQLite → INSERT INTO records (id, text, metadata, app_type) VALUES (...)
   ↓
15. 持久化到磁盘 → ~/.voice_assistant/history.db
```

---

## 🔍 关键数据节点

### 节点 1：ASR 识别结果
- **位置**：`VolcanoASRProvider._handle_recognition_result()`
- **数据**：`text_to_send`（已累加）
- **示例**：`"今天天气真好"`

### 节点 2：Block 内容
- **位置**：`BlockEditor.blocks[i].content`
- **数据**：单个 block 的文本内容
- **示例**：`"今天天气真好"`

### 节点 3：所有 Blocks 的内容
- **位置**：`BlockEditor.blocksToContent(blocks)`
- **数据**：所有 block 内容用换行符连接
- **示例**：`"今天天气真好\n明天呢"`

### 节点 4：App 文本状态 ⭐ **核心节点**
- **位置**：`App.tsx` 的 `text` 状态
- **数据**：当前编辑器的完整文本内容
- **示例**：`"今天天气真好\n明天呢"`

### 节点 5：待保存内容 ⭐ **最终节点**
- **位置**：`App.tsx.saveText()` 中的 `contentToSave`
- **数据**：添加了笔记信息头部的完整内容
- **示例**：
  ```
  📋 笔记信息
  📌 标题: 今日工作记录
  ...
  
  今天天气真好
  明天呢
  ```

---

## 💾 数据库存储位置

```
数据库路径：~/.voice_assistant/history.db
表名：records
关键字段：
  - id: UUID（主键）
  - text: 文本内容 ⭐ 这是被持久化的数据
  - metadata: 元数据（JSON）
  - app_type: 应用类型
  - created_at: 创建时间
```

---

## 🎨 数据处理特点

### 1. ASR 识别结果累加（后端）
- **位置**：`VolcanoASRProvider._handle_recognition_result()`
- **逻辑**：间隔 < 800ms 的 utterance 自动合并
- **示例**：
  ```
  utterance 1: "今天天气" (0-800ms)
  utterance 2: "真好" (850-1200ms)
  → 合并为："今天天气真好"
  ```

### 2. Block 结构化存储（前端）
- **位置**：`BlockEditor.blocks`
- **特点**：每个 utterance 一个 block，保留时间信息
- **优势**：可以显示时间线，支持结构化编辑

### 3. 纯文本转换（前端）
- **位置**：`BlockEditor.blocksToContent()`
- **逻辑**：提取所有 block 的 content，用换行符连接
- **作用**：转换为纯文本便于传输和存储

### 4. 笔记信息添加（前端）
- **位置**：`App.tsx.saveText()`
- **逻辑**：在文本前添加格式化的笔记信息头部
- **作用**：增强记录的结构化信息

---

## ❓ 常见问题

### Q1：为什么不直接保存 ASR 识别结果？
**A**：ASR 识别结果需要经过多层处理：
1. 后端累加修正（合并错误拆分的 utterance）
2. 前端 Block 结构化存储（保留时间信息）
3. 用户可能手动编辑（修改、删除、添加内容）
4. 添加笔记信息（标题、类型、人员、地点、时间）

直接保存 ASR 结果会丢失这些处理和增强。

### Q2：用户手动编辑的内容会保存吗？
**A**：会！用户在 BlockEditor 中的任何编辑都会触发 `onContentChange` 回调，更新 `text` 状态。保存时会保存最新的 `text` 状态。

```typescript
// BlockEditor.tsx: 294-303
const handleBlockChange = (blockId: string, newContent: string) => {
  setBlocks((prev) => {
    const updated = prev.map((b) =>
      b.id === blockId ? { ...b, content: newContent } : b
    );
    const content = blocksToContent(updated);
    onContentChange?.(content, false);  // ⭐ 触发回调，更新 text 状态
    return updated;
  });
};
```

### Q3：时间信息（startTime, endTime）会保存到数据库吗？
**A**：不会直接保存。时间信息保存在 Block 结构中，用于显示时间线指示器。但在转换为纯文本保存时，只保存文本内容和笔记信息头部，不包含时间戳。

如果需要保存时间信息，可以修改 `saveText` 函数，将 Block 的时间信息添加到 metadata 中。

### Q4：保存失败会怎样？
**A**：
1. 前端显示错误 Toast：`"保存失败，请重试"`
2. `text` 状态不会被清空，用户数据不会丢失
3. 草稿仍然保存在 `localStorage` 中（自动保存，3秒间隔）
4. 用户可以再次尝试保存

---

## 🎯 核心结论

**被用于永久化记录的数据是：**

1. **直接来源**：`App.tsx` 中的 `text` React 状态变量
2. **内容构成**：
   - 笔记信息头部（如果有）
   - 所有 Block 的文本内容（换行符连接）
3. **数据特点**：
   - 已经过后端 ASR 智能累加处理
   - 已经过前端 Block 结构化管理
   - 包含用户的手动编辑
   - 格式化为纯文本便于存储和检索
4. **最终存储**：SQLite 数据库的 `records` 表中的 `text` 字段

这个数据流程确保了保存的内容是经过多层处理和优化的最终结果，既保留了 ASR 识别的准确性，又包含了用户的编辑和结构化信息。

