import React, { useState, useRef, useEffect } from 'react';
import './Sidebar.css';

export type AppView = 'voice-note' | 'smart-chat' | 'knowledge-base' | 'voice-zen' | 'membership' | 'history' | 'settings' | 'about';

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

// 声明 electronAPI 类型
declare global {
  interface Window {
    electronAPI?: {
      setLandscapeMode: () => Promise<void>;
      setPortraitMode: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      quitApp: () => Promise<void>;
    };
  }
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [menuOpen]);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

  const handleSetPortrait = async () => {
    if (window.electronAPI) {
      await window.electronAPI.setPortraitMode();
    }
    setMenuOpen(false);
  };

  const handleSetLandscape = async () => {
    if (window.electronAPI) {
      await window.electronAPI.setLandscapeMode();
    }
    setMenuOpen(false);
  };

  const handleMaximize = async () => {
    if (window.electronAPI) {
      await window.electronAPI.maximizeWindow();
    }
    setMenuOpen(false);
  };

  const handleClose = async () => {
    if (window.electronAPI) {
      await window.electronAPI.closeWindow();
    }
    setMenuOpen(false);
  };

  const handleQuit = async () => {
    if (window.electronAPI) {
      await window.electronAPI.quitApp();
    }
    setMenuOpen(false);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo" ref={menuRef}>
          <button 
            className="menu-icon-button"
            onClick={handleMenuClick}
            aria-label="窗口菜单"
            title="窗口菜单"
          >
            <span className="menu-icon">☰</span>
          </button>
          {menuOpen && (
            <div className="window-menu">
              <button className="window-menu-item" onClick={handleSetPortrait}>
                <span className="menu-item-icon">📱</span>
                <span>Portrait</span>
              </button>
              <button className="window-menu-item" onClick={handleSetLandscape}>
                <span className="menu-item-icon">🖥️</span>
                <span>Landscape</span>
              </button>
              <button className="window-menu-item" onClick={handleMaximize}>
                <span className="menu-item-icon">⛶</span>
                <span>Maximize</span>
              </button>
              
              <div className="window-menu-divider"></div>
              <button className="window-menu-item" onClick={handleClose}>
                <span className="menu-item-icon">⬇</span>
                <span>Hide Window</span>
              </button>
              <button className="window-menu-item" onClick={handleQuit}>
                <span className="menu-item-icon">✕</span>
                <span>Quit</span>
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="sidebar-content">
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeView === 'voice-note' ? 'active' : ''}`}
            onClick={() => onViewChange('voice-note')}
            aria-label="语音笔记"
            aria-current={activeView === 'voice-note' ? 'page' : undefined}
            title="语音笔记"
          >
            <span className="nav-icon" aria-hidden="true">📝</span>
          </button>
          
          <button
            className={`nav-item ${activeView === 'smart-chat' ? 'active' : ''}`}
            onClick={() => onViewChange('smart-chat')}
            aria-label="智能助手"
            aria-current={activeView === 'smart-chat' ? 'page' : undefined}
            title="智能助手 - 支持知识库检索"
          >
            <span className="nav-icon" aria-hidden="true">💬</span>
          </button>
          
          <button
            className={`nav-item ${activeView === 'voice-zen' ? 'active' : ''}`}
            onClick={() => onViewChange('voice-zen')}
            aria-label="禅"
            aria-current={activeView === 'voice-zen' ? 'page' : undefined}
            title="禅 - 与一禅小和尚对话"
          >
            <span className="nav-icon" aria-hidden="true">🧘</span>
          </button>
          
          <div className="nav-divider"></div>
          
          <button
            className={`nav-item ${activeView === 'knowledge-base' ? 'active' : ''}`}
            onClick={() => onViewChange('knowledge-base')}
            aria-label="知识库"
            aria-current={activeView === 'knowledge-base' ? 'page' : undefined}
            title="知识库管理"
          >
            <span className="nav-icon" aria-hidden="true">📚</span>
          </button>
          
          <button
            className={`nav-item ${activeView === 'membership' ? 'active' : ''}`}
            onClick={() => onViewChange('membership')}
            aria-label="会员"
            aria-current={activeView === 'membership' ? 'page' : undefined}
            title="会员信息与管理"
          >
            <span className="nav-icon" aria-hidden="true">👤</span>
          </button>
          
          <button
            className={`nav-item ${activeView === 'history' ? 'active' : ''}`}
            onClick={() => onViewChange('history')}
            aria-label="历史记录"
            aria-current={activeView === 'history' ? 'page' : undefined}
            title="历史记录"
          >
            <span className="nav-icon" aria-hidden="true">📋</span>
          </button>
          
          <button
            className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => onViewChange('settings')}
            aria-label="设置"
            aria-current={activeView === 'settings' ? 'page' : undefined}
            title="设置"
          >
            <span className="nav-icon" aria-hidden="true">⚙️</span>
          </button>
          
          <button
            className={`nav-item ${activeView === 'about' ? 'active' : ''}`}
            onClick={() => onViewChange('about')}
            aria-label="关于"
            aria-current={activeView === 'about' ? 'page' : undefined}
            title="关于"
          >
            <span className="nav-icon" aria-hidden="true">ℹ️</span>
          </button>
        </nav>
      </div>
    </div>
  );
};

