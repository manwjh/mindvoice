import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BlockEditor, NoteInfo } from './BlockEditor';
import { FormatToolbar } from './FormatToolbar';
import { WelcomeScreen } from './WelcomeScreen';
import { AppLayout } from '../../shared/AppLayout';
import { StatusIndicator, AppStatusType } from '../../shared/StatusIndicator';
import { AppButton, ButtonGroup } from '../../shared/AppButton';
import './VoiceNote.css';

interface BlockEditorHandle {
  appendAsrText: (text: string, isDefiniteUtterance?: boolean, timeInfo?: { startTime?: number; endTime?: number }) => void;
  setNoteInfoEndTime: () => void;
  getNoteInfo: () => NoteInfo | undefined;
  getBlocks: () => any[];  // ⭐ 新增
  setBlocks: (blocks: any[]) => void;  // ⭐ 新增
}

interface VoiceNoteProps {
  text: string;
  onTextChange: (text: string) => void;
  // ASR状态
  asrState: 'idle' | 'recording' | 'stopping';
  // ASR控制
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
  onStartWork: () => void;
  onEndWork: () => void;
  // ⭐ 新增：用于恢复完整的 blocks 数据
  initialBlocks?: any[];
}

export const VoiceNote: React.FC<VoiceNoteProps> = ({
  text,
  onTextChange,
  asrState,
  onAsrStart,
  onAsrStop,
  onSaveText,
  onCopyText,
  onCreateNewNote,
  apiConnected,
  blockEditorRef,
  isWorkSessionActive,
  onStartWork,
  onEndWork,
  initialBlocks,
}) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });
  const [noteInfo, setNoteInfo] = useState<NoteInfo | null>(null);
  const voiceNoteContentRef = useRef<HTMLDivElement>(null);
  
  // 判断是否显示欢迎界面
  const showWelcome = !isWorkSessionActive && !text.trim();

  // 监听文本选择，显示格式化工具栏
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setShowToolbar(false);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      if (voiceNoteContentRef.current) {
        const contentRect = voiceNoteContentRef.current.getBoundingClientRect();
        setToolbarPosition({
          top: rect.top - contentRect.top - 40,
          left: rect.left - contentRect.left + rect.width / 2,
        });
        setShowToolbar(true);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  // 点击其他地方时隐藏工具栏
  useEffect(() => {
    const handleClick = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setShowToolbar(false);
      }
    };

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, []);

  const handleFormat = useCallback((format: string) => {
    // TODO: 实现格式化功能
    console.log('格式化:', format);
    setShowToolbar(false);
  }, []);

  // 处理开始工作按钮
  const handleStartWork = () => {
    onStartWork();
  };

  // 当用户开始输入时，自动开始工作会话
  const handleTextChange = (newText: string) => {
    if (!isWorkSessionActive && newText.trim().length > 0) {
      onStartWork();
    }
    onTextChange(newText);
  };
  
  // 处理笔记信息变化
  const handleNoteInfoChange = useCallback((info: NoteInfo) => {
    setNoteInfo(info);
  }, []);
  
  // 处理保存（添加结束时间）
  const handleSave = () => {
    if (blockEditorRef?.current) {
      // 设置结束时间
      blockEditorRef.current.setNoteInfoEndTime();
      // 获取更新后的笔记信息
      const currentNoteInfo = blockEditorRef.current.getNoteInfo();
      onSaveText(currentNoteInfo);
    } else {
      onSaveText();
    }
  };

  // 计算 App 状态
  const getAppStatus = (): AppStatusType => {
    if (!apiConnected) return 'error';
    if (asrState === 'stopping') return 'waiting';
    if (isWorkSessionActive) return 'working';
    return 'idle';
  };

  return (
    <AppLayout
      title="语音笔记"
      subtitle="语音转文字，实时记录"
      icon="📝"
      statusIndicator={
        <StatusIndicator 
          status={asrState}
          appStatus={getAppStatus()}
          appStatusText={
            !apiConnected ? 'API未连接' :
            isWorkSessionActive ? '记录中' :
            '空闲'
          }
          asrStatus={asrState}
        />
      }
      actions={
        <>
          {/* ASR控制按钮：根据状态切换 */}
          {apiConnected && isWorkSessionActive && (
            <>
              {asrState === 'idle' && onAsrStart && (
                <AppButton
                  onClick={onAsrStart}
                  variant="success"
                  size="large"
                  icon="🎤"
                  title="启动语音识别"
                  ariaLabel="启动ASR"
                >
                  启动ASR
                </AppButton>
              )}

              {asrState === 'recording' && onAsrStop && (
                <AppButton
                  onClick={onAsrStop}
                  variant="danger"
                  size="large"
                  icon="⏹"
                  title="停止语音识别"
                  ariaLabel="停止ASR"
                >
                  停止ASR
                </AppButton>
              )}

              {asrState === 'stopping' && (
                <AppButton
                  disabled
                  variant="warning"
                  size="large"
                  icon="⏳"
                  title="正在停止..."
                  ariaLabel="正在停止"
                >
                  停止中...
                </AppButton>
              )}
            </>
          )}

          {/* 保存和工具按钮 */}
          {isWorkSessionActive && (
            <>
              <AppButton
                onClick={handleSave}
                disabled={asrState !== 'idle' || !text || !text.trim()}
                variant="info"
                size="large"
                icon="💾"
                title="保存到历史记录"
                ariaLabel="保存文本"
              >
                保存
              </AppButton>

              <ButtonGroup>
                {onCreateNewNote && (
                  <AppButton
                    onClick={onCreateNewNote}
                    disabled={asrState !== 'idle'}
                    variant="ghost"
                    size="medium"
                    icon="📝"
                    title={text && text.trim() ? "保存当前笔记并创建新笔记" : "创建新笔记"}
                    ariaLabel="新笔记"
                  >
                    新笔记
                  </AppButton>
                )}
                <AppButton
                  onClick={onCopyText}
                  disabled={!text}
                  variant="ghost"
                  size="medium"
                  icon="📋"
                  title="复制文本到剪贴板"
                  ariaLabel="复制文本"
                >
                  复制
                </AppButton>
              </ButtonGroup>
            </>
          )}
        </>
      }
    >
      {showWelcome ? (
        <WelcomeScreen onStartWork={handleStartWork} />
      ) : (
        <div className="voice-note-content" ref={voiceNoteContentRef}>
          <FormatToolbar
            visible={showToolbar}
            position={toolbarPosition}
            onFormat={handleFormat}
          />
          
          <BlockEditor
            initialContent={text}
            initialBlocks={initialBlocks}
            onContentChange={handleTextChange}
            onNoteInfoChange={handleNoteInfoChange}
            isRecording={asrState === 'recording'}
            ref={blockEditorRef}
          />
        </div>
      )}
    </AppLayout>
  );
};

