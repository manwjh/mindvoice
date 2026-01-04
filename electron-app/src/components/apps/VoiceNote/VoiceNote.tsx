import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BlockEditor, NoteInfo, Block } from './BlockEditor';
import { WelcomeScreen } from './WelcomeScreen';
import { BottomToolbar } from './BottomToolbar';
import { ExportFormatDialog, ExportFormat } from './ExportFormatDialog';
import { CopyFormatDialog, CopyFormat } from './CopyFormatDialog';
import { AppLayout } from '../../shared/AppLayout';
import { StatusIndicator } from '../../shared/StatusIndicator';
import { AppButton, ButtonGroup } from '../../shared/AppButton';
import { LanguageSelector, LanguageType } from '../../shared/LanguageSelector';
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
  const [showExportDialog, setShowExportDialog] = useState(false); // 新增：显示导出对话框
  const [showCopyDialog, setShowCopyDialog] = useState(false); // 新增：显示复制格式对话框
  
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
   * 3. 调用 SummaryAgent API 进行流式生成
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
          temperature: 0.5,
          max_tokens: 2000,
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
   * 导出为 Markdown（图片使用 API URL）
   */
  const handleExport = useCallback(async () => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';
    
    try {
      if (!currentWorkingRecordId) {
        alert('请先保存笔记后再导出');
        return;
      }
      
      const response = await fetch(
        `${API_BASE_URL}/api/records/${currentWorkingRecordId}/export?format=md`
      );
      
      if (!response.ok) {
        throw new Error(`导出失败: ${response.statusText}`);
      }
      
      // 下载文件
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // 从响应头获取文件名，如果没有则使用默认名称
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `笔记_${new Date().getTime()}.md`;
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
      
      console.log('[VoiceNote] Markdown 导出成功:', filename);
    } catch (error) {
      console.error('[VoiceNote] 导出失败:', error);
      alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [currentWorkingRecordId]);

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

  // 处理导出按钮点击（显示对话框）
  const handleExportClick = useCallback(() => {
    if (!currentWorkingRecordId) {
      alert('请先保存笔记后再导出');
      return;
    }
    setShowExportDialog(true);
  }, [currentWorkingRecordId]);

  // 处理导出格式确认
  const handleExportConfirm = useCallback(async (format: ExportFormat) => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';
    
    try {
      if (!currentWorkingRecordId) {
        alert('请先保存笔记后再导出');
        return;
      }
      
      const response = await fetch(
        `${API_BASE_URL}/api/records/${currentWorkingRecordId}/export?format=${format}`
      );
      
      if (!response.ok) {
        throw new Error(`导出失败: ${response.statusText}`);
      }
      
      // 下载文件
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // 从响应头获取文件名
      const contentDisposition = response.headers.get('Content-Disposition');
      const extension = format === 'html' ? 'html' : 'zip';
      let filename = `笔记_${new Date().getTime()}.${extension}`;
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
      
      const formatText = format === 'html' ? 'HTML' : 'ZIP';
      console.log(`[VoiceNote] ${formatText} 导出成功:`, filename);
    } catch (error) {
      console.error('[VoiceNote] 导出失败:', error);
      alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [currentWorkingRecordId]);

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
  const handleCopyClick = useCallback(() => {
    if (!hasContent() && !currentWorkingRecordId) {
      alert('没有可复制的内容');
      return;
    }
    setShowCopyDialog(true);
  }, [hasContent, currentWorkingRecordId]);

  // 处理复制格式确认
  const handleCopyConfirm = useCallback(async (format: CopyFormat) => {
    if (format === 'plain') {
      // 纯文本复制（使用原有的 onCopyText）
      onCopyText();
    } else {
      // 富文本复制
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
    
    const languagePair = parseLanguagePair(language);
    if (!languagePair) return;
    
    // 检查是否已有翻译
    const blocks = blockEditorRef?.current?.getBlocks() || [];
    const translationKey = language;
    const hasTranslations = blocks.some((b: any) => b.translations?.[translationKey]);
    
    if (!hasTranslations) {
      // 没有翻译，触发批量翻译
      await translateAllBlocks(languagePair);
    }
  };

  // 解析语言对
  const parseLanguagePair = (languageType: LanguageType): { source: string; target: string } | null => {
    if (languageType === 'original') return null;
    const [source, target] = languageType.split('-');
    return { source, target };
  };

  // 批量翻译所有Block
  const translateAllBlocks = async (languagePair: { source: string; target: string }) => {
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
      
      const response = await fetch(`${API_BASE_URL}/api/translate/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts,
          source_lang: languagePair.source,
          target_lang: languagePair.target
        })
      });
      
      if (!response.ok) {
        throw new Error(`翻译失败: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 更新blocks的translations字段
        const translationKey = `${languagePair.source}-${languagePair.target}`;
        const updatedBlocks = blocks.map((b: any) => {
          const index = contentBlocks.findIndex((cb: any) => cb.id === b.id);
          if (index !== -1 && data.translations[index]) {
            return {
              ...b,
              translations: {
                ...b.translations,
                [translationKey]: {
                  content: data.translations[index],
                  updatedAt: Date.now()
                }
              }
            };
          }
          return b;
        });
        
        blockEditorRef.current.setBlocks(updatedBlocks);
        console.log('[VoiceNote] 批量翻译完成');
      }
    } catch (error) {
      console.error('[VoiceNote] 批量翻译失败:', error);
      alert('翻译失败，请重试');
    } finally {
      setIsTranslating(false);
    }
  };

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
        <>
          {isWorkSessionActive && (
            <>
              <LanguageSelector
                value={selectedLanguage}
                onChange={handleLanguageChange}
                disabled={!hasContent()}
                loading={isTranslating}
              />

              <AppButton
                onClick={onCreateNewNote}
                disabled={asrState !== 'idle'}
                variant="ghost"
                size="medium"
                icon="📝"
                title={hasContent() ? "保存当前笔记并创建新笔记" : "创建新笔记"}
                ariaLabel="新笔记"
              >
                NEW
              </AppButton>

              <AppButton
                onClick={onEndWork}
                disabled={asrState !== 'idle'}
                variant="ghost"
                size="medium"
                icon="🚪"
                title="退出当前笔记会话"
                ariaLabel="退出"
              >
                EXIT
              </AppButton>
            </>
          )}
        </>
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
            onBlockBlur={onBlockBlur}
            onBlocksChange={onBlocksChange}
            onBlockConfirmed={onBlockConfirmed}
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
          />
        </div>
      )}
      
      {/* 导出格式选择对话框 */}
      <ExportFormatDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onConfirm={handleExportConfirm}
      />
      
      {/* 复制格式选择对话框 */}
      <CopyFormatDialog
        isOpen={showCopyDialog}
        onClose={() => setShowCopyDialog(false)}
        onConfirm={handleCopyConfirm}
      />
    </AppLayout>
  );
};

