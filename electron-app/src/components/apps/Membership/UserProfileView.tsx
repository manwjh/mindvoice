/**
 * 用户信息管理界面
 * 
 * 功能：
 * - 显示和编辑用户昵称、邮箱、个人简介
 * - 上传和更换头像
 * - 保存用户信息到后端
 */

import React, { useState, useEffect } from 'react';
import './UserProfileView.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';

interface UserProfile {
  user_id: string;
  device_id: string;
  nickname?: string;
  email?: string;
  bio?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

interface UserProfileViewProps {
  deviceId: string;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({ deviceId }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // 表单状态
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // 加载用户信息
  useEffect(() => {
    loadProfile();
  }, [deviceId]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/profile/${deviceId}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        setProfile(data.data);
        setNickname(data.data.nickname || '');
        setEmail(data.data.email || '');
        setBio(data.data.bio || '');
        if (data.data.avatar_url) {
          setAvatarPreview(`${API_BASE_URL}/${data.data.avatar_url}`);
        }
      }
    } catch (error) {
      console.error('[用户信息] 加载失败:', error);
      showMessage('error', '加载用户信息失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小（最大5MB）
    if (file.size > 5 * 1024 * 1024) {
      showMessage('error', '头像文件不能超过5MB');
      return;
    }

    // 检查文件类型
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      showMessage('error', '头像只支持 PNG、JPG、JPEG 格式');
      return;
    }

    // 读取文件并预览
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result as string;
      setAvatarPreview(base64Data);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // 准备请求数据
      const requestData: any = {
        device_id: deviceId,
        nickname: nickname.trim() || undefined,
        email: email.trim() || undefined,
        bio: bio.trim() || undefined,
      };

      // 如果有新头像，先上传
      if (avatarPreview && avatarPreview.startsWith('data:')) {
        const avatarResponse = await fetch(`${API_BASE_URL}/api/images/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_data: avatarPreview }),
        });

        const avatarData = await avatarResponse.json();
        if (avatarData.success) {
          requestData.avatar_url = avatarData.image_url;
        }
      }

      // 保存用户信息
      const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', '保存成功');
        await loadProfile(); // 重新加载
      } else {
        showMessage('error', data.error || '保存失败');
      }
    } catch (error) {
      console.error('[用户信息] 保存失败:', error);
      showMessage('error', '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="user-profile-view">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="user-profile-view">
      <div className="profile-header">
        <h2>用户信息</h2>
        <p className="subtitle">管理您的个人资料</p>
      </div>

      <div className="profile-form">
        {/* 头像 */}
        <div className="form-group avatar-group">
          <label>头像</label>
          <div className="avatar-upload">
            <div className="avatar-preview">
              {avatarPreview ? (
                <img src={avatarPreview} alt="头像" />
              ) : (
                <div className="avatar-placeholder">
                  <span>{nickname?.[0]?.toUpperCase() || '?'}</span>
                </div>
              )}
            </div>
            <div className="avatar-actions">
              <input
                type="file"
                id="avatar-input"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleAvatarChange}
                style={{ display: 'none' }}
              />
              <label htmlFor="avatar-input" className="btn-upload">
                选择图片
              </label>
              <p className="hint">支持 PNG、JPG，最大 5MB</p>
            </div>
          </div>
        </div>

        {/* 昵称 */}
        <div className="form-group">
          <label htmlFor="nickname">昵称</label>
          <input
            id="nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="请输入昵称"
            maxLength={50}
          />
          <p className="hint">{nickname.length}/50</p>
        </div>

        {/* 邮箱 */}
        <div className="form-group">
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱（选填）"
          />
        </div>

        {/* 个人简介 */}
        <div className="form-group">
          <label htmlFor="bio">个人简介</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="介绍一下自己..."
            maxLength={500}
            rows={4}
          />
          <p className="hint">{bio.length}/500</p>
        </div>

        {/* 保存按钮 */}
        <div className="form-actions">
          <button
            className="btn-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>

        {/* 消息提示 */}
        {message && (
          <div className={`message message-${message.type}`}>
            {message.text}
          </div>
        )}
      </div>

      {/* 账户信息 */}
      {profile && (
        <div className="account-info">
          <h3>账户信息</h3>
          <div className="info-item">
            <span className="label">用户ID:</span>
            <span className="value">{profile.user_id}</span>
          </div>
          <div className="info-item">
            <span className="label">注册时间:</span>
            <span className="value">{new Date(profile.created_at).toLocaleString()}</span>
          </div>
          <div className="info-item">
            <span className="label">最后更新:</span>
            <span className="value">{new Date(profile.updated_at).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

