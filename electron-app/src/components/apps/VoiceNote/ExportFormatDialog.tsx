import React from 'react';
import './ExportFormatDialog.css';

export type ExportFormat = 'zip' | 'html';

interface ExportFormatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (format: ExportFormat) => void;
}

export const ExportFormatDialog: React.FC<ExportFormatDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [selectedFormat, setSelectedFormat] = React.useState<ExportFormat>('zip');

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
    <div className="export-dialog-backdrop" onClick={handleBackdropClick}>
      <div className="export-dialog">
        <div className="export-dialog-header">
          <h3>选择导出格式</h3>
          <button className="export-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="export-dialog-body">
          <label className={`export-format-option ${selectedFormat === 'zip' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="export-format"
              value="zip"
              checked={selectedFormat === 'zip'}
              onChange={() => setSelectedFormat('zip')}
            />
            <div className="export-format-content">
              <div className="export-format-icon">📦</div>
              <div className="export-format-info">
                <div className="export-format-title">ZIP 打包（推荐）</div>
                <div className="export-format-desc">
                  Markdown + 图片文件夹<br />
                  <span className="export-format-pros">✓ 文件体积小</span>
                  <span className="export-format-pros">✓ 可编辑</span>
                </div>
              </div>
            </div>
          </label>

          <label className={`export-format-option ${selectedFormat === 'html' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="export-format"
              value="html"
              checked={selectedFormat === 'html'}
              onChange={() => setSelectedFormat('html')}
            />
            <div className="export-format-content">
              <div className="export-format-icon">🌐</div>
              <div className="export-format-info">
                <div className="export-format-title">HTML 单文件</div>
                <div className="export-format-desc">
                  图片嵌入，浏览器直接打开<br />
                  <span className="export-format-pros">✓ 单文件</span>
                  <span className="export-format-pros">✓ 美观</span>
                  <span className="export-format-cons">✗ 文件较大</span>
                </div>
              </div>
            </div>
          </label>
        </div>

        <div className="export-dialog-footer">
          <button className="export-dialog-btn export-dialog-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button className="export-dialog-btn export-dialog-btn-confirm" onClick={handleConfirm}>
            确定导出
          </button>
        </div>
      </div>
    </div>
  );
};

