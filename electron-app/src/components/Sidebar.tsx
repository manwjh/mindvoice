import React from 'react';
import './Sidebar.css';

interface SidebarProps {
  activeView: 'workspace' | 'history' | 'settings';
  onViewChange: (view: 'workspace' | 'history' | 'settings') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="logo-icon">🎤</span>
          <span className="logo-text">MindVoice</span>
        </div>
      </div>
      
      <div className="sidebar-content">
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeView === 'workspace' ? 'active' : ''}`}
            onClick={() => onViewChange('workspace')}
            aria-label="工作区"
            aria-current={activeView === 'workspace' ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden="true">📝</span>
            <span className="nav-text">工作区</span>
          </button>
          
          <button
            className={`nav-item ${activeView === 'history' ? 'active' : ''}`}
            onClick={() => onViewChange('history')}
            aria-label="历史记录"
            aria-current={activeView === 'history' ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden="true">📚</span>
            <span className="nav-text">历史记录</span>
          </button>
          
          <button
            className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => onViewChange('settings')}
            aria-label="设置"
            aria-current={activeView === 'settings' ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden="true">⚙️</span>
            <span className="nav-text">设置</span>
          </button>
        </nav>
      </div>
    </div>
  );
};

