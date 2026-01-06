import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { TimelineIndicator } from './TimelineIndicator';
import './BlockEditor.css';
import './Block.css';

export type BlockType = 'note-info' | 'paragraph' | 'h1' | 'h2' | 'h3' | 'bulleted-list' | 'numbered-list' | 'code' | 'image';

export interface NoteInfo {
  title: string;
  type: string;
  relatedPeople: string;
  location: string;
  startTime: string;
  endTime?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  isAsrWriting?: boolean;
  noteInfo?: NoteInfo;
  startTime?: number;
  endTime?: number;
  isSummary?: boolean;
  isBufferBlock?: boolean; // 标识底部缓冲块
  imageUrl?: string; // 图片 URL（相对路径或绝对路径）
  imageCaption?: string; // 图片说明文字
  // 翻译相关字段
  translations?: {
    [key: string]: {
      content: string;
      updatedAt: number;
    };
  };
  isTranslating?: boolean; // 翻译中状态
}

interface BlockEditorProps {
  initialBlocks?: Block[];
  onContentChange?: (content: string, isDefiniteUtterance?: boolean) => void;
  onNoteInfoChange?: (noteInfo: NoteInfo) => void;
  onBlockFocus?: (blockId: string) => void;
  onBlockBlur?: (blockId: string) => void;
  onBlocksChange?: (blocks: Block[]) => void;
  onBlockConfirmed?: () => void;
  isRecording?: boolean;
  selectedLanguage?: string; // 当前选择的语言
}

export interface BlockEditorHandle {
  appendAsrText: (text: string, isDefiniteUtterance?: boolean, timeInfo?: { startTime?: number; endTime?: number }) => void;
  setNoteInfoEndTime: () => void;
  getNoteInfo: () => NoteInfo | undefined;
  getBlocks: () => Block[];
  setBlocks: (newBlocks: Block[]) => void;
  appendSummaryBlock: (summary: string) => void;
  updateSummaryBlock: (summary: string) => void;
  finalizeSummaryBlock: () => void;
  removeSummaryBlock: () => void;
}


function createEmptyBlock(isAsrWriting: boolean = false): Block {
  return {
    id: `block-${Date.now()}-${Math.random()}`,
    type: 'paragraph',
    content: '',
    isAsrWriting,
  };
}

function createNoteInfoBlock(): Block {
  return {
    id: `block-noteinfo-${Date.now()}`,
    type: 'note-info',
    content: '',
    isAsrWriting: false,
    noteInfo: {
      title: '',
      type: '',
      relatedPeople: '',
      location: '',
      startTime: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    },
  };
}

function createBlocksFromContent(content: string): Block[] {
  const noteInfoBlock = createNoteInfoBlock();
  if (!content) return [noteInfoBlock, createEmptyBlock()];
  
  const timestamp = Date.now();
  const contentBlocks: Block[] = [];
  
  // 处理小结块的特殊标记
  const summaryRegex = /\[SUMMARY_BLOCK_START\]([\s\S]*?)\[SUMMARY_BLOCK_END\]/g;
  let lastIndex = 0;
  let match;
  let blockIndex = 0;
  
  while ((match = summaryRegex.exec(content)) !== null) {
    // 处理小结块之前的普通内容
    if (match.index > lastIndex) {
      const beforeContent = content.substring(lastIndex, match.index);
      const lines = beforeContent.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        contentBlocks.push({
          id: `block-${timestamp}-${blockIndex++}-${Math.random()}`,
          type: 'paragraph' as BlockType,
          content: line,
          isAsrWriting: false,
        });
      });
    }
    
    // 创建小结块（保持完整，不拆分）
    const summaryContent = match[1];
    contentBlocks.push({
      id: `block-${timestamp}-${blockIndex++}-${Math.random()}`,
      type: 'paragraph' as BlockType,
      content: summaryContent,
      isAsrWriting: false,
      isSummary: true,
    });
    
    lastIndex = summaryRegex.lastIndex;
  }
  
  // 处理剩余的普通内容
  if (lastIndex < content.length) {
    const remainingContent = content.substring(lastIndex);
    const lines = remainingContent.split('\n').filter(line => line.trim());
    lines.forEach(line => {
      contentBlocks.push({
        id: `block-${timestamp}-${blockIndex++}-${Math.random()}`,
        type: 'paragraph' as BlockType,
        content: line,
        isAsrWriting: false,
      });
    });
  }
  
  // 如果没有小结块，使用原来的简单拆分逻辑
  if (contentBlocks.length === 0) {
    content.split('\n').filter(line => line.trim()).forEach((line, i) => {
      contentBlocks.push({
        id: `block-${timestamp}-${i}-${Math.random()}`,
        type: 'paragraph' as BlockType,
        content: line,
        isAsrWriting: false,
      });
    });
  }
  
  return [noteInfoBlock, ...contentBlocks];
}

function blocksToContent(blocks: Block[]): string {
  // 排除 note-info 和 buffer block
  // 小结block使用特殊分隔符，防止被拆分
  // 同时过滤掉内容为空的 block（避免产生空行）
  return blocks
    .filter(b => b.type !== 'note-info' && !b.isBufferBlock && (b.isSummary || b.content.trim()))
    .map((b) => {
      if (b.isSummary) {
        // 小结块使用特殊标记包裹，保持完整性
        return `[SUMMARY_BLOCK_START]${b.content}[SUMMARY_BLOCK_END]`;
      }
      return b.content;
    })
    .join('\n');
}

export const BlockEditor = forwardRef<BlockEditorHandle, BlockEditorProps>(({
  initialBlocks,
  onContentChange,
  onNoteInfoChange,
  onBlockFocus,
  onBlockBlur,
  onBlocksChange,
  onBlockConfirmed,
  isRecording = false,
  selectedLanguage = 'original', // 新增：默认显示原文
}, ref) => {
  const [blocks, setBlocks] = useState<Block[]>(() => {
    // 初始化时优先使用initialBlocks，否则创建空blocks
    if (initialBlocks && initialBlocks.length > 0) {
      return initialBlocks;
    }
    return createBlocksFromContent('');
  });
  const asrWritingBlockIdRef = useRef<string | null>(null);
  const isAsrActive = isRecording;
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const lastBlockCountRef = useRef<number>(blocks.length);
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isComposingRef = useRef<boolean>(false);
  const previousConfirmedIdsRef = useRef<Set<string>>(new Set());

  /**
   * 获取要显示的内容（原文或译文）
   */
  /**
   * 获取 block 的显示内容（仅在原文模式或无翻译时使用）
   */
  const getBlockDisplayContent = useCallback((block: Block): string => {
    return block.content;
  }, []);
  
  /**
   * 获取 block 的翻译内容
   */
  const getBlockTranslation = useCallback((block: Block): { content: string; error?: boolean; message?: string; isTranslating?: boolean } | null => {
    if (selectedLanguage === 'original' || !selectedLanguage) {
      return null;
    }
    
    const translation = block.translations?.[selectedLanguage];
    if (translation) {
      // 翻译中状态
      if ((translation as any).isTranslating) {
        return {
          content: '🔄 翻译中...',
          isTranslating: true
        };
      }
      // 翻译错误
      if (translation.error) {
        return {
          content: '',
          error: true,
          message: translation.message || '翻译失败'
        };
      }
      // 翻译成功
      if (translation.content) {
        return {
          content: translation.content
        };
      }
    }
    
    return null;
  }, [selectedLanguage]);

  /**
   * 确保底部始终有一个缓冲块
   * 缓冲块用于提供视觉空间，使得当前输入的block不会紧贴底部
   * @param blocks - 当前的blocks数组
   * @returns 确保有缓冲块的新数组
   */
  const ensureBottomBufferBlock = useCallback((blocks: Block[]): Block[] => {
    const updated = [...blocks];
    
    // 检查最后一个block是否是缓冲块
    const lastBlock = updated[updated.length - 1];
    const isLastBlockBuffer = lastBlock && lastBlock.isBufferBlock;
    
    // 如果最后一个block不是缓冲块，添加一个
    if (!isLastBlockBuffer) {
      const bufferBlock = createEmptyBlock(false);
      bufferBlock.isBufferBlock = true;
      updated.push(bufferBlock);
    }
    
    return updated;
  }, []);

  /**
   * 初始化blocks
   * 策略：
   * 1. 首次渲染时初始化
   * 2. 当initialBlocks显式更新时重新初始化（如从历史记录恢复、创建新笔记）
   * 3. 注意：不应该仅因为isAsrActive变化而重置blocks，否则会丢失ASR过程中的内容
   */
  const isFirstRenderRef = useRef(true);
  const prevInitialBlocksRef = useRef<any[] | undefined>(initialBlocks);
  
  useEffect(() => {
    // 检查是否是首次渲染，或者initialBlocks发生了变化
    const isFirstRender = isFirstRenderRef.current;
    const initialBlocksChanged = prevInitialBlocksRef.current !== initialBlocks;
    
    // 只在以下情况重新初始化：
    // 1. 首次渲染
    // 2. initialBlocks改变（如从历史记录恢复、创建新笔记）
    if (isFirstRender || initialBlocksChanged) {
      if (isFirstRender) {
        isFirstRenderRef.current = false;
      }
      
      // 更新prev引用
      prevInitialBlocksRef.current = initialBlocks;
      
      if (initialBlocks && initialBlocks.length > 0) {
        const blocksWithBuffer = ensureBottomBufferBlock(initialBlocks);
        setBlocks(blocksWithBuffer);
      } else {
        const newBlocks = ensureBottomBufferBlock(createBlocksFromContent(''));
        setBlocks(newBlocks);
      }
      asrWritingBlockIdRef.current = null;
    }
  }, [initialBlocks, ensureBottomBufferBlock]);

  /**
   * 监听 blocks 变化，通知父组件
   * 用于触发自动保存（仅用户手动编辑时触发）
   * 
   * 注意：ASR 写入时不触发此回调，因为 ASR 有专门的 onContentChange 回调
   * 
   * 节流策略：30秒内最多触发一次
   * 理由：
   * 1. 每次保存都是完整快照，不会丢失数据
   * 2. 有多重保障：block失焦、定期保存60秒、切换视图等
   * 3. 极端情况（崩溃）最多丢失30秒输入
   * 4. 大幅减少不必要的触发和资源消耗
   */
  const lastManualSaveTriggerTimeRef = useRef<number>(0);
  const MANUAL_SAVE_THROTTLE = 30000; // 30秒节流

  useEffect(() => {
    if (onBlocksChange) {
      // 检查是否有正在被 ASR 写入的 block
      const hasAsrWritingBlock = blocks.some(b => b.isAsrWriting);
      
      // 只有在没有 ASR 写入时才触发回调（避免 ASR 过程中频繁触发）
      if (!hasAsrWritingBlock) {
        const now = Date.now();
        const timeSinceLastTrigger = now - lastManualSaveTriggerTimeRef.current;
        
        // 节流：30秒内只触发一次
        if (timeSinceLastTrigger >= MANUAL_SAVE_THROTTLE) {
          console.log('[BlockEditor] blocks 变化 (用户编辑)，触发 onBlocksChange', {
            blockCount: blocks.length,
            hasContent: blocks.some(b => b.type !== 'note-info' && !b.isBufferBlock && b.content.trim()),
            timeSinceLastTrigger: `${Math.floor(timeSinceLastTrigger / 1000)}s`,
            timestamp: new Date().toLocaleTimeString(),
          });
          lastManualSaveTriggerTimeRef.current = now;
          onBlocksChange(blocks);
        } else {
          const remainingTime = MANUAL_SAVE_THROTTLE - timeSinceLastTrigger;
          console.log(`[BlockEditor] blocks 变化 (用户编辑)，节流跳过 (还需等待 ${Math.ceil(remainingTime / 1000)}s)`);
        }
      } else {
        console.log('[BlockEditor] blocks 变化 (ASR 写入)，跳过 onBlocksChange');
      }
    }
  }, [blocks, onBlocksChange]);

  useEffect(() => {
    if (!onBlockConfirmed) return;
    
    const currentConfirmedBlocks = blocks.filter(b => 
      b.type === 'paragraph' &&
      !b.isAsrWriting &&
      !b.isBufferBlock &&
      b.content.trim()
    );
    
    const newConfirmedBlocks = currentConfirmedBlocks.filter(b =>
      !previousConfirmedIdsRef.current.has(b.id)
    );
    
    if (newConfirmedBlocks.length > 0) {
      console.log('[BlockEditor] 新确定的 blocks:', newConfirmedBlocks.length, {
        ids: newConfirmedBlocks.map(b => b.id),
        timestamp: new Date().toLocaleTimeString(),
      });
      onBlockConfirmed();
      
      previousConfirmedIdsRef.current = new Set(currentConfirmedBlocks.map(b => b.id));
    }
  }, [blocks, onBlockConfirmed]);

  /**
   * 确保存在一个用于ASR写入的block
   * 策略：
   * 1. 寻找最后一个空block（跳过note-info和缓冲块）
   * 2. 如果找到，标记为ASR写入块
   * 3. 如果没有，在倒数第二个位置（缓冲块之前）插入新的ASR写入块
   * @param blocks - 当前的blocks数组
   * @returns 包含blocks数组、ASR写入块的ID和索引
   */
  const ensureAsrWritingBlock = useCallback((blocks: Block[]): { blocks: Block[]; blockId: string; index: number } => {
    const updated = [...blocks];
    updated.forEach((b) => b.isAsrWriting = false);
    
    // 找到最后一个空block（不包括note-info和缓冲块）
    let emptyBlockIdx = -1;
    for (let i = updated.length - 1; i >= 0; i--) {
      const block = updated[i];
      // 跳过 note-info 和 bufferBlock
      if (block.type === 'note-info' || block.isBufferBlock) {
        continue;
      }
      // 跳过图片 block（图片 block 的 content 为空，但不应该被当作空 block）
      if (block.type === 'image') {
        continue;
      }
      // 找到第一个可用的空block（内容为空的普通 block）
      if (!block.content || block.content.trim() === '') {
        emptyBlockIdx = i;
        break;
      }
    }
    
    // 如果找到空block，使用它
    if (emptyBlockIdx >= 0) {
      updated[emptyBlockIdx] = {
        ...updated[emptyBlockIdx],
        isAsrWriting: true,
        content: '',
      };
      return { blocks: updated, blockId: updated[emptyBlockIdx].id, index: emptyBlockIdx };
    }
    
    // 否则，在倒数第二个位置插入新的ASR写入块（保持缓冲块在最后）
    const newBlock = createEmptyBlock(true);
    updated.splice(updated.length - 1, 0, newBlock);
    const asrIdx = updated.length - 2;
    return { blocks: updated, blockId: updated[asrIdx].id, index: asrIdx };
  }, []);

  useEffect(() => {
    if (isAsrActive) {
      if (!asrWritingBlockIdRef.current) {
        setBlocks((prev) => {
          const { blocks: updated, blockId } = ensureAsrWritingBlock(prev);
          asrWritingBlockIdRef.current = blockId;
          return ensureBottomBufferBlock(updated);
        });
      }
    } else {
      setBlocks((prev) => {
        const updated = prev.map((b) => ({ ...b, isAsrWriting: false }));
        return ensureBottomBufferBlock(updated);
      });
      asrWritingBlockIdRef.current = null;
    }
  }, [isAsrActive, ensureAsrWritingBlock, ensureBottomBufferBlock]);

  /**
   * 追加ASR识别的文本到编辑器
   * @param newText - ASR识别的文本
   * @param isDefiniteUtterance - 是否是确定的完整utterance（true时会创建新block）
   * @param timeInfo - 时间信息（开始和结束时间）
   */
  const appendAsrText = useCallback(
    (newText: string, isDefiniteUtterance: boolean = false, timeInfo?: { startTime?: number; endTime?: number }) => {
      if (!isAsrActive) return;

      setBlocks((prev) => {
        const updated = [...prev];
        
        let currentIdx = asrWritingBlockIdRef.current
          ? updated.findIndex((b) => b.id === asrWritingBlockIdRef.current)
          : -1;
        
        if (currentIdx < 0) {
          const { blocks: newBlocks, blockId, index } = ensureAsrWritingBlock(updated);
          updated.splice(0, updated.length, ...newBlocks);
          asrWritingBlockIdRef.current = blockId;
          currentIdx = index;
        }

        if (isDefiniteUtterance) {
          updated[currentIdx] = {
            ...updated[currentIdx],
            content: newText,
            isAsrWriting: false,
            startTime: timeInfo?.startTime,
            endTime: timeInfo?.endTime,
          };
          
          // 在倒数第二个位置插入新的ASR写入块（保持缓冲块在最后）
          const nextBlock = createEmptyBlock(true);
          updated.splice(updated.length - 1, 0, nextBlock);
          asrWritingBlockIdRef.current = nextBlock.id;
        } else {
          updated[currentIdx] = {
            ...updated[currentIdx],
            content: newText,
          };
        }
        
        const content = blocksToContent(updated);
        onContentChange?.(content, isDefiniteUtterance);
        
        return ensureBottomBufferBlock(updated);
      });
    },
    [isAsrActive, ensureAsrWritingBlock, onContentChange, ensureBottomBufferBlock]
  );

  const setNoteInfoEndTime = useCallback(() => {
    const endTime = new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    
    setBlocks((prev) => {
      const updated = prev.map((b) => {
        if (b.type === 'note-info' && b.noteInfo) {
          const newNoteInfo = { ...b.noteInfo, endTime };
          onNoteInfoChange?.(newNoteInfo);
          return { ...b, noteInfo: newNoteInfo };
        }
        return b;
      });
      return updated;
    });
    
    // 返回更新后的 endTime，用于同步获取
    return endTime;
  }, [onNoteInfoChange]);

  const getNoteInfo = useCallback((): NoteInfo | undefined => {
    const noteInfoBlock = blocks.find(b => b.type === 'note-info');
    return noteInfoBlock?.noteInfo;
  }, [blocks]);

  const getBlocks = useCallback((): Block[] => {
    return blocks;
  }, [blocks]);

  const setBlocksFromExternal = useCallback((newBlocks: Block[]) => {
    setBlocks(newBlocks);
  }, []);

  const appendSummaryBlock = useCallback((summary: string) => {
    setBlocks((prev) => {
      const updated = [...prev];
      
      // 移除所有空的 ASR 写入块
      const filtered = updated.filter(b => !(b.isAsrWriting && !b.content.trim()));
      
      // 移除末尾的缓冲块（稍后会重新添加）
      if (filtered.length > 0 && filtered[filtered.length - 1].isBufferBlock) {
        filtered.pop();
      }
      
      // 创建一个包含标题和内容的小结块（使用换行符分隔标题和内容）
      const summaryBlock: Block = {
        id: `block-summary-${Date.now()}`,
        type: 'paragraph',
        content: summary ? `📊 会议小结\n\n${summary}` : '📊 会议小结\n\n生成中...',
        isAsrWriting: false,
        isSummary: true,
      };
      
      // 添加小结块
      filtered.push(summaryBlock);
      
      // 确保底部有缓冲块
      const newBlocks = ensureBottomBufferBlock(filtered);
      
      // 延迟调用 onContentChange 到下一个事件循环，避免在渲染期间更新父组件
      setTimeout(() => {
        const content = blocksToContent(newBlocks);
        onContentChange?.(content, false);
      }, 0);
      
      return newBlocks;
    });
  }, [onContentChange, ensureBottomBufferBlock]);

  const updateSummaryBlock = useCallback((summary: string) => {
    setBlocks((prev) => {
      const updated = [...prev];
      
      // 找到小结块并更新内容
      const summaryBlockIndex = updated.findIndex(b => b.isSummary);
      if (summaryBlockIndex >= 0) {
        updated[summaryBlockIndex] = {
          ...updated[summaryBlockIndex],
          content: `📊 会议小结\n\n${summary}`,
        };
        
        // 注意：流式更新时不调用 onContentChange，避免触发外部更新导致block重建
        // 只在生成完成时（finalizeSummaryBlock）才更新外部内容
      }
      
      return updated;
    });
  }, []); // 移除 onContentChange 依赖

  const finalizeSummaryBlock = useCallback(() => {
    setBlocks((prev) => {
      // 延迟调用 onContentChange 到下一个事件循环，避免在渲染期间更新父组件
      setTimeout(() => {
        const content = blocksToContent(prev);
        onContentChange?.(content, false);
      }, 0);
      return prev;
    });
  }, [onContentChange]);

  const removeSummaryBlock = useCallback(() => {
    setBlocks((prev) => {
      const updated = prev.filter(b => !b.isSummary);
      
      const newBlocks = ensureBottomBufferBlock(updated);
      
      // 延迟调用 onContentChange 到下一个事件循环，避免在渲染期间更新父组件
      setTimeout(() => {
        const content = blocksToContent(newBlocks);
        onContentChange?.(content, false);
      }, 0);
      
      return newBlocks;
    });
  }, [onContentChange, ensureBottomBufferBlock]);

  useImperativeHandle(ref, () => ({ 
    appendAsrText,
    setNoteInfoEndTime,
    getNoteInfo,
    getBlocks,
    setBlocks: setBlocksFromExternal,
    appendSummaryBlock,
    updateSummaryBlock,
    finalizeSummaryBlock,
    removeSummaryBlock,
  }));

  const getTagName = (type: BlockType) => {
    switch (type) {
      case 'h1': return 'h1';
      case 'h2': return 'h2';
      case 'h3': return 'h3';
      case 'code': return 'pre';
      default: return 'p';
    }
  };

  const getClassName = (block: Block) => {
    const base = 'block-content';
    const typeClass = `block-${block.type}`;
    const asrWritingClass = block.isAsrWriting ? 'block-asr-writing' : '';
    return `${base} ${typeClass} ${asrWritingClass}`.trim();
  };

  const getPlaceholder = (type: BlockType) => {
    switch (type) {
      case 'note-info': return '点击编辑笔记信息...';
      case 'h1': return '标题 1';
      case 'h2': return '标题 2';
      case 'h3': return '标题 3';
      case 'bulleted-list': return '列表项';
      case 'numbered-list': return '列表项';
      case 'code': return '代码';
      default: return '';
    }
  };

  // 处理block内容变化
  const handleBlockChange = (blockId: string, newContent: string) => {
    setBlocks((prev) => {
      const updated = prev.map((b) =>
        b.id === blockId ? { ...b, content: newContent } : b
      );
      const newBlocks = ensureBottomBufferBlock(updated);
      
      // 延迟调用 onContentChange 到下一个事件循环，避免在渲染期间更新父组件
      setTimeout(() => {
        const content = blocksToContent(newBlocks);
        onContentChange?.(content, false);
      }, 0);
      
      return newBlocks;
    });
  };

  /**
   * 保存光标位置
   * 用于在内容更新后恢复光标位置，避免光标跳动
   * @param element - contentEditable元素
   * @returns 光标在文本中的偏移量，如果失败返回null
   */
  const saveCursorPosition = (element: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const caretOffset = preCaretRange.toString().length;
    
    return caretOffset;
  };

  /**
   * 恢复光标位置
   * @param element - contentEditable元素
   * @param offset - 光标在文本中的偏移量
   */
  const restoreCursorPosition = (element: HTMLElement, offset: number) => {
    const selection = window.getSelection();
    if (!selection) return;
    
    const range = document.createRange();
    let currentOffset = 0;
    let found = false;

    const traverseNodes = (node: Node): boolean => {
      if (node.nodeType === Node.TEXT_NODE) {
        const textLength = node.textContent?.length || 0;
        if (currentOffset + textLength >= offset) {
          range.setStart(node, offset - currentOffset);
          range.collapse(true);
          found = true;
          return true;
        }
        currentOffset += textLength;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          if (traverseNodes(node.childNodes[i])) return true;
        }
      }
      return false;
    };

    traverseNodes(element);
    
    if (found) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  // 处理noteInfo变化
  const handleNoteInfoChange = (blockId: string, field: keyof NoteInfo, value: string) => {
    setBlocks((prev) => {
      const updated = prev.map((b) => {
        if (b.id === blockId && b.type === 'note-info' && b.noteInfo) {
          const newNoteInfo = { ...b.noteInfo, [field]: value };
          onNoteInfoChange?.(newNoteInfo);
          return { ...b, noteInfo: newNoteInfo };
        }
        return b;
      });
      return ensureBottomBufferBlock(updated);
    });
  };

  // 生成noteInfo的文本描述
  const generateNoteInfoDescription = (noteInfo?: NoteInfo) => {
    if (!noteInfo) return '';
    const parts: string[] = [];
    
    if (noteInfo.title) parts.push(`📌 ${noteInfo.title}`);
    if (noteInfo.type) parts.push(`🏷️ ${noteInfo.type}`);
    if (noteInfo.relatedPeople) parts.push(`👥 ${noteInfo.relatedPeople}`);
    if (noteInfo.location) parts.push(`📍 ${noteInfo.location}`);
    parts.push(`⏰ ${noteInfo.startTime}`);
    if (noteInfo.endTime) parts.push(`⏱️ ${noteInfo.endTime}`);
    
    return parts.join(' · ');
  };

  // 处理删除block
  const handleDeleteBlock = useCallback((blockId: string) => {
    setBlocks((prev) => {
      // 过滤掉要删除的block
      const updated = prev.filter(b => b.id !== blockId);
      
      // 确保至少有 note-info block
      if (updated.length === 0 || !updated.find(b => b.type === 'note-info')) {
        return prev; // 不允许删除所有block
      }
      
      const newBlocks = ensureBottomBufferBlock(updated);
      
      // 延迟调用 onContentChange 到下一个事件循环，避免在渲染期间更新父组件
      setTimeout(() => {
        const content = blocksToContent(newBlocks);
        onContentChange?.(content, false);
      }, 0);
      
      return newBlocks;
    });
  }, [onContentChange, ensureBottomBufferBlock]);

  /**
   * 检查光标是否在元素的开头
   * 用于判断是否应该触发退格合并操作或向上跳转
   * @param element - contentEditable元素
   * @returns 如果光标在开头返回true
   */
  const isCursorAtStart = (element: HTMLElement): boolean => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    const range = selection.getRangeAt(0);
    
    // 检查光标是否在元素内部
    if (!element.contains(range.startContainer) && !element.contains(range.endContainer)) {
      return false;
    }
    
    // 创建范围从元素开头到光标位置
    const testRange = document.createRange();
    try {
      testRange.setStart(element, 0);
      testRange.setEnd(range.endContainer, range.endOffset);
      // 如果从开头到光标位置的文本长度为0，说明光标在开头
      return testRange.toString().length === 0;
    } catch (e) {
      // 如果设置范围失败，使用备用方法
      const startRange = range.cloneRange();
      startRange.selectNodeContents(element);
      startRange.setEnd(range.endContainer, range.endOffset);
      return startRange.toString().length === 0;
    }
  };

  /**
   * 检查光标是否在元素的末尾
   * 用于判断是否应该触发向下跳转
   * @param element - contentEditable元素
   * @returns 如果光标在末尾返回true
   */
  const isCursorAtEnd = (element: HTMLElement): boolean => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    const range = selection.getRangeAt(0);
    
    // 检查光标是否在元素内部
    if (!element.contains(range.startContainer) && !element.contains(range.endContainer)) {
      return false;
    }
    
    // 获取元素的完整文本长度
    const fullText = element.textContent || '';
    const fullLength = fullText.length;
    
    // 获取光标位置
    const testRange = document.createRange();
    try {
      testRange.setStart(element, 0);
      testRange.setEnd(range.endContainer, range.endOffset);
      const caretOffset = testRange.toString().length;
      
      // 如果光标位置等于完整文本长度，说明光标在末尾
      return caretOffset === fullLength;
    } catch (e) {
      // 如果设置范围失败，使用备用方法
      const endRange = range.cloneRange();
      endRange.selectNodeContents(element);
      endRange.setStart(range.endContainer, range.endOffset);
      return endRange.toString().length === 0;
    }
  };

  /**
   * 处理向上箭头键：在光标位于block开头时，跳转到上一个block的末尾
   * @param blockId - 当前block的ID
   * @param element - contentEditable元素
   * @returns 如果已处理返回true（阻止默认行为），否则返回false
   */
  const handleArrowUp = useCallback((blockId: string, element: HTMLElement) => {
    // 检查光标是否在开头
    if (!isCursorAtStart(element)) {
      return false; // 光标不在开头，让浏览器默认处理（在当前block内移动）
    }

    // 查找上一个可编辑的block
    const currentIndex = blocks.findIndex(b => b.id === blockId);
    if (currentIndex < 0) return false;

    // 向上查找第一个可编辑的block（跳过note-info、bufferBlock、ASR正在写入的block、图片block）
    let prevIndex = currentIndex - 1;
    while (prevIndex >= 0) {
      const prevBlock = blocks[prevIndex];
      if (prevBlock.type !== 'note-info' && 
          !prevBlock.isBufferBlock && 
          !prevBlock.isAsrWriting &&
          prevBlock.type !== 'image') {
        // 找到可编辑的block，将光标移动到其末尾
        requestAnimationFrame(() => {
          setTimeout(() => {
            const prevBlockElement = blockRefs.current.get(prevBlock.id)?.querySelector('[contenteditable="true"]') as HTMLElement;
            if (prevBlockElement) {
              prevBlockElement.focus();
              
              // 将光标定位到末尾
              const selection = window.getSelection();
              if (selection) {
                const range = document.createRange();
                range.selectNodeContents(prevBlockElement);
                range.collapse(false); // 折叠到末尾
                selection.removeAllRanges();
                selection.addRange(range);
              }
            }
          }, 0);
        });
        return true; // 已处理，阻止默认行为
      }
      prevIndex--;
    }

    return false; // 没有找到上一个可编辑block
  }, [blocks]);

  /**
   * 处理向下箭头键：在光标位于block末尾时，跳转到下一个block的开头
   * @param blockId - 当前block的ID
   * @param element - contentEditable元素
   * @returns 如果已处理返回true（阻止默认行为），否则返回false
   */
  const handleArrowDown = useCallback((blockId: string, element: HTMLElement) => {
    // 检查光标是否在末尾
    if (!isCursorAtEnd(element)) {
      return false; // 光标不在末尾，让浏览器默认处理（在当前block内移动）
    }

    // 查找下一个可编辑的block
    const currentIndex = blocks.findIndex(b => b.id === blockId);
    if (currentIndex < 0) return false;

    // 向下查找第一个可编辑的block（跳过note-info、bufferBlock、ASR正在写入的block、图片block）
    let nextIndex = currentIndex + 1;
    while (nextIndex < blocks.length) {
      const nextBlock = blocks[nextIndex];
      if (nextBlock.type !== 'note-info' && 
          !nextBlock.isBufferBlock && 
          !nextBlock.isAsrWriting &&
          nextBlock.type !== 'image') {
        // 找到可编辑的block，将光标移动到其开头
        requestAnimationFrame(() => {
          setTimeout(() => {
            const nextBlockElement = blockRefs.current.get(nextBlock.id)?.querySelector('[contenteditable="true"]') as HTMLElement;
            if (nextBlockElement) {
              nextBlockElement.focus();
              
              // 将光标定位到开头
              const selection = window.getSelection();
              if (selection) {
                const range = document.createRange();
                range.selectNodeContents(nextBlockElement);
                range.collapse(true); // 折叠到开头
                selection.removeAllRanges();
                selection.addRange(range);
              }
            }
          }, 0);
        });
        return true; // 已处理，阻止默认行为
      }
      nextIndex++;
    }

    return false; // 没有找到下一个可编辑block
  }, [blocks]);

  /**
   * 处理退格键在block开头时的合并操作
   * 当用户在block开头按退格键时，将当前block与上一个block合并
   * @param blockId - 当前block的ID
   * @param element - contentEditable元素
   * @returns 如果已处理返回true（阻止默认行为），否则返回false
   */
  const handleBackspaceAtStart = useCallback((blockId: string, element: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    // 检查光标是否在开头
    if (!isCursorAtStart(element)) {
      return false; // 光标不在开头，让浏览器默认处理
    }

    setBlocks((prev) => {
      const updated = [...prev];
      const currentBlockIndex = updated.findIndex(b => b.id === blockId);
      
      if (currentBlockIndex < 0) return prev;
      
      const currentBlock = updated[currentBlockIndex];
      
      // 如果当前block是note-info、缓冲块或ASR正在写入的block，不允许合并
      if (currentBlock.type === 'note-info' || 
          currentBlock.isBufferBlock || 
          currentBlock.isAsrWriting) {
        return prev;
      }
      
      // 找到上一个可合并的block（跳过缓冲块）
      let prevBlockIndex = currentBlockIndex - 1;
      while (prevBlockIndex >= 0 && updated[prevBlockIndex].isBufferBlock) {
        prevBlockIndex--;
      }
      
      // 如果没有上一个block，或者上一个block是note-info，不能合并
      if (prevBlockIndex < 0 || updated[prevBlockIndex].type === 'note-info') {
        return prev;
      }
      
      const prevBlock = updated[prevBlockIndex];
      
      // 如果上一个block是ASR正在写入的，不能合并
      if (prevBlock.isAsrWriting) {
        return prev;
      }
      
      // 记录原prevBlock内容的长度，用于定位光标到接合点
      const prevContentLength = prevBlock.content.length;
      
      // 合并内容：将当前block的内容追加到上一个block
      const mergedContent = prevBlock.content + currentBlock.content;
      
      // 更新上一个block的内容
      updated[prevBlockIndex] = {
        ...prevBlock,
        content: mergedContent,
        // 如果当前block或上一个block是小结块，保持小结标记
        isSummary: prevBlock.isSummary || currentBlock.isSummary,
      };
      
      // 删除当前block
      updated.splice(currentBlockIndex, 1);
      
      const newBlocks = ensureBottomBufferBlock(updated);
      
      // 延迟调用 onContentChange 到下一个事件循环
      setTimeout(() => {
        const content = blocksToContent(newBlocks);
        onContentChange?.(content, false);
      }, 0);
      
      // 等待DOM更新后，将光标移动到两个内容的接合点（原prevBlock内容的末尾）
      requestAnimationFrame(() => {
        setTimeout(() => {
          const prevBlockElement = blockRefs.current.get(prevBlock.id)?.querySelector('[contenteditable="true"]') as HTMLElement;
          if (prevBlockElement) {
            // 聚焦到上一个block，使其进入编辑状态
            prevBlockElement.focus();
            
            // 将光标定位到接合点（原prevBlock内容的末尾位置）
            const newSelection = window.getSelection();
            if (newSelection) {
              // 使用restoreCursorPosition将光标定位到指定偏移量
              restoreCursorPosition(prevBlockElement, prevContentLength);
            }
          }
        }, 0);
      });
      
      return newBlocks;
    });
    
    return true; // 已处理，阻止默认行为
  }, [onContentChange, ensureBottomBufferBlock]);

  /**
   * 处理回车键：在光标位置截断当前block并插入新block
   * @param blockId - 当前block的ID
   * @param element - contentEditable元素
   */
  const handleEnterKey = useCallback((blockId: string, element: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    
    // 获取光标位置
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const caretOffset = preCaretRange.toString().length;
    
    // 获取当前block的完整文本内容
    const fullText = element.textContent || '';
    
    // 截断：光标前的内容保留在当前block，光标后的内容移到新block
    const beforeText = fullText.substring(0, caretOffset);
    const afterText = fullText.substring(caretOffset);
    
    setBlocks((prev) => {
      const updated = [...prev];
      const currentBlockIndex = updated.findIndex(b => b.id === blockId);
      
      if (currentBlockIndex < 0) return prev;
      
      const currentBlock = updated[currentBlockIndex];
      
      // 如果当前block是note-info、缓冲块或ASR正在写入的block，不允许截断
      if (currentBlock.type === 'note-info' || 
          currentBlock.isBufferBlock || 
          currentBlock.isAsrWriting) {
        return prev;
      }
      
      // 更新当前block的内容为光标前的内容
      updated[currentBlockIndex] = {
        ...currentBlock,
        content: beforeText,
      };
      
      // 创建新block，包含光标后的内容
      const newBlock: Block = {
        id: `block-${Date.now()}-${Math.random()}`,
        type: currentBlock.type, // 保持相同的block类型
        content: afterText,
        isAsrWriting: false,
        isSummary: currentBlock.isSummary, // 保持小结标记
      };
      
      // 在当前位置之后插入新block（如果后面有缓冲块，则插入在缓冲块之前）
      const insertIndex = currentBlockIndex + 1;
      // 检查插入位置是否是缓冲块
      if (insertIndex < updated.length && updated[insertIndex].isBufferBlock) {
        // 在缓冲块之前插入
        updated.splice(insertIndex, 0, newBlock);
      } else {
        // 直接插入
        updated.splice(insertIndex, 0, newBlock);
      }
      
      const newBlocks = ensureBottomBufferBlock(updated);
      
      // 延迟调用 onContentChange 到下一个事件循环
      setTimeout(() => {
        const content = blocksToContent(newBlocks);
        onContentChange?.(content, false);
      }, 0);
      
      // 等待DOM更新后，将光标移动到新block的开头
      // 使用 requestAnimationFrame 确保DOM已更新
      requestAnimationFrame(() => {
        setTimeout(() => {
          const newBlockElement = blockRefs.current.get(newBlock.id)?.querySelector('[contenteditable="true"]') as HTMLElement;
          if (newBlockElement) {
            const newSelection = window.getSelection();
            if (newSelection) {
              const newRange = document.createRange();
              newRange.selectNodeContents(newBlockElement);
              newRange.collapse(true); // 折叠到开头
              newSelection.removeAllRanges();
              newSelection.addRange(newRange);
              // 聚焦到新block
              newBlockElement.focus();
            }
          }
        }, 0);
      });
      
      return newBlocks;
    });
  }, [onContentChange, ensureBottomBufferBlock]);

  // 处理note-info编辑区域外的点击
  // 检测是否有用户正在编辑的block
  const isUserEditing = useCallback(() => {
    // 检查是否有contentEditable元素获得焦点
    const activeElement = document.activeElement;
    if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
      return true;
    }
    
    // 检查是否在编辑note-info
    if (editingBlockId) {
      return true;
    }
    
    return false;
  }, [editingBlockId]);

  /**
   * 当新block出现或ASR正在写入block时，自动滚动以确保内容完整可见
   * 策略：
   * - 新增block时：将block定位到视口中心偏上，而不是贴底
   * - 内容更新时：平滑地保持block底部可见，避免换行造成的跳动
   * - 用户正在编辑时：不自动滚动，避免干扰用户操作
   */
  useEffect(() => {
    if (!isAsrActive || isUserEditing()) {
      lastBlockCountRef.current = blocks.length;
      return;
    }

    const currentBlockCount = blocks.length;
    const previousBlockCount = lastBlockCountRef.current;
    
    // 找到ASR正在写入的block
    const asrWritingBlock = blocks.find(b => b.isAsrWriting);
    
    if (asrWritingBlock) {
      const blockElement = blockRefs.current.get(asrWritingBlock.id);
      
      if (blockElement) {
        // 检测是否是新增block
        const isNewBlock = currentBlockCount > previousBlockCount;
        
        if (isNewBlock) {
          // 新增block时，将block定位到视口中心偏上的位置，而不是贴底
          blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          // 内容更新时，使用温和的滚动策略，避免换行跳动
          const rect = blockElement.getBoundingClientRect();
          const scrollContainer = blockElement.closest('.block-editor');
          
          if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const relativeBottom = rect.bottom - containerRect.top;
            const visibleHeight = containerRect.height;
            
            // 只有当block底部即将超出容器时才滚动
            // 使用更大的阈值（150px）来减少频繁滚动
            const threshold = 150;
            if (relativeBottom > visibleHeight - threshold) {
              // 使用渐进式滚动，只滚动超出的部分，而不是将整个block居中
              const scrollAmount = relativeBottom - (visibleHeight - threshold);
              scrollContainer.scrollBy({ 
                top: scrollAmount, 
                behavior: 'smooth' 
              });
            }
          }
        }
      }
    }
    
    lastBlockCountRef.current = currentBlockCount;
  }, [blocks, isAsrActive, isUserEditing]);

  // 处理note-info编辑区域外的点击
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editingBlockId) {
        const target = e.target as HTMLElement;
        // 检查点击是否在note-info-edit区域外
        if (!target.closest('.block-note-info-edit') && !target.closest('.block-note-info')) {
          setEditingBlockId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingBlockId]);

  // 追踪当前聚焦的 block ID
  const focusedBlockIdRef = useRef<string | null>(null);

  // 拖拽相关状态
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);

  /**
   * 判断 block 是否可拖拽
   * note-info、缓冲块、ASR 正在写入的 block 不可拖拽
   */
  const isBlockDraggable = useCallback((block: Block): boolean => {
    return block.type !== 'note-info' && 
           !block.isBufferBlock && 
           !block.isAsrWriting;
  }, []);

  /**
   * 处理拖拽开始
   */
  const handleDragStart = useCallback((e: React.DragEvent, blockId: string) => {
    setDraggingBlockId(blockId);
    e.dataTransfer.effectAllowed = 'move';
    // 设置拖拽数据
    e.dataTransfer.setData('text/plain', blockId);
    
    // 设置拖拽图像为半透明
    if (e.currentTarget instanceof HTMLElement) {
      const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
      dragImage.style.opacity = '0.5';
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    }
  }, []);

  /**
   * 处理拖拽经过
   */
  const handleDragOver = useCallback((e: React.DragEvent, blockId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggingBlockId && draggingBlockId !== blockId) {
      setDragOverBlockId(blockId);
    }
  }, [draggingBlockId]);

  /**
   * 处理拖拽离开
   */
  const handleDragLeave = useCallback(() => {
    setDragOverBlockId(null);
  }, []);

  /**
   * 处理放置
   */
  const handleDrop = useCallback((e: React.DragEvent, targetBlockId: string) => {
    e.preventDefault();
    
    if (!draggingBlockId || draggingBlockId === targetBlockId) {
      setDraggingBlockId(null);
      setDragOverBlockId(null);
      return;
    }

    setBlocks((prev) => {
      const updated = [...prev];
      
      // 找到拖拽的 block 和目标 block 的索引
      const dragIndex = updated.findIndex(b => b.id === draggingBlockId);
      const dropIndex = updated.findIndex(b => b.id === targetBlockId);
      
      if (dragIndex < 0 || dropIndex < 0) return prev;
      
      // 移除拖拽的 block
      const [draggedBlock] = updated.splice(dragIndex, 1);
      
      // 插入到目标位置
      // 如果向下拖拽，目标索引需要调整
      const newDropIndex = dragIndex < dropIndex ? dropIndex : dropIndex;
      updated.splice(newDropIndex, 0, draggedBlock);
      
      const newBlocks = ensureBottomBufferBlock(updated);
      
      // 延迟调用 onContentChange 到下一个事件循环
      setTimeout(() => {
        const content = blocksToContent(newBlocks);
        onContentChange?.(content, false);
      }, 0);
      
      return newBlocks;
    });

    setDraggingBlockId(null);
    setDragOverBlockId(null);
  }, [draggingBlockId, ensureBottomBufferBlock, onContentChange]);

  /**
   * 处理拖拽结束
   */
  const handleDragEnd = useCallback(() => {
    setDraggingBlockId(null);
    setDragOverBlockId(null);
  }, []);

  // 处理粘贴图片
  const handlePasteImage = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // 检查是否有图片
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault(); // 阻止默认的粘贴行为
        
        const file = item.getAsFile();
        if (!file) continue;

        try {
          // 读取图片为 Base64
          const reader = new FileReader();
          reader.onload = async (event) => {
            const base64Data = event.target?.result as string;
            
            // 调用后端 API 保存图片
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';
            const response = await fetch(`${API_BASE_URL}/api/images/save`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                image_data: base64Data,
              }),
            });

            const result = await response.json();
            
            if (result.success && result.image_url) {
              // 创建图片 block
              const newImageBlock: Block = {
                id: `block-${Date.now()}-${Math.random()}`,
                type: 'image',
                content: '', // 图片块的 content 为空
                imageUrl: result.image_url,
              };

              // 在当前光标所在的 block 之后插入图片块
              setBlocks((prev) => {
                const updated = [...prev];
                let insertIndex = updated.length;
                
                // 如果有聚焦的 block，在其后面插入
                const focusedBlockId = focusedBlockIdRef.current;
                if (focusedBlockId) {
                  const focusedIndex = updated.findIndex(b => b.id === focusedBlockId);
                  if (focusedIndex !== -1) {
                    insertIndex = focusedIndex + 1;
                  }
                }
                
                // 如果没有找到聚焦的 block，在最后一个非缓冲块之后插入
                if (insertIndex === updated.length && updated[updated.length - 1]?.isBufferBlock) {
                  insertIndex = updated.length - 1;
                }
                
                updated.splice(insertIndex, 0, newImageBlock);
                const result = ensureBottomBufferBlock(updated);
                
                // 延迟调用 onContentChange 到下一个事件循环
                setTimeout(() => {
                  const content = blocksToContent(result);
                  onContentChange?.(content, false);
                }, 0);
                
                return result;
              });

              console.log('[BlockEditor] 图片已插入:', result.image_url);
            } else {
              console.error('[BlockEditor] 保存图片失败:', result.message);
              alert(`保存图片失败: ${result.message}`);
            }
          };

          reader.readAsDataURL(file);
        } catch (error) {
          console.error('[BlockEditor] 处理图片粘贴失败:', error);
          alert('处理图片失败，请重试');
        }
        
        return; // 只处理第一张图片
      }
    }
  }, [ensureBottomBufferBlock, onContentChange]);

  const renderBlock = (block: Block) => {
    // 缓冲块特殊处理：不显示，只用于占位
    // 使用更大的高度，确保当前输入的block有足够的视觉空间
    if (block.isBufferBlock) {
      return (
        <div 
          key={block.id} 
          className="block block-buffer"
          style={{ minHeight: '60vh', background: 'transparent' }}
        >
        </div>
      );
    }

    // note-info类型的特殊渲染
    if (block.type === 'note-info') {
      const isEditing = editingBlockId === block.id;
      const description = generateNoteInfoDescription(block.noteInfo);

      return (
        <div 
          key={block.id} 
          className="block block-note-info-container"
          ref={(el) => {
            if (el) blockRefs.current.set(block.id, el);
            else blockRefs.current.delete(block.id);
          }}
        >
          <div className="block-handle" style={{ cursor: 'not-allowed', opacity: 0.5 }}>
            <span className="handle-icon">📋</span>
          </div>
          {!isEditing ? (
            <div
              className="block-content block-note-info"
              onClick={() => setEditingBlockId(block.id)}
              data-placeholder={getPlaceholder(block.type)}
            >
              {description}
            </div>
          ) : (
            <div 
              className="block-content block-note-info-edit"
              onKeyDown={(e) => {
                // 处理ESC键：退出编辑模式
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingBlockId(null);
                }
              }}
            >
              <input
                type="text"
                className="note-info-input"
                placeholder="📌 标题"
                value={block.noteInfo?.title || ''}
                onChange={(e) => handleNoteInfoChange(block.id, 'title', e.target.value)}
                autoFocus
              />
              <input
                type="text"
                className="note-info-input"
                placeholder="🏷️ 类型"
                value={block.noteInfo?.type || ''}
                onChange={(e) => handleNoteInfoChange(block.id, 'type', e.target.value)}
              />
              <input
                type="text"
                className="note-info-input"
                placeholder="👥 相关人员"
                value={block.noteInfo?.relatedPeople || ''}
                onChange={(e) => handleNoteInfoChange(block.id, 'relatedPeople', e.target.value)}
              />
              <input
                type="text"
                className="note-info-input"
                placeholder="📍 地点"
                value={block.noteInfo?.location || ''}
                onChange={(e) => handleNoteInfoChange(block.id, 'location', e.target.value)}
              />
              <div className="note-info-time">⏰ {block.noteInfo?.startTime}</div>
              {block.noteInfo?.endTime && (
                <div className="note-info-time">⏱️ {block.noteInfo.endTime}</div>
              )}
            </div>
          )}
          <button 
            className="block-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteBlock(block.id);
            }}
            title="删除此块"
          >
            🗑️
          </button>
        </div>
      );
    }

    // 图片类型的特殊渲染
    if (block.type === 'image') {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';
      const imageUrl = block.imageUrl?.startsWith('http') 
        ? block.imageUrl 
        : `${API_BASE_URL}/api/${block.imageUrl}`;
      
      const isDraggable = isBlockDraggable(block);
      const isDragging = draggingBlockId === block.id;
      const isDragOver = dragOverBlockId === block.id;

      return (
        <div 
          key={block.id} 
          className={`block block-image-container ${isDragging ? 'block-dragging' : ''} ${isDragOver ? 'block-drag-over' : ''}`}
          draggable={isDraggable}
          onDragStart={(e) => isDraggable && handleDragStart(e, block.id)}
          onDragOver={(e) => isDraggable && handleDragOver(e, block.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => isDraggable && handleDrop(e, block.id)}
          onDragEnd={handleDragEnd}
          ref={(el) => {
            if (el) blockRefs.current.set(block.id, el);
            else blockRefs.current.delete(block.id);
          }}
        >
          <div 
            className="block-handle" 
            style={{ cursor: isDraggable ? 'grab' : 'not-allowed' }}
          >
            <span className="handle-icon">🖼️</span>
          </div>
          <div className="block-image-wrapper">
            <img 
              src={imageUrl} 
              alt={block.imageCaption || '图片'} 
              className="block-image"
              onError={(e) => {
                console.error('[BlockEditor] 图片加载失败:', imageUrl);
                e.currentTarget.style.display = 'none';
                const errorDiv = document.createElement('div');
                errorDiv.className = 'block-image-error';
                errorDiv.textContent = '图片加载失败';
                e.currentTarget.parentElement?.appendChild(errorDiv);
              }}
            />
            {block.imageCaption && (
              <div className="block-image-caption">{block.imageCaption}</div>
            )}
          </div>
          <button 
            className="block-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteBlock(block.id);
            }}
            title="删除此块"
          >
            🗑️
          </button>
        </div>
      );
    }

    // 普通block渲染
    const Tag = getTagName(block.type) as 'p' | 'h1' | 'h2' | 'h3' | 'pre';
    const canEdit = !block.isAsrWriting; // ASR正在写入的block不能编辑
    const hasTimeInfo = block.startTime !== undefined && block.endTime !== undefined;
    const isDraggable = isBlockDraggable(block);
    const isDragging = draggingBlockId === block.id;
    const isDragOver = dragOverBlockId === block.id;

    return (
      <div 
        key={block.id} 
        className={`block ${block.isAsrWriting ? 'block-asr-writing-container' : ''} ${block.isSummary ? 'block-summary-container' : ''} ${isDragging ? 'block-dragging' : ''} ${isDragOver ? 'block-drag-over' : ''}`}
        draggable={isDraggable}
        onDragStart={(e) => isDraggable && handleDragStart(e, block.id)}
        onDragOver={(e) => isDraggable && handleDragOver(e, block.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => isDraggable && handleDrop(e, block.id)}
        onDragEnd={handleDragEnd}
        ref={(el) => {
          if (el) blockRefs.current.set(block.id, el);
          else blockRefs.current.delete(block.id);
        }}
      >
        <div 
          className="block-handle"
          style={{ cursor: isDraggable ? 'grab' : 'not-allowed' }}
        >
          <span className="handle-icon">⋮⋮</span>
        </div>
        <div className="block-content-wrapper">
          <Tag
            className={getClassName(block)}
            contentEditable={canEdit}
            suppressContentEditableWarning
            onFocus={() => {
              // 记录当前聚焦的 block ID
              focusedBlockIdRef.current = block.id;
              // 通知父组件
              onBlockFocus?.(block.id);
            }}
            onBlur={() => {
              // 清除聚焦状态
              focusedBlockIdRef.current = null;
              // 通知父组件
              onBlockBlur?.(block.id);
            }}
            onKeyDown={(e) => {
              // 如果正在进行中文输入，不处理特殊按键
              if (isComposingRef.current) {
                return;
              }
              
              // 处理ESC键：退出编辑状态（失去焦点）
              if (e.key === 'Escape') {
                e.preventDefault();
                const element = e.currentTarget;
                element.blur(); // 失去焦点，退出编辑状态
                return;
              }
              
              // 处理向上箭头键：在光标位于block开头时，跳转到上一个block
              if (e.key === 'ArrowUp' && canEdit) {
                const element = e.currentTarget;
                const handled = handleArrowUp(block.id, element);
                if (handled) {
                  e.preventDefault();
                }
                return;
              }
              
              // 处理向下箭头键：在光标位于block末尾时，跳转到下一个block
              if (e.key === 'ArrowDown' && canEdit) {
                const element = e.currentTarget;
                const handled = handleArrowDown(block.id, element);
                if (handled) {
                  e.preventDefault();
                }
                return;
              }
              
              // 处理回车键
              if (e.key === 'Enter' && !e.shiftKey && canEdit) {
                e.preventDefault();
                const element = e.currentTarget;
                handleEnterKey(block.id, element);
                return;
              }
              
              // 处理退格键：在光标位于block开头时，与上一个block合并
              if (e.key === 'Backspace' && canEdit) {
                const element = e.currentTarget;
                const handled = handleBackspaceAtStart(block.id, element);
                if (handled) {
                  e.preventDefault();
                }
                return;
              }
            }}
            onCompositionStart={() => {
              // 中文输入开始
              isComposingRef.current = true;
            }}
            onCompositionUpdate={() => {
              // 中文输入进行中
              isComposingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              // 中文输入结束，现在可以安全更新状态
              isComposingRef.current = false;
              if (canEdit) {
                const element = e.currentTarget;
                const cursorPos = saveCursorPosition(element);
                const newContent = element.textContent || '';
                handleBlockChange(block.id, newContent);
                
                // 在下一个渲染周期恢复光标位置
                setTimeout(() => {
                  if (cursorPos !== null) {
                    restoreCursorPosition(element, cursorPos);
                  }
                }, 0);
              }
            }}
            onInput={(e) => {
              // 如果正在进行中文输入，不更新状态，等待 compositionEnd
              if (isComposingRef.current) {
                return;
              }
              
              if (canEdit) {
                const element = e.currentTarget;
                const cursorPos = saveCursorPosition(element);
                const newContent = element.textContent || '';
                handleBlockChange(block.id, newContent);
                
                // 在下一个渲染周期恢复光标位置
                setTimeout(() => {
                  if (cursorPos !== null) {
                    restoreCursorPosition(element, cursorPos);
                  }
                }, 0);
              }
            }}
            onPaste={(e) => {
              if (!canEdit) {
                e.preventDefault();
              } else {
                // 处理粘贴，保持纯文本
                e.preventDefault();
                const text = e.clipboardData.getData('text/plain');
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                  const range = selection.getRangeAt(0);
                  range.deleteContents();
                  range.insertNode(document.createTextNode(text));
                  range.collapse(false);
                  
                  // 触发 input 事件
                  const element = e.currentTarget;
                  const event = new Event('input', { bubbles: true });
                  element.dispatchEvent(event);
                }
              }
            }}
            data-placeholder={block.isAsrWriting ? '>' : getPlaceholder(block.type)}
            spellCheck={false}
            suppressHydrationWarning
            style={block.isAsrWriting ? { cursor: 'not-allowed', opacity: 0.7 } : undefined}
            dangerouslySetInnerHTML={{ __html: getBlockDisplayContent(block) }}
          />
          {/* 翻译内容显示 - 在原文和时间戳之间 */}
          {(() => {
            const translation = getBlockTranslation(block);
            if (translation) {
              if (translation.error) {
                // 显示翻译错误
                return (
                  <div className="block-translation block-translation-error">
                    ⚠️ {translation.message}
                  </div>
                );
              } else if (translation.content) {
                // 显示翻译内容
                return (
                  <div 
                    className="block-translation"
                    dangerouslySetInnerHTML={{ __html: translation.content }}
                  />
                );
              }
            }
            return null;
          })()}
          {/* 时间戳始终显示在最底部 */}
          {hasTimeInfo && (
            <TimelineIndicator startTime={block.startTime} endTime={block.endTime} />
          )}
        </div>
        <button 
          className="block-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteBlock(block.id);
          }}
          title="删除此块"
        >
          🗑️
        </button>
      </div>
    );
  };

  return (
    <div 
      className="block-editor"
      onPaste={handlePasteImage}
    >
      <div className="block-editor-content">
        {blocks.map(renderBlock)}
      </div>
    </div>
  );
});
