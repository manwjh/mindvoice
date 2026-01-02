import React, { useState, useEffect } from 'react';
import './SettingsView.css';

const API_BASE_URL = 'http://127.0.0.1:8765';

interface AudioDevice {
  id: number;
  name: string;
  channels: number;
  samplerate: number;
  hostapi: number;
}

interface ASRConfig {
  base_url: string;
  app_id: string;
  app_key: string;
  access_key: string;
  language: string;
}

interface SettingsViewProps {
  apiConnected: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ apiConnected }) => {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [currentDevice, setCurrentDevice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  // ASR配置相关状态
  const [asrConfigSource, setAsrConfigSource] = useState<'user' | 'vendor'>('vendor');
  const [currentAsrConfig, setCurrentAsrConfig] = useState<ASRConfig | null>(null);
  const [vendorAsrConfig, setVendorAsrConfig] = useState<ASRConfig | null>(null);
  const [userAsrConfig, setUserAsrConfig] = useState<ASRConfig>({
    base_url: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
    app_id: '',
    app_key: '',
    access_key: '',
    language: 'zh-CN'
  });
  const [asrLoading, setAsrLoading] = useState(false);
  const [asrSaving, setAsrSaving] = useState(false);

  // 加载音频设备列表
  const loadDevices = async (forceRefresh: boolean = false) => {
    if (!apiConnected) return;
    
    setLoading(true);
    try {
      // 添加 refresh 查询参数以支持强制刷新设备列表
      const url = forceRefresh 
        ? `${API_BASE_URL}/api/audio/devices?refresh=true`
        : `${API_BASE_URL}/api/audio/devices`;
      
      const response = await fetch(url);
      const data = await response.json();
      if (data.success) {
        setDevices(data.devices);
        setCurrentDevice(data.current_device);
        if (forceRefresh) {
          setMessage({ text: '设备列表已刷新', type: 'success' });
          setTimeout(() => setMessage(null), 3000);
        }
      } else {
        setMessage({ text: '加载设备列表失败', type: 'error' });
      }
    } catch (e) {
      setMessage({ text: `加载设备列表失败: ${e}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 设置音频设备
  const handleDeviceChange = async (deviceId: number | null) => {
    if (!apiConnected) {
      setMessage({ text: 'API未连接', type: 'error' });
      return;
    }

    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/audio/device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device: deviceId }),
      });
      
      const data = await response.json();
      if (data.success) {
        setCurrentDevice(deviceId);
        setMessage({ text: data.message || '设备设置成功', type: 'success' });
        // 3秒后清除成功消息
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ text: data.message || '设置设备失败', type: 'error' });
      }
    } catch (e) {
      setMessage({ text: `设置设备失败: ${e}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // 加载ASR配置
  const loadASRConfig = async () => {
    if (!apiConnected) return;
    
    setAsrLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/asr/config`);
      const data = await response.json();
      if (data.success) {
        setAsrConfigSource(data.config_source);
        setCurrentAsrConfig(data.current_config);
        setVendorAsrConfig(data.vendor_config);
        // 如果当前使用用户配置，加载用户配置值（注意：敏感信息已隐藏）
        if (data.config_source === 'user') {
          // 用户配置值需要从当前配置获取（但敏感信息已隐藏，所以需要用户重新输入）
          setUserAsrConfig({
            base_url: data.current_config.base_url || '',
            app_id: data.current_config.app_id || '',
            app_key: '', // 敏感信息已隐藏，需要用户重新输入
            access_key: '', // 敏感信息已隐藏，需要用户重新输入
            language: data.current_config.language || 'zh-CN'
          });
        } else {
          // 使用厂商配置时，可以预填表单
          setUserAsrConfig({
            base_url: data.vendor_config.base_url || '',
            app_id: data.vendor_config.app_id || '',
            app_key: '',
            access_key: '',
            language: data.vendor_config.language || 'zh-CN'
          });
        }
      } else {
        setMessage({ text: '加载ASR配置失败', type: 'error' });
      }
    } catch (e) {
      setMessage({ text: `加载ASR配置失败: ${e}`, type: 'error' });
    } finally {
      setAsrLoading(false);
    }
  };

  // 保存ASR配置
  const handleSaveASRConfig = async () => {
    if (!apiConnected) {
      setMessage({ text: 'API未连接', type: 'error' });
      return;
    }

    setAsrSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/asr/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          use_user_config: asrConfigSource === 'user',
          config: asrConfigSource === 'user' ? userAsrConfig : undefined
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        setMessage({ text: data.message || 'ASR配置保存成功', type: 'success' });
        setTimeout(() => setMessage(null), 3000);
        // 重新加载配置
        await loadASRConfig();
      } else {
        setMessage({ text: data.message || '保存ASR配置失败', type: 'error' });
      }
    } catch (e) {
      setMessage({ text: `保存ASR配置失败: ${e}`, type: 'error' });
    } finally {
      setAsrSaving(false);
    }
  };

  useEffect(() => {
    if (apiConnected) {
      loadDevices();
      loadASRConfig();
    }
  }, [apiConnected]);

  return (
    <div className="settings-view">
      <div className="settings-container">
        <div className="settings-header">
          <div className="settings-logo">
            <span className="settings-logo-icon">⚙️</span>
          </div>
          <h1 className="settings-title">设置</h1>
          <p className="settings-subtitle">配置应用参数</p>
        </div>

        <div className="settings-content">
          {message && (
            <div className={`settings-message settings-message-${message.type}`}>
              {message.text}
            </div>
          )}

          <div className="settings-section">
            <div className="settings-section-header">
              <h2 className="section-title">音频源</h2>
              <button
                className="settings-btn-icon settings-btn-refresh-icon"
                onClick={() => loadDevices(true)}
                disabled={loading || !apiConnected}
                title={loading ? '加载中...' : '刷新设备列表'}
              >
                <svg 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                  className={loading ? 'rotating' : ''}
                >
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
              </button>
            </div>
            <p className="settings-section-description">
              选择用于语音输入的音频设备
            </p>
          
          {loading ? (
            <div className="settings-loading">
              <div className="loading-spinner"></div>
              <span>加载设备列表中...</span>
            </div>
          ) : devices.length === 0 ? (
            <div className="settings-empty">
              <p>未找到音频输入设备</p>
            </div>
          ) : (
            <div className="settings-device-list">
              <label className="settings-device-item">
                <input
                  type="radio"
                  name="audio-device"
                  value="default"
                  checked={currentDevice === null}
                  onChange={() => handleDeviceChange(null)}
                  disabled={saving || !apiConnected}
                />
                <div className="settings-device-info">
                  <div className="settings-device-name">默认设备</div>
                  <div className="settings-device-desc">使用系统默认音频输入设备</div>
                </div>
                {currentDevice === null && (
                  <div className="settings-device-check">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.1"/>
                      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </label>
              
              {devices.map((device) => (
                <label key={device.id} className="settings-device-item">
                  <input
                    type="radio"
                    name="audio-device"
                    value={device.id}
                    checked={currentDevice === device.id}
                    onChange={() => handleDeviceChange(device.id)}
                    disabled={saving || !apiConnected}
                  />
                  <div className="settings-device-info">
                    <div className="settings-device-name">{device.name}</div>
                    <div className="settings-device-desc">
                      {device.channels} 声道, {Math.round(device.samplerate)} Hz
                    </div>
                  </div>
                  {currentDevice === device.id && (
                    <div className="settings-device-check">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.1"/>
                        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </label>
              ))}
            </div>
          )}
          </div>

          <div className="settings-section">
          <h2 className="section-title">ASR模型配置</h2>
          <p className="settings-section-description">
            配置语音识别模型的参数。可以选择使用厂商默认配置或自定义配置。
          </p>
          
          {asrLoading ? (
            <div className="settings-loading">
              <div className="loading-spinner"></div>
              <span>加载ASR配置中...</span>
            </div>
          ) : (
            <>
              <div className="settings-config-source">
                <label className="settings-config-source-item">
                  <input
                    type="radio"
                    name="asr-config-source"
                    value="vendor"
                    checked={asrConfigSource === 'vendor'}
                    onChange={() => setAsrConfigSource('vendor')}
                    disabled={asrSaving || !apiConnected}
                  />
                  <div className="settings-config-source-info">
                    <div className="settings-config-source-name">使用厂商配置</div>
                    <div className="settings-config-source-desc">
                      使用 config.yml 中的默认配置
                    </div>
                  </div>
                </label>
                
                <label className="settings-config-source-item">
                  <input
                    type="radio"
                    name="asr-config-source"
                    value="user"
                    checked={asrConfigSource === 'user'}
                    onChange={() => setAsrConfigSource('user')}
                    disabled={asrSaving || !apiConnected}
                  />
                  <div className="settings-config-source-info">
                    <div className="settings-config-source-name">使用自定义配置</div>
                    <div className="settings-config-source-desc">
                      使用用户自定义的配置参数
                    </div>
                  </div>
                </label>
              </div>

              {asrConfigSource === 'user' && (
                <div className="settings-form">
                  <div className="settings-form-group">
                    <label className="settings-form-label">
                      Base URL
                      <span className="settings-form-required">*</span>
                    </label>
                    <input
                      type="text"
                      className="settings-form-input"
                      value={userAsrConfig.base_url}
                      onChange={(e) => setUserAsrConfig({ ...userAsrConfig, base_url: e.target.value })}
                      placeholder="wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
                      disabled={asrSaving || !apiConnected}
                    />
                  </div>

                  <div className="settings-form-group">
                    <label className="settings-form-label">
                      App ID
                      <span className="settings-form-required">*</span>
                    </label>
                    <input
                      type="text"
                      className="settings-form-input"
                      value={userAsrConfig.app_id}
                      onChange={(e) => setUserAsrConfig({ ...userAsrConfig, app_id: e.target.value })}
                      placeholder="请输入 App ID"
                      disabled={asrSaving || !apiConnected}
                    />
                  </div>

                  <div className="settings-form-group">
                    <label className="settings-form-label">
                      App Key
                      <span className="settings-form-required">*</span>
                    </label>
                    <input
                      type="password"
                      className="settings-form-input"
                      value={userAsrConfig.app_key}
                      onChange={(e) => setUserAsrConfig({ ...userAsrConfig, app_key: e.target.value })}
                      placeholder="请输入 App Key"
                      disabled={asrSaving || !apiConnected}
                    />
                  </div>

                  <div className="settings-form-group">
                    <label className="settings-form-label">
                      Access Key
                      <span className="settings-form-required">*</span>
                    </label>
                    <input
                      type="password"
                      className="settings-form-input"
                      value={userAsrConfig.access_key}
                      onChange={(e) => setUserAsrConfig({ ...userAsrConfig, access_key: e.target.value })}
                      placeholder="请输入 Access Key"
                      disabled={asrSaving || !apiConnected}
                    />
                  </div>

                  <div className="settings-form-group">
                    <label className="settings-form-label">识别语言</label>
                    <select
                      className="settings-form-input"
                      value={userAsrConfig.language}
                      onChange={(e) => setUserAsrConfig({ ...userAsrConfig, language: e.target.value })}
                      disabled={asrSaving || !apiConnected}
                    >
                      <option value="zh-CN">中文（简体）</option>
                      <option value="en-US">English</option>
                    </select>
                  </div>
                </div>
              )}

              {asrConfigSource === 'vendor' && currentAsrConfig && (
                <div className="settings-config-preview">
                  <div className="settings-config-preview-item">
                    <span className="settings-config-preview-label">Base URL:</span>
                    <span className="settings-config-preview-value">{currentAsrConfig.base_url}</span>
                  </div>
                  <div className="settings-config-preview-item">
                    <span className="settings-config-preview-label">App ID:</span>
                    <span className="settings-config-preview-value">{currentAsrConfig.app_id || '未设置'}</span>
                  </div>
                  <div className="settings-config-preview-item">
                    <span className="settings-config-preview-label">App Key:</span>
                    <span className="settings-config-preview-value">{currentAsrConfig.app_key || '未设置'}</span>
                  </div>
                  <div className="settings-config-preview-item">
                    <span className="settings-config-preview-label">Access Key:</span>
                    <span className="settings-config-preview-value">{currentAsrConfig.access_key || '未设置'}</span>
                  </div>
                  <div className="settings-config-preview-item">
                    <span className="settings-config-preview-label">语言:</span>
                    <span className="settings-config-preview-value">{currentAsrConfig.language}</span>
                  </div>
                </div>
              )}

              <div className="settings-actions">
                <button
                  className="settings-btn settings-btn-primary"
                  onClick={handleSaveASRConfig}
                  disabled={asrSaving || !apiConnected || (asrConfigSource === 'user' && (!userAsrConfig.app_id || !userAsrConfig.app_key || !userAsrConfig.access_key))}
                >
                  {asrSaving ? '保存中...' : '保存配置'}
                </button>
                <button
                  className="settings-btn settings-btn-refresh"
                  onClick={loadASRConfig}
                  disabled={asrLoading || !apiConnected}
                >
                  {asrLoading ? '加载中...' : '刷新配置'}
                </button>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

