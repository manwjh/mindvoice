/**
 * 会员信息界面
 * 显示会员等级、额度使用情况、消费统计
 */

import React, { useState, useEffect } from 'react';
import './MembershipView.css';

const API_BASE_URL = 'http://127.0.0.1:8765';

interface MembershipViewProps {
  deviceId: string;
}

interface ConsumptionData {
  asr_used_ms: number;
  llm_used_tokens: number;
  year: number;
  month: number;
  reset_at: string;
}

export const MembershipView: React.FC<MembershipViewProps> = ({ deviceId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membershipInfo, setMembershipInfo] = useState<any>(null);
  const [consumption, setConsumption] = useState<ConsumptionData | null>(null);

  useEffect(() => {
    loadMembershipInfo();
    loadConsumption();
  }, [deviceId]);

  const loadMembershipInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/membership/${deviceId}`);
      const data = await response.json();

      if (data.success) {
        setMembershipInfo(data.data);
      } else {
        setError(data.error || '加载会员信息失败');
      }
    } catch (err) {
      console.error('[会员信息] 加载失败:', err);
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const loadConsumption = async () => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      
      const response = await fetch(`${API_BASE_URL}/api/consumption/monthly/${deviceId}?year=${year}&month=${month}`);
      const data = await response.json();

      if (data.success) {
        setConsumption(data.data);
      }
    } catch (err) {
      console.error('[消费信息] 加载失败:', err);
    }
  };

  if (loading) {
    return (
      <div className="membership-view">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="membership-view">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={loadMembershipInfo}>重试</button>
        </div>
      </div>
    );
  }

  if (!membershipInfo) {
    return (
      <div className="membership-view">
        <div className="error-message">没有会员信息</div>
      </div>
    );
  }

  return (
    <div className="membership-view">
      <div className="membership-header">
        <h2>会员信息</h2>
        <div className="tier-badge">{membershipInfo.tier_name || membershipInfo.tier}</div>
      </div>

      <div className="membership-card">
        <div className="info-row">
          <span className="label">会员等级:</span>
          <span className="value">{membershipInfo.tier_name || membershipInfo.tier}</span>
        </div>
        <div className="info-row">
          <span className="label">状态:</span>
          <span className={`value status-${membershipInfo.status}`}>
            {membershipInfo.is_active ? '有效' : '已过期'}
          </span>
        </div>
        {membershipInfo.expires_at && (
          <div className="info-row">
            <span className="label">到期时间:</span>
            <span className="value">{new Date(membershipInfo.expires_at).toLocaleString()}</span>
          </div>
        )}
        {membershipInfo.permanent && (
          <div className="info-row">
            <span className="label">类型:</span>
            <span className="value permanent">永久会员</span>
          </div>
        )}
      </div>

      <div className="quota-section">
        <h3>本月额度使用情况</h3>
        
        {/* ASR 额度 */}
        <div className="quota-item">
          <div className="quota-header">
            <span className="quota-label">🎤 语音识别 (ASR)</span>
            <span className="quota-value">
              {consumption ? (() => {
                const usedMinutes = Math.floor(consumption.asr_used_ms / 60000);
                // 如果有消费但取整为0，显示0.01以便用户看到变化
                return consumption.asr_used_ms > 0 && usedMinutes === 0 ? 0.01 : usedMinutes;
              })() : 0} / {Math.floor((membershipInfo?.quota?.asr_duration_ms_monthly || 0) / 60000)} 分钟
            </span>
          </div>
          <div className="quota-bar">
            <div 
              className="quota-progress" 
              style={{ 
                width: `${Math.min(100, ((consumption?.asr_used_ms || 0) / (membershipInfo?.quota?.asr_duration_ms_monthly || 1)) * 100)}%`,
                backgroundColor: ((consumption?.asr_used_ms || 0) / (membershipInfo?.quota?.asr_duration_ms_monthly || 1)) > 0.9 ? '#f44336' : '#4a90e2'
              }}
            />
          </div>
        </div>

        {/* LLM 额度 */}
        <div className="quota-item">
          <div className="quota-header">
            <span className="quota-label">🤖 AI对话 (LLM)</span>
            <span className="quota-value">
              {consumption ? (() => {
                const usedKTokens = Math.floor(consumption.llm_used_tokens / 1000);
                // 如果有消费但取整为0，显示0.01以便用户看到变化
                return consumption.llm_used_tokens > 0 && usedKTokens === 0 ? 0.01 : usedKTokens;
              })() : 0}K / {Math.floor((membershipInfo?.quota?.llm_tokens_monthly || 0) / 1000)}K tokens
            </span>
          </div>
          <div className="quota-bar">
            <div 
              className="quota-progress" 
              style={{ 
                width: `${Math.min(100, ((consumption?.llm_used_tokens || 0) / (membershipInfo?.quota?.llm_tokens_monthly || 1)) * 100)}%`,
                backgroundColor: ((consumption?.llm_used_tokens || 0) / (membershipInfo?.quota?.llm_tokens_monthly || 1)) > 0.9 ? '#f44336' : '#4caf50'
              }}
            />
          </div>
        </div>

        {consumption && (
          <div className="reset-info">
            <span>📅 下次重置: {new Date(consumption.reset_at).toLocaleDateString('zh-CN')}</span>
          </div>
        )}

        <div className="upgrade-hint">
          <p>💎 点击"激活会员"标签页升级，获取更多额度</p>
        </div>
      </div>
    </div>
  );
};
