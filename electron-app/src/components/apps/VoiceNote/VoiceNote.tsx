import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BlockEditor, NoteInfo, Block } from './BlockEditor';
import { WelcomeScreen } from './WelcomeScreen';
import { BottomToolbar } from './BottomToolbar';
import { CopyFormatDialog, CopyFormat } from './CopyFormatDialog';
import { AppLayout } from '../../shared/AppLayout';
import { StatusIndicator } from '../../shared/StatusIndicator';
import { AppButton, ButtonGroup } from '../../shared/AppButton';
import { LanguageSelector, LanguageType } from '../../shared/LanguageSelector';
import { SummaryTypeSelector, SummaryType } from '../../shared/SummaryTypeSelector';
import { Icon } from '../../shared/Icon';
import { SystemErrorInfo } from '../../../utils/errorCodes';
import './VoiceNote.css';

interface BlockEditorHandle {
  appendAsrText: (text: string, isDefiniteUtterance?: boolean, timeInfo?: { startTime?: number; endTime?: number }) => void;
  setNoteInfoEndTime: () => string;
  getNoteInfo: () => NoteInfo | undefined;
  getBlocks: () => any[];
  setBlocks: (blocks: any[]) => void;
  appendSummaryBlock: (summary: string) => void;
  updateSummaryBlock: (summary: string) => void;
  finalizeSummaryBlock: () => void;
  removeSummaryBlock: () => void;
}

interface VoiceNoteProps {
  // ASR状态
  asrState: 'idle' | 'recording' | 'stopping';
  // ASR控制（只发送启停信号）
  onAsrStart?: () => void; // 启动ASR
  onAsrStop?: () => void; // 停止ASR
  // 保存当前内容到历史记录（仅在idle状态时可用）
  onSaveText: (noteInfo?: NoteInfo) => void;
  // 强制立即保存到数据库（返回 Promise 以等待保存完成）
  onForceSave?: () => Promise<void>;
  // 其他
  onCopyText: () => void;
  onCreateNewNote?: () => void; // 保存当前笔记并创建新笔记
  apiConnected: boolean;
  blockEditorRef?: React.RefObject<BlockEditorHandle>;
  // 工作会话
  isWorkSessionActive: boolean;
  currentWorkingRecordId: string | null;
  onStartWork: () => void;
  onEndWork: () => void;
  initialBlocks?: any[];
  // 数据库保存回调
  onBlockFocus?: (blockId: string) => void;
  onBlockBlur?: (blockId: string) => void;
  onContentChange?: (content: string, isDefiniteUtterance?: boolean) => void;
  onNoteInfoChange?: (noteInfo: NoteInfo) => void;
  onBlocksChange?: (blocks: Block[]) => void;
  onBlockConfirmed?: () => void;
}

export const VoiceNote: React.FC<VoiceNoteProps> = ({
  asrState,
  onAsrStart,
  onAsrStop,
  onSaveText,
  onForceSave,
  onCopyText,
  onCreateNewNote,
  apiConnected,
  blockEditorRef,
  isWorkSessionActive,
  currentWorkingRecordId,
  onStartWork,
  onEndWork,
  initialBlocks,
  onBlockFocus,
  onBlockBlur,
  onContentChange,
  onNoteInfoChange,
  onBlocksChange,
  onBlockConfirmed, // 新增
}) => {
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageType>('original');
  const [isTranslating, setIsTranslating] = useState(false); // 新增：翻译状态
  const [showCopyDialog, setShowCopyDialog] = useState(false); // 新增：显示复制格式对话框
  const [translatingBlockIds, setTranslatingBlockIds] = useState<Set<string>>(new Set()); // 正在翻译的 block IDs
  const [selectedSummaryType, setSelectedSummaryType] = useState<SummaryType>('meeting'); // 新增：小结类型
  
  // 判断是否显示欢迎界面：工作会话未激活 且 没有正在进行的任务
  const showWelcome = !isWorkSessionActive && currentWorkingRecordId === null;
  
  // 检查是否有内容（从blockEditorRef获取）
  const hasContent = () => {
    if (!blockEditorRef?.current) return false;
    const blocks = blockEditorRef.current.getBlocks();
    return blocks.some((b: any) => 
      b.type !== 'note-info' && 
      !b.isBufferBlock && 
      b.content.trim()
    );
  };


  // 处理开始工作按钮
  const handleStartWork = () => {
    onStartWork();
  };

  // BlockEditor内容变化处理（用于自动启动工作会话和触发数据库保存）
  const handleContentChange = useCallback((_content: string, _isDefiniteUtterance?: boolean) => {
    // 当用户开始输入或ASR开始识别时，自动开始工作会话
    if (!isWorkSessionActive && hasContent()) {
      onStartWork();
    }
    
    // 触发父组件的保存逻辑
    onContentChange?.(_content, _isDefiniteUtterance);
  }, [isWorkSessionActive, hasContent, onStartWork, onContentChange]);
  
  /**
   * 生成小结
   * 流程：
   * 1. 收集所有内容blocks（排除note-info和已有的小结）
   * 2. 构建包含笔记信息和内容的完整消息
   * 3. 调用 SummaryAgent API 进行流式生成（支持多种场景类型）
   * 4. 实时更新小结block的内容
   * 5. 生成完成后固化小结
   */
  const handleSummary = async () => {
    if (!blockEditorRef?.current || isSummarizing) {
      return;
    }
    
    setIsSummarizing(true);
    
    try {
      // 获取所有blocks内容（排除已有的小结块）
      const blocks = blockEditorRef.current.getBlocks();
      const contentBlocks = blocks.filter((b: any) => 
        b.type !== 'note-info' && 
        !b.isSummary &&  // 忽略已有的小结块
        b.content.trim()
      );
      
      if (contentBlocks.length === 0) {
        alert('没有内容可以生成小结');
        setIsSummarizing(false);
        return;
      }
      
      // 获取笔记信息
      const noteInfo = blockEditorRef.current.getNoteInfo();
      
      // 构建包含笔记信息的完整消息
      let fullMessage = '';
      
      // 添加笔记元数据（如果存在）
      if (noteInfo) {
        fullMessage += '【笔记信息】\n';
        if (noteInfo.title) fullMessage += `标题: ${noteInfo.title}\n`;
        if (noteInfo.type) fullMessage += `类型: ${noteInfo.type}\n`;
        if (noteInfo.relatedPeople) fullMessage += `相关人员: ${noteInfo.relatedPeople}\n`;
        if (noteInfo.location) fullMessage += `地点: ${noteInfo.location}\n`;
        if (noteInfo.startTime) fullMessage += `开始时间: ${noteInfo.startTime}\n`;
        if (noteInfo.endTime) fullMessage += `结束时间: ${noteInfo.endTime}\n`;
        fullMessage += '\n【笔记内容】\n';
      }
      
      // 提取所有文本内容
      const contentText = contentBlocks.map((b: any) => b.content).join('\n\n');
      fullMessage += contentText;
      
      console.log(`[VoiceNote] 生成小结 - 类型: ${selectedSummaryType}, 内容长度: ${fullMessage.length}`);
      
      // 先创建一个空的小结block，用于流式更新
      blockEditorRef.current.appendSummaryBlock(''); // 先创建空block
      
      // 调用 SummaryAgent API 进行流式生成
      const response = await fetch('http://127.0.0.1:8765/api/summary/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: fullMessage,  // 包含笔记信息和内容
          summary_type: selectedSummaryType,  // 新增：传递小结类型
          temperature: 0.5,
          max_tokens: 2500,  // 增加 token 数
          stream: true,  // 启用流式输出
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }
      
      const decoder = new TextDecoder();
      let summaryContent = '';
      let hasError = false;
      let errorInfo: SystemErrorInfo | null = null;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                // 收到结构化错误信息
                hasError = true;
                errorInfo = parsed.error as SystemErrorInfo;
                break;
              }
              if (parsed.chunk) {
                summaryContent += parsed.chunk;
                // 实时更新小结block
                blockEditorRef.current.updateSummaryBlock(summaryContent);
              }
            } catch (e) {
              console.warn('解析流式数据失败:', e);
            }
          }
        }
        if (hasError) break;
      }
      
      if (hasError && errorInfo) {
        console.error('[VoiceNote] 生成小结失败:', errorInfo);
        alert(`生成小结失败: ${errorInfo.user_message || errorInfo.message}\n${errorInfo.suggestion || ''}`);
        blockEditorRef.current.removeSummaryBlock();
      } else if (!summaryContent) {
        alert('生成小结失败：未收到有效内容');
        // 移除空的小结block
        blockEditorRef.current.removeSummaryBlock();
      } else {
        // 生成完成，更新外部内容（保存到历史记录）
        blockEditorRef.current.finalizeSummaryBlock();
      }
      
    } catch (error) {
      console.error('[VoiceNote] 生成小结失败:', error);
      alert(`生成小结失败: ${error}`);
      // 移除失败的小结block
      if (blockEditorRef?.current) {
        blockEditorRef.current.removeSummaryBlock();
      }
    } finally {
      setIsSummarizing(false);
    }
  };

  /**
   * 打包导出（包含图片的 ZIP）
   */
  const handleExportZip = useCallback(async () => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';
    
    try {
      if (!currentWorkingRecordId) {
        alert('请先保存笔记后再导出');
        return;
      }
      
      const response = await fetch(
        `${API_BASE_URL}/api/records/${currentWorkingRecordId}/export?format=zip`
      );
      
      if (!response.ok) {
        throw new Error(`打包导出失败: ${response.statusText}`);
      }
      
      // 下载文件
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // 从响应头获取文件名
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `笔记_${new Date().getTime()}.zip`;
      if (contentDisposition) {
        const matches = /filename\*=UTF-8''([^;]+)/.exec(contentDisposition);
        if (matches && matches[1]) {
          filename = decodeURIComponent(matches[1]);
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      console.log('[VoiceNote] ZIP 打包导出成功:', filename);
    } catch (error) {
      console.error('[VoiceNote] 打包导出失败:', error);
      alert(`打包导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [currentWorkingRecordId]);

  // 处理导出按钮点击（直接导出ZIP）
  const handleExportClick = useCallback(async () => {
    // 如果没有保存的记录，或者有未保存的更改，先强制立即保存
    if (onForceSave) {
      try {
        await onForceSave(); // 强制立即保存到数据库（确保 note_info + blocks 都被保存）
        // 等待状态更新
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error('[VoiceNote] 保存失败:', error);
        alert('保存失败，无法导出');
        return;
      }
    }
    
    // 直接调用ZIP打包导出
    await handleExportZip();
  }, [onForceSave, handleExportZip]);


  // 复制富文本到剪贴板
  const handleCopyAsRichText = useCallback(async () => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';
    
    try {
      if (!currentWorkingRecordId) {
        alert('请先保存笔记后再复制');
        return;
      }
      
      // 获取 HTML 格式的内容
      const response = await fetch(
        `${API_BASE_URL}/api/records/${currentWorkingRecordId}/export?format=html`
      );
      
      if (!response.ok) {
        throw new Error(`获取内容失败: ${response.statusText}`);
      }
      
      const htmlContent = await response.text();
      
      // 使用 Clipboard API 复制富文本
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([htmlContent.replace(/<[^>]*>/g, '')], { type: 'text/plain' });
      
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        })
      ]);
      
      console.log('[VoiceNote] 富文本已复制到剪贴板');
      alert('✅ 富文本已复制！可以直接粘贴到论坛了');
    } catch (error) {
      console.error('[VoiceNote] 复制富文本失败:', error);
      alert(`复制失败: ${error instanceof Error ? error.message : '未知错误'}\n\n提示：某些浏览器可能不支持富文本复制`);
    }
  }, [currentWorkingRecordId]);


  // 处理复制按钮点击（显示格式选择对话框）
  const handleCopyClick = useCallback(async () => {
    // 如果没有保存的记录，或者有未保存的更改，先强制立即保存
    if (onForceSave) {
      try {
        await onForceSave(); // 强制立即保存到数据库（确保 note_info + blocks 都被保存）
        // 等待状态更新
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error('[VoiceNote] 保存失败:', error);
        alert('保存失败，无法复制');
        return;
      }
    }
    
    setShowCopyDialog(true);
  }, [onForceSave]);

  // 处理复制格式确认
  const handleCopyConfirm = useCallback(async (format: CopyFormat) => {
    if (format === 'plain') {
      // 纯文本复制（使用原有的 onCopyText）
      onCopyText();
    } else {
      // 富文本复制（包含 note_info + blocks）
      await handleCopyAsRichText();
    }
  }, [onCopyText, handleCopyAsRichText]);


  // 处理语言切换
  const handleLanguageChange = async (language: LanguageType) => {
    setSelectedLanguage(language);
    
    if (language === 'original') {
      // 切换回原文，不需要翻译
      return;
    }
    
    // 检查是否已有翻译
    const blocks = blockEditorRef?.current?.getBlocks() || [];
    const hasTranslations = blocks.some((b: any) => b.translations?.[language]);
    
    if (!hasTranslations) {
      // 没有翻译，触发批量翻译（传入语言对如 'zh-en'）
      await translateAllBlocks(language);
    }
  };

  /**
   * 更新 Block 的翻译内容
   * @param blockId Block ID
   * @param translationData 翻译数据（可以是成功的翻译内容或错误信息）
   */
  const updateBlockTranslation = useCallback((blockId: string, translationData: any) => {
    if (!blockEditorRef?.current) return;
    
    const blocks = blockEditorRef.current.getBlocks();
    const updatedBlocks = blocks.map((b: any) => {
      if (b.id === blockId) {
        return {
          ...b,
          translations: {
            ...b.translations,
            [selectedLanguage]: {
              ...translationData,
              updatedAt: Date.now()
            }
          }
        };
      }
      return b;
    });
    
    blockEditorRef.current.setBlocks(updatedBlocks);
  }, [selectedLanguage, blockEditorRef]);
  
  /**
   * 翻译单个Block（实时翻译功能）
   */
  const translateSingleBlock = useCallback(async (blockId: string) => {
    console.log('[VoiceNote] 🌐 translateSingleBlock 开始:', blockId);
    
    if (!blockEditorRef?.current) {
      console.log('[VoiceNote] ❌ blockEditorRef 不存在');
      return;
    }
    if (selectedLanguage === 'original') {
      console.log('[VoiceNote] ⏭️  当前为原文模式，跳过');
      return;
    }
    
    const blocks = blockEditorRef.current.getBlocks();
    const block = blocks.find((b: any) => b.id === blockId);
    
    if (!block) {
      console.log('[VoiceNote] ❌ 找不到 block:', blockId);
      return;
    }
    
    console.log('[VoiceNote] 📝 Block 信息:', {
      id: block.id,
      type: block.type,
      content: block.content,
      hasTranslation: !!block.translations?.[selectedLanguage]
    });
    
    // 不翻译特殊类型的 block
    if (block.type === 'note-info' || block.isBufferBlock || block.isSummary) {
      console.log('[VoiceNote] ⏭️  跳过特殊类型 block:', block.type);
      return;
    }
    
    // 内容为空，不翻译
    if (!block.content.trim()) {
      console.log('[VoiceNote] ⏭️  内容为空，跳过');
      return;
    }
    
    // 已经有翻译了，不重复翻译
    if (block.translations?.[selectedLanguage]) {
      console.log('[VoiceNote] ⏭️  Block 已有翻译，跳过:', blockId);
      return;
    }
    
    console.log('[VoiceNote] 🚀 开始翻译 block:', blockId, '语言对:', selectedLanguage);
    
    // 显示"翻译中"占位符
    updateBlockTranslation(blockId, {
      content: '',
      isTranslating: true
    });
    
    // 标记正在翻译
    setTranslatingBlockIds(prev => new Set(prev).add(blockId));
    
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';
    
    try {
      // 使用单条翻译 API，后端会自动检测翻译方向
      const response = await fetch(`${API_BASE_URL}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: block.content,
          language_pair: selectedLanguage
        })
      });
      
      if (!response.ok) {
        throw new Error(`翻译失败: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      console.log('[VoiceNote] 📨 翻译 API 响应:', data);
      
      // 检查是否有错误（语种不匹配）
      if (!data.success && data.error) {
        console.warn('[VoiceNote] ⚠️  翻译失败:', data.error);
        updateBlockTranslation(blockId, {
          error: data.error.code || 'translation_error',
          message: data.error.details || '翻译失败'
        });
        return;
      }
      
      // 成功翻译
      if (data.success && data.translation) {
        const translation = data.translation;
        
        console.log('[VoiceNote] 📋 翻译结果:', translation);
        
        // 翻译结果和原文相同，跳过
        if (translation === block.content) {
          console.warn('[VoiceNote] 翻译结果与原文相同:', blockId);
          return;
        }
        
        // 更新翻译内容
        updateBlockTranslation(blockId, { content: translation });
        console.log('[VoiceNote] ✅ 实时翻译完成:', blockId, selectedLanguage);
      } else {
        console.warn('[VoiceNote] ⚠️  翻译 API 返回异常:', data);
      }
    } catch (error) {
      console.error('[VoiceNote] ❌ 实时翻译失败:', error);
      // 静默失败，不显示错误提示
    } finally {
      // 移除翻译中标记
      setTranslatingBlockIds(prev => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });
      console.log('[VoiceNote] 🏁 translateSingleBlock 结束:', blockId);
    }
  }, [selectedLanguage, blockEditorRef, updateBlockTranslation]);
  
  // 批量翻译所有Block（使用语言对，自动检测翻译方向）
  const translateAllBlocks = async (languagePair: string) => {
    if (!blockEditorRef?.current) return;
    
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';
    const blocks = blockEditorRef.current.getBlocks();
    const contentBlocks = blocks.filter((b: any) => 
      b.type !== 'note-info' && 
      !b.isBufferBlock && 
      !b.isSummary &&
      b.content.trim()
    );
    
    if (contentBlocks.length === 0) return;
    
    setIsTranslating(true);
    
    try {
      const texts = contentBlocks.map((b: any) => b.content);
      
      // 使用新的 language_pair 参数，后端会自动检测每条文本的翻译方向
      const response = await fetch(`${API_BASE_URL}/api/translate/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts,
          language_pair: languagePair  // 如 'zh-en', 'en-ja'
        })
      });
      
      if (!response.ok) {
        throw new Error(`翻译失败: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 更新blocks的translations字段
        // 使用 languagePair 作为 key（如 'zh-en'）
        const updatedBlocks = blocks.map((b: any) => {
          const index = contentBlocks.findIndex((cb: any) => cb.id === b.id);
          if (index !== -1 && data.translations[index]) {
            return {
              ...b,
              translations: {
                ...b.translations,
                [languagePair]: {
                  content: data.translations[index],
                  updatedAt: Date.now()
                }
              }
            };
          }
          return b;
        });
        
        blockEditorRef.current.setBlocks(updatedBlocks);
        console.log('[VoiceNote] 批量翻译完成，语言对:', languagePair);
      }
    } catch (error) {
      console.error('[VoiceNote] 批量翻译失败:', error);
      alert('翻译失败，请重试');
    } finally {
      setIsTranslating(false);
    }
  };
  
  // 处理 Block 失焦事件（手动编辑时的翻译触发点）
  const handleBlockBlur = useCallback((blockId: string) => {
    console.log('[VoiceNote] 🔍 handleBlockBlur 触发:', blockId, '当前语言:', selectedLanguage);
    
    // 通知父组件
    onBlockBlur?.(blockId);
    
    // 如果选择了翻译语言，触发实时翻译
    if (selectedLanguage !== 'original') {
      console.log('[VoiceNote] ✅ 触发实时翻译:', blockId, '语言对:', selectedLanguage);
      translateSingleBlock(blockId);
    } else {
      console.log('[VoiceNote] ⏭️  跳过翻译（当前为原文模式）');
    }
  }, [selectedLanguage, onBlockBlur, translateSingleBlock]);
  
  // 处理 Block 确定事件（ASR 确定句子后的翻译触发点）
  const handleBlockConfirmed = useCallback(() => {
    console.log('[VoiceNote] 📝 Block 确定，当前语言:', selectedLanguage);
    
    // 通知父组件（原有逻辑）
    onBlockConfirmed?.();
    
    // 如果选择了翻译语言，自动翻译刚确定的 block
    if (selectedLanguage !== 'original' && blockEditorRef.current) {
      const blocks = blockEditorRef.current.getBlocks();
      
      // 找到最后一个非 ASR 写入、非缓冲的 block（即刚确定的）
      const lastConfirmedBlock = blocks
        .slice()
        .reverse()
        .find(b => !b.isAsrWriting && !b.isBufferBlock && b.type !== 'note-info' && !b.isSummary);
      
      if (lastConfirmedBlock && lastConfirmedBlock.content.trim()) {
        console.log('[VoiceNote] 🎯 ASR 确定后自动翻译:', lastConfirmedBlock.id);
        // 异步翻译，不阻塞 ASR
        translateSingleBlock(lastConfirmedBlock.id);
      }
    }
  }, [selectedLanguage, onBlockConfirmed, translateSingleBlock]);

  return (
    <AppLayout
      title="语音笔记"
      subtitle="语音转文字，实时记录"
      icon="📝"
      statusIndicator={
        <StatusIndicator 
          asrStatus={asrState}
          status={asrState}
        />
      }
      actions={
        // EXIT 按钮：放在导航栏右侧
        isWorkSessionActive && (
          <AppButton
            onClick={onEndWork}
            disabled={asrState !== 'idle'}
            variant="ghost"
            size="small"
            title="保存并退出当前笔记会话"
            ariaLabel="保存并退出"
            className="voice-note-exit-button"
          >
            <Icon name="logout" size={18} />
          </AppButton>
        )
      }
    >
      {showWelcome ? (
        <WelcomeScreen onStartWork={handleStartWork} />
      ) : (
        <div className="voice-note-content">
          <BlockEditor
            initialBlocks={initialBlocks}
            onContentChange={handleContentChange}
            onNoteInfoChange={onNoteInfoChange}
            onBlockFocus={onBlockFocus}
            onBlockBlur={handleBlockBlur}
            onBlocksChange={onBlocksChange}
            onBlockConfirmed={handleBlockConfirmed}
            isRecording={asrState === 'recording'}
            selectedLanguage={selectedLanguage}
            ref={blockEditorRef}
          />
          
          <BottomToolbar
            asrState={asrState}
            onAsrStart={onAsrStart}
            onAsrStop={onAsrStop}
            onCopy={handleCopyClick}
            hasContent={hasContent()}
            onSummary={handleSummary}
            isSummarizing={isSummarizing}
            apiConnected={apiConnected}
            onExport={handleExportClick}
            currentWorkingRecordId={currentWorkingRecordId}
            onCreateNewNote={onCreateNewNote}
            isWorkSessionActive={isWorkSessionActive}
            selectedLanguage={selectedLanguage}
            onLanguageChange={handleLanguageChange}
            isTranslating={isTranslating}
            selectedSummaryType={selectedSummaryType}
            onSummaryTypeChange={setSelectedSummaryType}
          />
        </div>
      )}
      
      {/* 复制格式选择对话框 */}
      <CopyFormatDialog
        isOpen={showCopyDialog}
        onClose={() => setShowCopyDialog(false)}
        onConfirm={handleCopyConfirm}
      />
    </AppLayout>
  );
};

