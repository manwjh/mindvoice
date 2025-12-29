import React from 'react';
import './FormatToolbar.css';

interface FormatToolbarProps {
  onFormat?: (format: string) => void;
  visible?: boolean;
  position?: { top: number; left: number };
}

export const FormatToolbar: React.FC<FormatToolbarProps> = ({
  onFormat,
  visible = false,
  position = { top: 0, left: 0 },
}) => {
  if (!visible) return null;

  return (
    <div
      className="format-toolbar"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      role="toolbar"
      aria-label="格式化工具栏"
    >
      <button
        className="toolbar-btn"
        onClick={() => onFormat?.('bold')}
        title="粗体 (Ctrl+B)"
        aria-label="粗体"
      >
        <strong>B</strong>
      </button>
      <button
        className="toolbar-btn"
        onClick={() => onFormat?.('italic')}
        title="斜体 (Ctrl+I)"
        aria-label="斜体"
      >
        <em>I</em>
      </button>
      <button
        className="toolbar-btn"
        onClick={() => onFormat?.('code')}
        title="代码"
        aria-label="代码"
      >
        {'</>'}
      </button>
      <div className="toolbar-divider" role="separator" />
      <button
        className="toolbar-btn"
        onClick={() => onFormat?.('h1')}
        title="标题 1"
        aria-label="标题 1"
      >
        H1
      </button>
      <button
        className="toolbar-btn"
        onClick={() => onFormat?.('h2')}
        title="标题 2"
        aria-label="标题 2"
      >
        H2
      </button>
      <button
        className="toolbar-btn"
        onClick={() => onFormat?.('h3')}
        title="标题 3"
        aria-label="标题 3"
      >
        H3
      </button>
    </div>
  );
};

