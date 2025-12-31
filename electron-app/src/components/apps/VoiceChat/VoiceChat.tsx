import React, { useState, useEffect } from 'react';
import { AppLayout } from '../../shared/AppLayout';
import { StatusIndicator, StatusType, AppStatusType } from '../../shared/StatusIndicator';
import { AppButton } from '../../shared/AppButton';
import './VoiceChat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface VoiceChatProps {
  apiConnected: boolean;
  onStartWork: () => void;
  onEndWork: () => void;
  onContentChange: (hasContent: boolean) => void;
}

export const VoiceChat: React.FC<VoiceChatProps> = ({ apiConnected, onStartWork, onEndWork, onContentChange }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // 通知父组件内容变化（用于工作状态检查）
  useEffect(() => {
    const hasContent = messages.length > 0 || isListening || isProcessing;
    onContentChange(hasContent);
  }, [messages.length, isListening, isProcessing, onContentChange]);

  const handleVoiceInput = () => {
    // 开始语音输入时，启动工作会话
    if (!isListening && messages.length === 0) {
      onStartWork();
    }
    if (!apiConnected) {
      alert('API未连接');
      return;
    }
    
    console.log('语音输入功能待实现');
  };

  // 计算 App 状态
  const getAppStatus = (): AppStatusType => {
    if (!apiConnected) return 'error';
    if (isProcessing) return 'waiting';
    if (isListening || messages.length > 0) return 'working';
    return 'idle';
  };

  // 计算 ASR 状态
  const getAsrStatus = (): StatusType => {
    if (!apiConnected) return 'disconnected';
    if (isListening) return 'recording';
    if (isProcessing) return 'processing';
    return 'idle';
  };

  return (
    <AppLayout
      title="语音助手"
      subtitle="语音输入 → AI 回答"
      icon="💬"
      statusIndicator={
        <StatusIndicator 
          status="idle"
          appStatus={getAppStatus()}
          appStatusText={
            !apiConnected ? 'API未连接' :
            isProcessing ? 'AI思考中' :
            isListening ? '对话中' :
            messages.length > 0 ? '对话中' :
            '空闲'
          }
          asrStatus={getAsrStatus()}
        />
      }
      footer={
        <div className="voice-chat-footer-content">
          <AppButton
            onClick={handleVoiceInput}
            disabled={!apiConnected || isProcessing}
            variant={isListening ? 'danger' : 'primary'}
            size="large"
            icon={isListening ? '⏹' : '👥'}
            className="voice-input-btn"
            title={apiConnected ? '点击开始对话' : 'API未连接'}
            ariaLabel={isListening ? '停止对话' : '开始对话'}
          >
            {isListening ? '停止对话' : '开始对话'}
          </AppButton>
          <div className="footer-hint">
            {isListening
              ? '正在录音...'
              : isProcessing
              ? 'AI正在思考...'
              : '点击按钮开始对话'}
          </div>
        </div>
      }
    >
      <div className="voice-chat-content">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎙️</div>
            <h3 className="empty-title">开始对话</h3>
            <p className="empty-description">
              点击下方麦克风按钮，说出您的问题
            </p>
            <div className="empty-features">
              <div className="feature-item">
                <span className="feature-icon">🎤</span>
                <span className="feature-text">语音输入</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🤖</span>
                <span className="feature-text">AI回答</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">💾</span>
                <span className="feature-text">历史记录</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message message-${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="message-content">
                  <div className="message-text">{msg.content}</div>
                  <div className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="message message-assistant">
                <div className="message-avatar">🤖</div>
                <div className="message-content">
                  <div className="message-text typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

