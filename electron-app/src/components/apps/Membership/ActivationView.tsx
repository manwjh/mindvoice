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

  const handleActivate = async () => {
    if (!code.trim()) {
      setMessage({ type: 'error', text: '请输入激活码' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/membership/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          activation_code: code.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: '激活成功！' });
        setCode('');
      } else {
        setMessage({ type: 'error', text: data.error || '激活失败' });
      }
    } catch (err) {
      console.error('[激活] 失败:', err);
      setMessage({ type: 'error', text: '网络错误，请稍后重试' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="activation-view">
      <div className="activation-header">
        <h2>激活会员</h2>
        <p className="subtitle">输入激活码升级您的会员等级</p>
      </div>

      <div className="activation-form">
        <div className="form-group">
          <label htmlFor="activation-code">激活码</label>
          <input
            id="activation-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="例如：VIP-1-XXXX-XXXX"
            disabled={loading}
          />
          <p className="hint">激活码格式：TIER-MONTHS-XXXX-XXXX</p>
        </div>

        <button
          className="btn-activate"
          onClick={handleActivate}
          disabled={loading || !code.trim()}
        >
          {loading ? '激活中...' : '激活'}
        </button>

        {message && (
          <div className={`message message-${message.type}`}>
            {message.text}
          </div>
        )}
      </div>

      <div className="activation-info">
        <h3>如何获取激活码？</h3>
        <ul>
          <li>联系客服购买激活码</li>
          <li>参与活动获取免费激活码</li>
          <li>推荐好友获得奖励激活码</li>
        </ul>
        <div className="contact-info">
          <strong>联系方式:</strong> manwjh@126.com
        </div>
      </div>
    </div>
  );
};
