/**
 * 激活码激活界面
 */

import React, { useState } from 'react';
import './ActivationView.css';

const API_BASE_URL = 'http://127.0.0.1:8765';

interface ActivationViewProps {
  deviceId: string;
}

export const ActivationView: React.FC<ActivationViewProps> = ({ deviceId }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showUserId, setShowUserId] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // 获取 user_id
  React.useEffect(() => {
    const fetchUserId = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/user/profile/${deviceId}`);
        const data = await response.json();
        if (data.success && data.data) {
          setUserId(data.data.user_id);
        }
      } catch (err) {
        console.error('[激活] 获取用户ID失败:', err);
      }
    };
    fetchUserId();
  }, [deviceId]);

  // 复制用户ID
  const handleCopyUserId = () => {
    if (userId) {
      navigator.clipboard.writeText(userId).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      });
    }
  };

  const handleActivate = async () => {
    // 激活码功能未实现
    setMessage({ 
      type: 'error', 
      text: '激活码功能暂未实现' 
    });
  };

  return (
    <div className="activation-view">
      <div className="activation-card">
        <div className="activation-header">
          <h2>激活会员</h2>
        </div>

        <div className="activation-form">
          {/* 用户ID信息栏 */}
          <div className="user-id-section">
            <div className="input-group">
              <label htmlFor="user-id">用户ID</label>
              <div className="user-id-input-wrapper">
                <input
                  id="user-id"
                  type={showUserId ? 'text' : 'password'}
                  className="user-id-input"
                  value={userId || '加载中...'}
                  readOnly
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowUserId(!showUserId)}
                  title={showUserId ? '隐藏' : '显示'}
                >
                  {showUserId ? '👁️' : '🔒'}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={handleCopyUserId}
                  disabled={!userId}
                  title="复制"
                >
                  {copySuccess ? '✅' : '📋'}
                </button>
              </div>
            </div>
            <div className="security-warning">
              ⚠️ 这是你的唯一身份标识，请勿泄露给他人
            </div>
          </div>

          {/* 激活码部分说明 */}
          <p className="activation-subtitle">输入激活码升级您的会员等级</p>

          {/* 激活码输入 */}
          <div className="input-group">
            <input
              id="activation-code"
              type="text"
              className="activation-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="例如：VIP-1-XXXX-XXXX"
              disabled={loading}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && code.trim() && !loading) {
                  handleActivate();
                }
              }}
            />
            <p className="input-hint">激活码格式：TIER-MONTHS-XXXX-XXXX</p>
          </div>

          {message && (
            <div className={`message ${message.type === 'error' ? 'error-message' : 'success-message'}`}>
              {message.text}
            </div>
          )}

          <div className="button-group">
            <button
              className="activate-btn"
              onClick={handleActivate}
              disabled={loading || !code.trim()}
            >
              {loading ? '激活中...' : '立即激活'}
            </button>
          </div>
        </div>

        <div className="help-section">
          <h4>说明</h4>
          <p>激活码功能暂未实现，敬请期待。</p>
        </div>
      </div>
    </div>
  );
};
