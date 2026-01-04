import React from 'react';
import './CopyFormatDialog.css';

export type CopyFormat = 'plain' | 'rich';

interface CopyFormatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (format: CopyFormat) => void;
}

export const CopyFormatDialog: React.FC<CopyFormatDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [selectedFormat, setSelectedFormat] = React.useState<CopyFormat>('plain');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(selectedFormat);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="copy-dialog-backdrop" onClick={handleBackdropClick}>
      <div className="copy-dialog">
        <div className="copy-dialog-header">
          <h3>选择复制格式</h3>
          <button className="copy-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="copy-dialog-body">
          <label className={`copy-format-option ${selectedFormat === 'plain' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="copy-format"
              value="plain"
              checked={selectedFormat === 'plain'}
              onChange={() => setSelectedFormat('plain')}
            />
            <div className="copy-format-content">
              <div className="copy-format-icon">📋</div>
              <div className="copy-format-info">
                <div className="copy-format-title">纯文本</div>
                <div className="copy-format-desc">
                  仅复制文字内容，不含格式<br />
                  <span className="copy-format-pros">✓ 兼容性最好</span>
                  <span className="copy-format-pros">✓ 适合代码编辑器</span>
                </div>
              </div>
            </div>
          </label>

          <label className={`copy-format-option ${selectedFormat === 'rich' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="copy-format"
              value="rich"
              checked={selectedFormat === 'rich'}
              onChange={() => setSelectedFormat('rich')}
            />
            <div className="copy-format-content">
              <div className="copy-format-icon">📄</div>
              <div className="copy-format-info">
                <div className="copy-format-title">富文本</div>
                <div className="copy-format-desc">
                  保留格式和图片（Base64）<br />
                  <span className="copy-format-pros">✓ 格式完整</span>
                  <span className="copy-format-pros">✓ 含图片</span>
                  <span className="copy-format-cons">✗ 部分论坛不支持</span>
                </div>
              </div>
            </div>
          </label>
        </div>

        <div className="copy-dialog-footer">
          <button className="copy-dialog-btn copy-dialog-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button className="copy-dialog-btn copy-dialog-btn-confirm" onClick={handleConfirm}>
            确定复制
          </button>
        </div>
      </div>
    </div>
  );
};

