import React, { useState, useEffect } from 'react';
import './HistoryView.css';

interface Record {
  id: string;
  text: string;
  metadata: any;
  app_type?: string;
  created_at: string;
}

type AppFilter = 'all' | 'voice-note' | 'voice-chat' | 'voice-zen';

interface HistoryViewProps {
  records: Record[];
  loading: boolean;
  total: number;
  currentPage: number;
  recordsPerPage: number;
  onLoadRecord: (id: string) => void;
  onDeleteRecords: (ids: string[]) => void;
  onPageChange: (page: number, appFilter?: AppFilter) => void;
  appFilter?: AppFilter;
}

const APP_FILTERS: { value: AppFilter; label: string; icon: string }[] = [
  { value: 'all', label: '全部', icon: '📚' },
  { value: 'voice-note', label: '语音笔记', icon: '📝' },
  { value: 'voice-chat', label: '语音助手', icon: '💬' },
  { value: 'voice-zen', label: '禅', icon: '🧘' },
];

const APP_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  'voice-note': { label: '语音笔记', icon: '📝', color: '#3b82f6' },
  'voice-chat': { label: '语音助手', icon: '💬', color: '#8b5cf6' },
  'voice-zen': { label: '禅', icon: '🧘', color: '#10b981' },
};

export const HistoryView: React.FC<HistoryViewProps> = ({
  records,
  loading,
  total,
  currentPage,
  recordsPerPage,
  onLoadRecord,
  onDeleteRecords,
  onPageChange,
  appFilter = 'all',
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentFilter, setCurrentFilter] = useState<AppFilter>(appFilter);

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

  const handleFilterChange = (filter: AppFilter) => {
    setCurrentFilter(filter);
    setSelectedIds(new Set());  // 切换筛选时清空选中
    onPageChange(1, filter);  // 重置到第一页
  };

  const getAppBadge = (appType?: string) => {
    const config = APP_TYPE_CONFIG[appType || 'voice-note'];
    if (!config) return null;
    
    return (
      <span 
        className="app-badge" 
        style={{ backgroundColor: `${config.color}15`, borderColor: `${config.color}40`, color: config.color }}
      >
        <span className="app-badge-icon">{config.icon}</span>
        <span className="app-badge-text">{config.label}</span>
      </span>
    );
  };

  const totalPages = Math.ceil(total / recordsPerPage);
  const isAllSelected = records.length > 0 && records.every(r => selectedIds.has(r.id));
  const hasSelected = selectedIds.size > 0;

  if (loading) {
    return (
      <div className="history-view">
        <div className="history-container">
          <div className="history-header">
            <div className="history-logo">
              <span className="history-logo-icon">📚</span>
            </div>
            <h1 className="history-title-text">历史记录</h1>
            <p className="history-subtitle">查看和管理您的语音记录</p>
          </div>
          <div className="history-content">
            <div className="history-loading">
              <div className="loading-spinner"></div>
              <div>加载中...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (records.length === 0 && total === 0) {
    return (
      <div className="history-view">
        <div className="history-container">
          <div className="history-header">
            <div className="history-logo">
              <span className="history-logo-icon">📚</span>
            </div>
            <h1 className="history-title-text">历史记录</h1>
            <p className="history-subtitle">查看和管理您的语音记录</p>
          </div>
          <div className="history-content">
            <div className="history-empty">
              <div className="empty-icon">📝</div>
              <div className="empty-title">暂无历史记录</div>
              <div className="empty-description">开始录音后，记录将自动保存</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-view">
      <div className="history-container">
        <div className="history-header">
          <div className="history-logo">
            <span className="history-logo-icon">📚</span>
          </div>
          <h1 className="history-title-text">历史记录</h1>
          <p className="history-subtitle">查看和管理您的语音记录</p>
        </div>

        <div className="history-content">
          <div className="history-stats">
            <h2 className="section-title">记录统计</h2>
            <div className="stats-info">
              共 {total} 条记录
            </div>
          </div>

          {/* 应用筛选器 */}
          <div className="history-section">
            <h2 className="section-title">筛选器</h2>
            <div className="history-filters">
              {APP_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  className={`filter-btn ${currentFilter === filter.value ? 'filter-btn-active' : ''}`}
                  onClick={() => handleFilterChange(filter.value)}
                >
                  <span className="filter-icon">{filter.icon}</span>
                  <span className="filter-label">{filter.label}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="history-section">
            <div className="history-section-header">
              <h2 className="section-title">记录列表</h2>
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
                <div className="history-item-meta">
                  {getAppBadge(record.app_type)}
                  <div className="history-item-date">
                    {new Date(record.created_at).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
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
                  onClick={() => onPageChange(currentPage - 1, currentFilter)}
                  disabled={currentPage === 1}
                >
                  上一页
                </button>
                <div className="history-page-info">
                  第 {currentPage} / {totalPages} 页
                </div>
                <button
                  className="history-page-btn"
                  onClick={() => onPageChange(currentPage + 1, currentFilter)}
                  disabled={currentPage === totalPages}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
