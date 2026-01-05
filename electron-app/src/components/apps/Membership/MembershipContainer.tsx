/**
 * 会员管理容器组件
 * 
 * 整合会员信息、激活码和用户资料三个子界面
 */

import React, { useState, useEffect } from 'react';
import { MembershipView } from './MembershipView';
import { ActivationView } from './ActivationView';
import { UserProfileView } from './UserProfileView';
import './MembershipContainer.css';

type MembershipTab = 'info' | 'activation' | 'profile';

export const MembershipContainer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MembershipTab>('info');
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    // 从 Electron 获取设备ID
    const getDeviceId = async () => {
      try {
        if (window.electronAPI?.getDeviceInfo) {
          const deviceInfo = await window.electronAPI.getDeviceInfo();
          console.log('[会员容器] 获取到设备信息:', deviceInfo);
          if (deviceInfo && deviceInfo.deviceId) {
            setDeviceId(deviceInfo.deviceId);
          } else {
            console.error('[会员容器] 设备信息为空或格式错误');
          }
        } else {
          console.error('[会员容器] electronAPI.getDeviceInfo 不可用');
        }
      } catch (error) {
        console.error('[会员容器] 获取设备ID失败:', error);
      }
    };

    getDeviceId();
  }, []);

  return (
    <div className="membership-container">
      <div className="membership-tabs">
        <button
          className={`tab-button ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          <span className="tab-icon">💎</span>
          <span className="tab-label">会员信息</span>
        </button>
        <button
          className={`tab-button ${activeTab === 'activation' ? 'active' : ''}`}
          onClick={() => setActiveTab('activation')}
        >
          <span className="tab-icon">🎫</span>
          <span className="tab-label">激活会员</span>
        </button>
        <button
          className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <span className="tab-icon">👤</span>
          <span className="tab-label">个人资料</span>
        </button>
      </div>

      <div className="membership-content">
        {activeTab === 'info' && deviceId && (
          <MembershipView deviceId={deviceId} />
        )}
        {activeTab === 'activation' && deviceId && (
          <ActivationView deviceId={deviceId} />
        )}
        {activeTab === 'profile' && deviceId && (
          <UserProfileView deviceId={deviceId} />
        )}
        {!deviceId && (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>正在加载设备信息...</p>
          </div>
        )}
      </div>
    </div>
  );
};

