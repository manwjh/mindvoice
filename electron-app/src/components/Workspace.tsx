import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BlockEditor } from './BlockEditor';
import { FormatToolbar } from './FormatToolbar';
import './Workspace.css';

interface WorkspaceProps {
  text: string;
  onTextChange: (text: string) => void;
  // ASR状态
  asrState: 'idle' | 'recording' | 'paused' | 'stopping';
  // ASR控制（简化后的接口）
  onAsrToggle?: () => void; // idle时启动，recording/paused时停止
  onPauseToggle?: () => void; // recording时暂停，paused时继续
  // 保存当前内容到历史记录（仅在idle状态时可用）
  onSaveText: () => void;
  // 其他
  onCopyText: () => void;
  onClearText?: () => void;
  apiConnected: boolean;
  blockEditorRef?: React.RefObject<{ appendAsrText: (text: string, isDefiniteUtterance?: boolean) => void }>;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  text,
  onTextChange,
  asrState,
  onAsrToggle,
  onPauseToggle,
  onSaveText,
  onCopyText,
  onClearText,
  apiConnected,
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

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div className="header-left">
          <div className="status-group">
            {/* ASR状态 */}
            {apiConnected && (
              <div
                className="status-indicator status-indicator-asr"
                data-status={asrState}
                role="status"
                aria-live="polite"
              >
                <span className="status-dot" aria-hidden="true"></span>
                <span className="status-text">
                  {asrState === 'recording'
                    ? 'ASR输入中...'
                    : asrState === 'paused'
                    ? 'ASR已暂停'
                    : asrState === 'stopping'
                    ? 'ASR正在停止...'
                    : 'ASR未启动'}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="header-right">
          <div className="recording-controls">
            {/* 简化的控制按钮：ASR、PAUSE */}
            {apiConnected && (
              <div className="primary-actions">
                {/* ASR按钮：仅在idle时可用，启动ASR */}
                {onAsrToggle && (
                  <button
                    onClick={onAsrToggle}
                    disabled={asrState !== 'idle'}
                    className="control-btn control-btn-primary control-btn-start"
                    title="启动ASR"
                    aria-label="启动ASR"
                  >
                    <span className="btn-icon" aria-hidden="true">🎤</span>
                    <span className="btn-text">ASR</span>
                  </button>
                )}

                {/* PAUSE按钮：仅在recording时可用，停止ASR */}
                {onPauseToggle && (
                  <button
                    onClick={onPauseToggle}
                    disabled={asrState !== 'recording'}
                    className="control-btn control-btn-secondary control-btn-pause"
                    title="停止ASR"
                    aria-label="停止ASR"
                  >
                    <span className="btn-icon" aria-hidden="true">⏸</span>
                    <span className="btn-text">PAUSE</span>
                  </button>
                )}

                {/* SAVE按钮：仅在idle状态时可用 */}
                <button
                  onClick={onSaveText}
                  disabled={asrState !== 'idle' || !text || !text.trim()}
                  className="control-btn control-btn-primary control-btn-save"
                  title="保存到历史记录"
                  aria-label="保存文本"
                >
                  <span className="btn-icon" aria-hidden="true">💾</span>
                  <span className="btn-text">SAVE</span>
                </button>
              </div>
            )}

            {/* 工具按钮组 */}
            <div className="tool-actions">
              {onClearText && text && (
                <button
                  onClick={onClearText}
                  className="control-btn control-btn-tool"
                  title="清空当前内容"
                  aria-label="清空内容"
                >
                  <span className="btn-icon" aria-hidden="true">🗑</span>
                  <span className="btn-text">清空</span>
                </button>
              )}
              <button
                onClick={onCopyText}
                disabled={!text}
                className="control-btn control-btn-tool"
                title="复制文本到剪贴板"
                aria-label="复制文本"
              >
                <span className="btn-icon" aria-hidden="true">📋</span>
                <span className="btn-text">复制</span>
              </button>
            </div>
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
          isRecording={asrState === 'recording'}
          isPaused={asrState === 'paused'}
          ref={blockEditorRef}
        />
      </div>
    </div>
  );
};

