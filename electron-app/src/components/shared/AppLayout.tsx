import React, { ReactNode } from 'react';
import './AppLayout.css';

export interface AppLayoutProps {
  // 顶栏配置
  title: string;
  subtitle?: string;
  icon?: string;
  
  // 状态指示器（可选）
  statusIndicator?: ReactNode;
  
  // 功能按钮区域
  actions?: ReactNode;
  
  // 主内容区域
  children: ReactNode;
  
  // 底部区域（可选，如 SmartChat 的输入按钮）
  footer?: ReactNode;
  
  // 自定义类名
  className?: string;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  title,
  subtitle,
  icon,
  statusIndicator,
  actions,
  children,
  footer,
  className = '',
}) => {
  return (
    <div className={`app-layout ${className}`}>
      {/* 顶栏 */}
      <div className="app-layout-header">
        <div className="header-left">
          <div className="app-info">
            {icon && <span className="app-icon">{icon}</span>}
            <div className="app-title-group">
              <h2 className="app-title">{title}</h2>
            </div>
          </div>
          {statusIndicator && (
            <div className="status-group">{statusIndicator}</div>
          )}
        </div>
        
        {/* 功能按钮区域 */}
        {actions && (
          <div className="header-right">
            <div className="app-actions">{actions}</div>
          </div>
        )}
      </div>

      {/* 主内容区域 */}
      <div className="app-layout-content">{children}</div>

      {/* 底部区域（可选） */}
      {footer && <div className="app-layout-footer">{footer}</div>}
    </div>
  );
};

