import React, { useEffect } from 'react';
import { AppButton } from '../../shared/AppButton';
import './BottomToolbar.css';

// Inline SVG icons
const MicBwIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 512 512">
    <path fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="32" d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192s192-86 192-192Z"/>
    <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32" d="M224 368h64m48-143.7v23.92c0 39.42-40.58 71.48-80 71.48h0c-39.42 0-80-32.06-80-71.48V224.3m80 95.7v48"/>
    <rect width="96" height="160" x="208" y="128" fill="currentColor" rx="48" ry="48"/>
  </svg>
);

const MicWbIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 512 512">
    <path fill="currentColor" d="M256 48C141.31 48 48 141.31 48 256s93.31 208 208 208s208-93.31 208-208S370.69 48 256 48m-48 128a48.14 48.14 0 0 1 48-48a48.14 48.14 0 0 1 48 48v64a48.14 48.14 0 0 1-48 48a48.14 48.14 0 0 1-48-48Zm144 72.22c0 23.36-10.94 45.61-30.79 62.66A103.7 103.7 0 0 1 272 334.26V352h32v32h-96v-32h32v-17.74a103.7 103.7 0 0 1-49.21-23.38c-19.85-17.05-30.79-39.3-30.79-62.66V208.3h32v39.92c0 25.66 28 55.48 64 55.48c29.6 0 64-24.23 64-55.48V208.3h32Z"/>
  </svg>
);

interface BottomToolbarProps {
  // ASR 控制
  asrState: 'idle' | 'recording' | 'stopping';
  onAsrStart?: () => void;
  onAsrStop?: () => void;
  // 复制功能
  onCopy: () => void;
  hasContent: boolean;
  // 生成小结
  onSummary: () => void;
  isSummarizing?: boolean;
  // 连接状态
  apiConnected: boolean;
  // 导出功能
  onExport?: () => void;
  currentWorkingRecordId?: string | null;
}

export const BottomToolbar: React.FC<BottomToolbarProps> = ({
  asrState,
  onAsrStart,
  onAsrStop,
  onCopy,
  hasContent,
  onSummary,
  isSummarizing = false,
  apiConnected,
  onExport,
  currentWorkingRecordId,
}) => {
  return (
    <div className="bottom-toolbar">
      <div className="bottom-toolbar-content">
        {/* 左侧：ASR控制按钮（圆形图标） */}
        <div className="bottom-toolbar-left">
          {apiConnected && (
            <>
              {asrState === 'idle' && onAsrStart && (
                <button
                  className="asr-button asr-button-start"
                  onClick={onAsrStart}
                  title="启动语音识别 (开始记录)"
                  aria-label="启动语音识别"
                >
                  <MicBwIcon />
                </button>
              )}

              {asrState === 'recording' && onAsrStop && (
                <button
                  className="asr-button asr-button-stop"
                  onClick={onAsrStop}
                  title="停止语音识别"
                  aria-label="停止语音识别"
                >
                  <MicWbIcon />
                </button>
              )}

              {asrState === 'stopping' && (
                <button
                  className="asr-button asr-button-stopping"
                  disabled
                  title="正在停止语音识别..."
                  aria-label="正在停止语音识别"
                >
                  <span className="asr-icon">⏳</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* 中间：内容操作按钮 */}
        <div className="bottom-toolbar-center">
          <AppButton
            onClick={onCopy}
            disabled={!hasContent}
            variant="ghost"
            size="medium"
            icon="📋"
            title="复制笔记（可选纯文本或富文本）"
            ariaLabel="复制笔记"
          >
            复制
          </AppButton>
          
          <AppButton
            onClick={onSummary}
            disabled={asrState !== 'idle' || !hasContent || isSummarizing}
            variant="info"
            size="medium"
            icon={isSummarizing ? "⏳" : "📊"}
            title={isSummarizing ? "正在生成小结..." : "使用AI生成内容小结"}
            ariaLabel={isSummarizing ? "正在生成小结" : "生成小结"}
          >
            {isSummarizing ? '生成中' : '小结'}
          </AppButton>

          <AppButton
            onClick={onExport}
            disabled={!currentWorkingRecordId || asrState !== 'idle'}
            variant="primary"
            size="medium"
            icon="📦"
            title="导出笔记（ZIP 或 HTML 格式）"
            ariaLabel="导出笔记"
          >
            导出
          </AppButton>
        </div>
      </div>
    </div>
  );
};

