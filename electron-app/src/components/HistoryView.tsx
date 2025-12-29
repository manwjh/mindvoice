import React from 'react';
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
  onLoadRecord: (id: string) => void;
  onDeleteRecord: (id: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  records,
  loading,
  onLoadRecord,
  onDeleteRecord,
}) => {
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

  if (records.length === 0) {
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
        <h2 className="history-title">历史记录</h2>
        <div className="history-count">{records.length} 条记录</div>
      </div>
      <div className="history-list">
        {records.map((record) => (
          <div key={record.id} className="history-item">
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
                <button
                  className="history-btn history-btn-delete"
                  onClick={() => onDeleteRecord(record.id)}
                  title="删除"
                  aria-label={`删除记录 ${record.id}`}
                >
                  删除
                </button>
              </div>
            </div>
            <div className="history-item-content">
              {record.text.length > 150
                ? `${record.text.substring(0, 150)}...`
                : record.text || '(空)'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

