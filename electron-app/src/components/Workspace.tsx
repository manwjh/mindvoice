import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BlockEditor } from './BlockEditor';
import { FormatToolbar } from './FormatToolbar';
import './Workspace.css';

interface WorkspaceProps {
  text: string;
  onTextChange: (text: string) => void;
  isRecording: boolean;
  isPaused: boolean;
  onAsrTextUpdate?: (text: string) => void;
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopRecording: () => void;
  onCopyText: () => void;
  apiConnected: boolean;
  recordingState: 'idle' | 'recording' | 'paused' | 'processing';
  blockEditorRef?: React.RefObject<{ appendAsrText: (text: string) => void }>;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  text,
  onTextChange,
  isRecording,
  isPaused,
  onAsrTextUpdate,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
  onCopyText,
  apiConnected,
  recordingState,
  blockEditorRef,
}) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });
  const workspaceContentRef = useRef<HTMLDivElement>(null);

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
      
      if (workspaceContentRef.current) {
        const contentRect = workspaceContentRef.current.getBoundingClientRect();
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
    const handleClick = (e: MouseEvent) => {
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

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div className="header-left">
          <div
            className="status-indicator"
            data-status={recordingState}
            role="status"
            aria-live="polite"
            aria-label={
              !apiConnected
                ? '未连接'
                : recordingState === 'recording'
                ? '录音中'
                : recordingState === 'paused'
                ? '已暂停'
                : recordingState === 'processing'
                ? '处理中'
                : '就绪'
            }
          >
            <span className="status-dot" aria-hidden="true"></span>
            <span className="status-text">
              {!apiConnected
                ? '未连接'
                : recordingState === 'recording'
                ? '录音中...'
                : recordingState === 'paused'
                ? '已暂停'
                : recordingState === 'processing'
                ? '处理中...'
                : '就绪'}
            </span>
          </div>
        </div>
        <div className="header-right">
          <div className="recording-controls">
            <button
              onClick={onStartRecording}
              disabled={!apiConnected || recordingState === 'recording' || recordingState === 'processing'}
              className="control-btn control-btn-start"
              title="开始录音"
              aria-label="开始录音"
            >
              <span className="btn-icon" aria-hidden="true">●</span>
              <span className="btn-text">开始</span>
            </button>

            {recordingState === 'recording' ? (
              <button
                onClick={onPauseRecording}
                disabled={!apiConnected}
                className="control-btn control-btn-pause"
                title="暂停录音"
                aria-label="暂停录音"
              >
                <span className="btn-icon" aria-hidden="true">⏸</span>
                <span className="btn-text">暂停</span>
              </button>
            ) : recordingState === 'paused' ? (
              <button
                onClick={onResumeRecording}
                disabled={!apiConnected}
                className="control-btn control-btn-resume"
                title="恢复录音"
                aria-label="恢复录音"
              >
                <span className="btn-icon" aria-hidden="true">▶</span>
                <span className="btn-text">恢复</span>
              </button>
            ) : null}

            <button
              onClick={onStopRecording}
              disabled={!apiConnected || recordingState === 'idle' || recordingState === 'processing'}
              className="control-btn control-btn-stop"
              title="停止录音"
              aria-label="停止录音"
            >
              <span className="btn-icon" aria-hidden="true">■</span>
              <span className="btn-text">停止</span>
            </button>

            <button
              onClick={onCopyText}
              disabled={!text}
              className="control-btn control-btn-copy"
              title="复制文本"
              aria-label="复制文本"
            >
              <span className="btn-icon" aria-hidden="true">📋</span>
              <span className="btn-text">复制</span>
            </button>
          </div>
        </div>
      </div>

      <div className="workspace-content" ref={workspaceContentRef}>
        <FormatToolbar
          visible={showToolbar}
          position={toolbarPosition}
          onFormat={handleFormat}
        />
        <BlockEditor
          initialContent={text}
          onContentChange={onTextChange}
          isRecording={isRecording}
          isPaused={isPaused}
          onAsrTextUpdate={onAsrTextUpdate}
          ref={blockEditorRef}
        />
      </div>
    </div>
  );
};

