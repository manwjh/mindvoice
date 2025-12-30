# BlockEditor ASR文本处理流程图

**说明**：`isDefiniteUtterance`（TypeScript中为`isDefiniteUtterance`，Python中为`is_definite_utterance`）是输入参数，其值来源于ASR服务：
- **值来源**：ASR服务返回的`utterances`数组中，`definite=True`表示一个确定的utterance（完整的语音识别单元）已完成
- **领域术语**：`utterance`是ASR领域的标准术语，表示一个完整的语音识别单元（可能是一个句子或段落）
- **传递路径**：ASR服务 → VoiceService → WebSocket → App.tsx → BlockEditor
- **用途**：
  - **条件判断**：`if (isDefiniteUtterance)`（决定是否固化当前Block并准备下一个Block）
  - **状态管理**：当`isDefiniteUtterance=true`时，当前Block的`isAsrWriting`会被设置为`false`，表示该Block已完成

## 核心流程：appendAsrText

```
┌─────────────────┐
│  收到ASR文本     │
│ (text, isDefiniteUtterance) │
└────────┬────────┘
         │
         ▼
    ┌──────────────┐
    │ 检查状态      │
    │!isAsrActive? │
    │(isAsrActive = │
    │ isRecording ||│
    │ isPaused)    │
    └────┬─────────┘
         │
    ┌────┴────┐
    │是       │否
    ▼         ▼
┌──────┐  ┌──────────────┐
│ 返回 │  │查找当前激活   │
└──────┘  │的Block        │
          │(通过ref查找)   │
          └──────┬─────────┘
                 │
         ┌───────┴───────┐
         │找不到?        │
         └───────┬───────┘
                 │
         ┌───────┴───────┐
         │是             │否
         ▼               │
    ┌──────────────┐    │
    │调用           │    │
    │ensureAsrWritingBlock│
    │创建或查找空Block│    │
    └──────┬───────┘    │
           │            │
           └──────┬─────┘
                  │
                  ▼
         ┌──────────────────┐
         │更新当前激活Block  │
         │content = newText │
         └──────┬───────────┘
                │
                ▼
         ┌──────────────┐
         │if(isDefiniteUtterance)│
         │条件判断      │
         └──────┬───────┘
                │
         ┌──────┴──────┐
         │否           │是
         │(false)      │(true)
         │             │
         │             ▼
         │      ┌──────────────┐
         │      │清除当前Block  │
         │      │isAsrWriting  │
         │      │= false       │
         │      └──────┬───────┘
         │             │
         │             ▼
         │      ┌──────────────┐
         │      │查找下一个空Block│
         │      │(在当前Block之后)│
         │      └──────┬───────┘
         │             │
         │      ┌───────┴───────┐
         │      │找到?          │
         │      └───────┬───────┘
         │              │
         │      ┌───────┴───────┐
         │      │否             │是
         │      ▼               ▼
         │  ┌──────────┐  ┌──────────┐
         │  │创建新Block│  │设置      │
         │  │并添加到末尾│  │isAsrWriting│
         │  │          │  │= true    │
         │  └────┬─────┘  └────┬─────┘
         │       │             │
         │       └──────┬──────┘
         │              │
         │              ▼
         │      ┌──────────────┐
         │      │更新ref指向   │
         │      │新目标Block   │
         │      └──────┬───────┘
         │             │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │通知父组件     │
         │onContentChange│
         │(content, isDefiniteUtterance)│
         └──────┬───────┘
                │
                ▼
            ┌──────┐
            │ 完成 │
            └──────┘
```

## 状态管理流程

```
┌──────────────────┐
│  组件初始化       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│初始化blocks和refs │
│asrWritingBlockIdRef│
│prevIsPausedRef    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│useEffect监听      │
│isAsrActive变化    │
│(isRecording ||    │
│ isPaused)        │
└────────┬─────────┘
         │
         ▼
    ┌──────────────┐
    │检查状态      │
    │isAsrActive?  │
    └────┬─────────┘
         │
    ┌────┴────┐
    │是       │否
    ▼         ▼
┌──────────┐ ┌──────────┐
│检测恢复  │ │清除所有   │
│状态?     │ │isAsrWriting│
│(从暂停   │ │标记并重置ref│
│恢复)    │ └────┬──────┘
└────┬─────┘     │
     │           │
┌────┴────┐      │
│是       │否    │
▼         ▼      │
┌──────────┐ ┌──────────┐
│清除所有  │ │查找或创建 │
│ASR标记   │ │ASR写入Block│
│创建新Block│ │(如果不存在)│
└────┬─────┘ └────┬─────┘
     │            │
     └──────┬─────┘
            │
            ▼
      (循环监听)
```

## 关键决策点

### 1. 查找当前激活的Block
```127:145:electron-app/src/components/BlockEditor.tsx
  const appendAsrText = useCallback(
    (newText: string, isDefiniteUtterance: boolean = false) => {
      if (!isAsrActive) return;

      setBlocks((prev) => {
        const updated = [...prev];
        
        // 查找当前激活的Block
        let currentIdx = asrWritingBlockIdRef.current
          ? updated.findIndex((b) => b.id === asrWritingBlockIdRef.current)
          : -1;
        
        // 如果找不到，确保有一个ASR写入block
        if (currentIdx < 0) {
          const { blocks: newBlocks, blockId, index } = ensureAsrWritingBlock(updated);
          updated.splice(0, updated.length, ...newBlocks);
          asrWritingBlockIdRef.current = blockId;
          currentIdx = index;
        }
```

### 2. 更新当前激活Block的内容
```147:151:electron-app/src/components/BlockEditor.tsx
        // 更新当前激活Block的内容
        updated[currentIdx] = {
          ...updated[currentIdx],
          content: newText,
        };
```

### 3. 确定utterance完成处理
```153:169:electron-app/src/components/BlockEditor.tsx
        // 如果是确定的utterance，固化当前行并准备下一个
        if (isDefiniteUtterance) {
          updated[currentIdx] = {
            ...updated[currentIdx],
            isAsrWriting: false,
          };

          // 寻找下一个空行并占位
          let nextEmptyIdx = updated.findIndex((b, i) => i > currentIdx && b.content === '');
          if (nextEmptyIdx < 0) {
            updated.push(createEmptyBlock(true));
            nextEmptyIdx = updated.length - 1;
          } else {
            updated[nextEmptyIdx] = { ...updated[nextEmptyIdx], isAsrWriting: true };
          }
          asrWritingBlockIdRef.current = updated[nextEmptyIdx].id;
        }
```

### 4. ensureAsrWritingBlock 辅助函数
```76:88:electron-app/src/components/BlockEditor.tsx
  // 查找或创建空行并设置为ASR写入状态
  const ensureAsrWritingBlock = useCallback((blocks: Block[]): { blocks: Block[]; blockId: string; index: number } => {
    const updated = [...blocks];
    let emptyIdx = updated.findIndex((b) => b.content === '');
    if (emptyIdx < 0) {
      const newBlock = createEmptyBlock(true);
      updated.push(newBlock);
      emptyIdx = updated.length - 1;
    } else {
      updated[emptyIdx] = { ...updated[emptyIdx], isAsrWriting: true };
    }
    return { blocks: updated, blockId: updated[emptyIdx].id, index: emptyIdx };
  }, []);
```

### 5. ASR状态变化时的处理（包括暂停恢复）
```90:125:electron-app/src/components/BlockEditor.tsx
  // 启动ASR时（包括暂停恢复）：确保有一个block处于激活状态
  useEffect(() => {
    if (isAsrActive) {
      // 检测从暂停恢复到继续：如果之前是暂停状态，现在变为录制状态，需要创建新block
      const wasPaused = prevIsPausedRef.current;
      const isResuming = wasPaused && isRecording && !isPaused;
      
      if (isResuming) {
        // 从暂停恢复：清除当前block引用，清除所有ASR标记，并创建新block
        asrWritingBlockIdRef.current = null;
        setBlocks((prev) => {
          // 清除所有block的ASR写入标记
          const cleared = prev.map((b) => ({ ...b, isAsrWriting: false }));
          // 强制创建新block（不重用空block）
          const newBlock = createEmptyBlock(true);
          const updated = [...cleared, newBlock];
          asrWritingBlockIdRef.current = newBlock.id;
          return updated;
        });
      } else if (!asrWritingBlockIdRef.current) {
        // 首次启动或没有激活的block时，创建新的
        setBlocks((prev) => {
          const { blocks: updated, blockId } = ensureAsrWritingBlock(prev);
          asrWritingBlockIdRef.current = blockId;
          return updated;
        });
      }
    } else {
      // 停止ASR时：清除所有ASR标记
      setBlocks((prev) => prev.map((b) => ({ ...b, isAsrWriting: false })));
      asrWritingBlockIdRef.current = null;
    }
    
    // 更新暂停状态记录
    prevIsPausedRef.current = isPaused;
  }, [isAsrActive, isRecording, isPaused, ensureAsrWritingBlock]);
```

## 重要说明

1. **状态检查**：使用 `isAsrActive = isRecording || isPaused` 来判断ASR是否激活，只有当ASR激活时才处理文本更新。

2. **Block更新策略**：只更新当前激活的Block，不会遍历所有Block。这提高了性能并简化了逻辑。

3. **暂停恢复处理**：当从暂停状态恢复到录制状态时，会清除所有ASR标记并创建新的Block，确保新的语音输入从新行开始。

4. **空Block重用**：`ensureAsrWritingBlock` 函数会优先查找现有的空Block，如果找不到才创建新的。

5. **回调通知**：每次更新后都会调用 `onContentChange` 回调，传递完整的文本内容和 `isDefiniteUtterance` 标志。
