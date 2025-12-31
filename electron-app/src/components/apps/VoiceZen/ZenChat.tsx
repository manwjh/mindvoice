import React, { useState, useEffect } from 'react';
import './ZenChat.css';

interface ZenChatProps {
  onExit: () => void;
  onMessagesChange: (hasContent: boolean) => void;
}

interface Message {
  id: string;
  role: 'user' | 'zen';
  text: string;
  timestamp: Date;
}

/**
 * 禅对话界面
 * 与一禅小和尚进行对话
 */
const ZenChat: React.FC<ZenChatProps> = ({ onExit, onMessagesChange }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [backgroundImage, setBackgroundImage] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    onMessagesChange(messages.length > 0);
  }, [messages.length, onMessagesChange]);

  const handleVoiceInput = () => {
    console.log('语音输入功能待实现');
  };

  const toggleMusic = () => {
    setIsPlaying(!isPlaying);
    console.log('背景音乐功能待实现');
  };

  return (
    <div className="zen-chat" style={{ backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined }}>
      {/* 背景遮罩 */}
      <div className="zen-chat-overlay"></div>

      {/* 顶部栏 */}
      <div className="zen-chat-header">
        <div className="zen-master-info">
          <div className="zen-master-avatar">禅</div>
          <div className="zen-master-name">一禅小和尚</div>
        </div>
        <button className="zen-exit-button" onClick={onExit}>
          再见
        </button>
      </div>

      {/* 对话区域 */}
      <div className="zen-chat-messages">
        {messages.length === 0 ? (
          <div className="zen-empty-state">
            <div className="zen-lotus">🪷</div>
            <p className="zen-greeting">阿弥陀佛，施主有何烦恼？</p>
          </div>
        ) : (
          messages.map(message => (
            <div key={message.id} className={`zen-message zen-message-${message.role}`}>
              <div className="zen-message-content">
                {message.text}
              </div>
              <div className="zen-message-time">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部控制栏 */}
      <div className="zen-chat-controls">
        <button 
          className="zen-music-button" 
          onClick={toggleMusic}
          title={isPlaying ? '暂停音乐' : '播放音乐'}
        >
          {isPlaying ? '🔊' : '🔇'}
        </button>
        
        <button 
          className="zen-voice-button"
          onClick={handleVoiceInput}
          title="语音输入"
        >
          <span className="zen-mic-icon">🎤</span>
          <span className="zen-voice-text">点击说话</span>
        </button>

        <div className="zen-status">
          <span className="zen-status-dot"></span>
          <span className="zen-status-text">待机中</span>
        </div>
      </div>

      {/* 功能占位提示 */}
      <div className="zen-dev-info">
        <p>🚧 开发中功能：</p>
        <ul>
          <li>✨ 语音输入集成</li>
          <li>🧘 禅师对话（LLM）</li>
          <li>🎵 背景音乐播放</li>
          <li>🖼️ 情绪分析选图</li>
          <li>🧠 长记忆库</li>
          <li>📚 知识库</li>
          <li>👤 用户画像</li>
        </ul>
      </div>
    </div>
  );
};

export default ZenChat;

