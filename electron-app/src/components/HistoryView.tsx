import React, { useState, useEffect } from 'react';
import './HistoryView.css';

interface Record {
  id: string;
  text: string;
  metadata: any;
  created_at: string;
}

interface HistoryViewProps {
  records: Record[];
  loading: boolean;
  total: number;
  currentPage: number;
  recordsPerPage: number;
  onLoadRecord: (id: string) => void;
  onDeleteRecords: (ids: string[]) => void;
  onPageChange: (page: number) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  records,
  loading,
  total,
  currentPage,
  recordsPerPage,
  onLoadRecord,
  onDeleteRecords,
  onPageChange,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 当记录变化时，清除不在当前页的选中项
  useEffect(() => {
    const currentRecordIds = new Set(records.map(r => r.id));
    setSelectedIds(prev => {
      const newSet = new Set<string>();
      prev.forEach(id => {
        if (currentRecordIds.has(id)) {
          newSet.add(id);
        }
      });
      return newSet;
    });
  }, [records]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(records.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRecord = (recordId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(recordId);
      } else {
        newSet.delete(recordId);
      }
      return newSet;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) {
      return;
    }
    if (window.confirm(`确定要删除选中的 ${selectedIds.size} 条记录吗？此操作不可撤销。`)) {
      onDeleteRecords(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const totalPages = Math.ceil(total / recordsPerPage);
  const isAllSelected = records.length > 0 && records.every(r => selectedIds.has(r.id));
  const hasSelected = selectedIds.size > 0;

  if (loading) {
    return (
      <div className="history-view">
        <div className="history-loading">
          <div className="loading-spinner"></div>
          <div>加载中...</div>
        </div>
      </div>
    );
  }

  if (records.length === 0 && total === 0) {
    return (
      <div className="history-view">
        <div className="history-empty">
          <div className="empty-icon">📚</div>
          <div className="empty-title">暂无历史记录</div>
          <div className="empty-description">开始录音后，记录将自动保存</div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-view">
      <div className="history-header">
        <div className="history-header-left">
          <h2 className="history-title">历史记录</h2>
          <div className="history-count">{total} 条记录</div>
        </div>
      </div>
      
      <div className="history-toolbar">
        <label className="history-checkbox-label">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={(e) => handleSelectAll(e.target.checked)}
            className="history-checkbox"
          />
          <span>全选</span>
        </label>
        {hasSelected && (
          <button
            className="history-btn history-btn-delete-batch"
            onClick={handleDeleteSelected}
            title={`删除选中的 ${selectedIds.size} 条记录`}
          >
            删除选中 ({selectedIds.size})
          </button>
        )}
      </div>

      <div className="history-list">
        {records.map((record) => (
          <div key={record.id} className={`history-item ${selectedIds.has(record.id) ? 'history-item-selected' : ''}`}>
            <div className="history-item-checkbox">
              <input
                type="checkbox"
                checked={selectedIds.has(record.id)}
                onChange={(e) => handleSelectRecord(record.id, e.target.checked)}
                className="history-checkbox"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="history-item-content-wrapper">
              <div className="history-item-header">
                <div className="history-item-date">
                  {new Date(record.created_at).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div className="history-item-actions">
                  <button
                    className="history-btn history-btn-load"
                    onClick={() => onLoadRecord(record.id)}
                    title="查看"
                    aria-label={`查看记录 ${record.id}`}
                  >
                    查看
                  </button>
                </div>
              </div>
              <div className="history-item-content">
                {record.text.length > 150
                  ? `${record.text.substring(0, 150)}...`
                  : record.text || '(空)'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="history-pagination">
          <button
            className="history-page-btn"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            上一页
          </button>
          <div className="history-page-info">
            第 {currentPage} / {totalPages} 页
          </div>
          <button
            className="history-page-btn"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
};
