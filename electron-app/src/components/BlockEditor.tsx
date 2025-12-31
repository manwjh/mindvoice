import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import './BlockEditor.css';
import './Block.css';

export type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bulleted-list' | 'numbered-list' | 'code';

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  isAsrWriting?: boolean;
}

interface BlockEditorProps {
  initialContent?: string;
  onContentChange?: (content: string, isDefiniteUtterance?: boolean) => void;
  isRecording?: boolean;
  isPaused?: boolean;
}

export interface BlockEditorHandle {
  /**
   * 追加ASR识别的文本到编辑器
   * @param text - 识别的文本内容
   * @param isDefiniteUtterance - 是否为确定的utterance（当ASR服务返回definite=true时，此值为true）
   *                               表示一个完整的、确定的语音识别单元已完成
   */
  appendAsrText: (text: string, isDefiniteUtterance?: boolean) => void;
}

/**
 * 查找两段文本的重叠长度
 * 检测prevText的结尾是否与newText的开头重叠
 * @param prevText - 前一段文本
 * @param newText - 新的文本
 * @returns 重叠的字符数
 */
function findOverlapLength(prevText: string, newText: string): number {
  const minLen = Math.min(prevText.length, newText.length);
  const maxCheck = Math.min(minLen, 20); // 最多检查20个字符，避免性能问题
  
  // 从长到短尝试匹配
  for (let len = maxCheck; len >= 2; len--) {
    if (prevText.endsWith(newText.substring(0, len))) {
      return len;
    }
  }
  return 0;
}

function createEmptyBlock(isAsrWriting: boolean = false): Block {
  return {
    id: `block-${Date.now()}-${Math.random()}`,
    type: 'paragraph',
    content: '',
    isAsrWriting,
  };
}

function createBlocksFromContent(content: string): Block[] {
  if (!content) return [createEmptyBlock()];
  const timestamp = Date.now();
  return content.split('\n').map((line, i) => ({
    id: `block-${timestamp}-${i}-${Math.random()}`,
    type: 'paragraph' as BlockType,
    content: line,
    isAsrWriting: false,
  }));
}

function blocksToContent(blocks: Block[]): string {
  return blocks.map((b) => b.content).join('\n');
}

export const BlockEditor = forwardRef<BlockEditorHandle, BlockEditorProps>(({
  initialContent = '',
  onContentChange,
  isRecording = false,
  isPaused = false,
}, ref) => {
  const [blocks, setBlocks] = useState<Block[]>(() => createBlocksFromContent(initialContent));
  const asrWritingBlockIdRef = useRef<string | null>(null);
  const prevIsPausedRef = useRef<boolean>(false);
  const isAsrActive = isRecording || isPaused;
  
  // 注：utterance合并逻辑已移至后端ASR Provider，前端只需简单处理

  // 当 initialContent 从外部改变时（如加载历史记录），同步更新 blocks
  // 但只在 ASR 未激活时更新，避免覆盖正在进行的 ASR 输入
  useEffect(() => {
    if (!isAsrActive) {
      const newBlocks = createBlocksFromContent(initialContent);
      setBlocks(newBlocks);
      asrWritingBlockIdRef.current = null;
    }
  }, [initialContent, isAsrActive]);

  // 查找或创建空行并设置为ASR写入状态
  const ensureAsrWritingBlock = useCallback((blocks: Block[]): { blocks: Block[]; blockId: string; index: number } => {
    const updated = [...blocks];
    // 先清除所有 block 的 ASR 写入标记，确保只有一个 block 处于 ASR 写入状态
    updated.forEach((b) => {
      b.isAsrWriting = false;
    });
    
    // 优先重用已有的空 block（如果存在）
    const emptyBlockIdx = updated.findIndex((b) => !b.content || b.content.trim() === '');
    
    if (emptyBlockIdx >= 0) {
      // 重用已有的空 block
      updated[emptyBlockIdx] = {
        ...updated[emptyBlockIdx],
        isAsrWriting: true,
        content: '', // 确保内容为空
      };
      return { blocks: updated, blockId: updated[emptyBlockIdx].id, index: emptyBlockIdx };
    } else {
      // 没有空 block，在末尾创建一个新的
      const newBlock = createEmptyBlock(true);
      updated.push(newBlock);
      const emptyIdx = updated.length - 1;
      return { blocks: updated, blockId: updated[emptyIdx].id, index: emptyIdx };
    }
  }, []);

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

        // 🎯 基于标点和重叠检测的智能去重与合并逻辑
        if (isDefiniteUtterance) {
          // 清空当前正在写入的block（因为中间结果会被definite覆盖）
          updated[currentIdx] = {
            ...updated[currentIdx],
            content: '',
            isAsrWriting: false,
          };
          
          // 查找上一个已固化的block
          const prevBlockIdx = currentIdx > 0 ? currentIdx - 1 : -1;
          
          if (prevBlockIdx >= 0) {
            const prevBlock = updated[prevBlockIdx];
            const prevContent = prevBlock.content.trim();
            
            if (prevContent.length > 0) {
              // 直接检查最后2个字符是否包含标点（中文或英文）
              const last2Chars = prevContent.slice(-2);
              const hasPunctuationInLast2 = /[。！？；：，、.!?;:,]/.test(last2Chars);
              
              if (!hasPunctuationInLast2) {
                // 最后几个字符无标点，可能是ASR分段不准确，检查重叠
                const overlapLength = findOverlapLength(prevContent, newText);
                
                if (overlapLength >= 2) {
                  // 检测到重叠，去重并合并到上一个block
                  const deduplicatedText = newText.substring(overlapLength);
                  updated[prevBlockIdx] = {
                    ...updated[prevBlockIdx],
                    content: prevContent + deduplicatedText,
                  };
                  console.log(`[BlockEditor] ✂️ 最后2字符无标点，检测到${overlapLength}字符重叠，合并: '${newText.substring(0, overlapLength)}'`);
                  
                  // 当前block保持为空的写入block
                  updated[currentIdx] = {
                    ...updated[currentIdx],
                    content: '',
                    isAsrWriting: true,
                  };
                } else {
                  // 没有重叠，将新文本放入当前block并固化
                  updated[currentIdx] = {
                    ...updated[currentIdx],
                    content: newText,
                    isAsrWriting: false,
                  };
                  console.log(`[BlockEditor] 📄 最后2字符无标点且无重叠，放入当前block`);
                  
                  // 创建新的空block用于下一个输入
                  const nextBlock = createEmptyBlock(true);
                  updated.push(nextBlock);
                  asrWritingBlockIdRef.current = nextBlock.id;
                }
              } else {
                // 最后几个字符包含标点，说明是完整的utterance边界，不检查重叠
                updated[currentIdx] = {
                  ...updated[currentIdx],
                  content: newText,
                  isAsrWriting: false,
                };
                console.log(`[BlockEditor] ✅ 上一个block最后2字符有标点，独立句子`);
                
                // 创建新的空block用于下一个输入
                const nextBlock = createEmptyBlock(true);
                updated.push(nextBlock);
                asrWritingBlockIdRef.current = nextBlock.id;
              }
            } else {
              // 上一个block为空，新文本是独立句子
              updated[currentIdx] = {
                ...updated[currentIdx],
                content: newText,
                isAsrWriting: false,
              };
              console.log(`[BlockEditor] ✅ 上一个block为空，独立句子`);
              
              // 创建新的空block用于下一个输入
              const nextBlock = createEmptyBlock(true);
              updated.push(nextBlock);
              asrWritingBlockIdRef.current = nextBlock.id;
            }
          } else {
            // 没有上一个block，这是第一个definite
            updated[currentIdx] = {
              ...updated[currentIdx],
              content: newText,
              isAsrWriting: false,
            };
            console.log(`[BlockEditor] 📝 第一个definite`);
            
            // 创建新的空block用于下一个输入
            const nextBlock = createEmptyBlock(true);
            updated.push(nextBlock);
            asrWritingBlockIdRef.current = nextBlock.id;
          }
        } else {
          // 中间结果，继续更新当前block
          updated[currentIdx] = {
            ...updated[currentIdx],
            content: newText,
          };
        }
        
        // 触发回调
        const content = blocksToContent(updated);
        onContentChange?.(content, isDefiniteUtterance);
        
        return updated;
      });
    },
    [isAsrActive, ensureAsrWritingBlock, onContentChange]
  );

  useImperativeHandle(ref, () => ({ appendAsrText }));

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
      case 'h1': return '标题 1';
      case 'h2': return '标题 2';
      case 'h3': return '标题 3';
      case 'bulleted-list': return '列表项';
      case 'numbered-list': return '列表项';
      case 'code': return '代码';
      default: return '';
    }
  };

  const renderBlock = (block: Block) => {
    const Tag = getTagName(block.type) as 'p' | 'h1' | 'h2' | 'h3' | 'pre';

    return (
      <div key={block.id} className={`block ${block.isAsrWriting ? 'block-asr-writing-container' : ''}`}>
        <div className="block-handle">
          <span className="handle-icon">⋮⋮</span>
        </div>
        <Tag
          className={getClassName(block)}
          contentEditable={false}
          suppressContentEditableWarning
          onPaste={(e) => {
            e.preventDefault();
          }}
          data-placeholder={block.isAsrWriting ? '>' : getPlaceholder(block.type)}
          spellCheck={false}
          suppressHydrationWarning
          style={block.isAsrWriting ? { cursor: 'not-allowed', opacity: 0.7 } : undefined}
        >
          {block.content}
        </Tag>
      </div>
    );
  };

  return (
    <div className="block-editor">
      <div className="block-editor-content">
        {blocks.map(renderBlock)}
      </div>
    </div>
  );
});
