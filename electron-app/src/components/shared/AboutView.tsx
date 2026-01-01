import React from 'react';
import { APP_VERSION } from '../../version';
import './AboutView.css';

export const AboutView: React.FC = () => {
  const { version, releaseDate } = APP_VERSION;
  
  return (
    <div className="about-view">
      <div className="about-container">
        <div className="about-header">
          <div className="about-logo">
            <div className="about-logo-icon">
              <svg
                width="80"
                height="80"
                viewBox="0 0 1024 1024"
                xmlns="http://www.w3.org/2000/svg"
                className="animated-logo"
              >
                <defs>
                  <radialGradient id="bgGradient" cx="50%" cy="40%" r="70%">
                    <stop offset="0%" stopColor="#0F2A5A"/>
                    <stop offset="100%" stopColor="#06142F"/>
                  </radialGradient>
                  <linearGradient id="waveGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#2FE3FF" stopOpacity="0.9"/>
                    <stop offset="100%" stopColor="#7A5CFF" stopOpacity="0.9"/>
                  </linearGradient>
                  <radialGradient id="coreGlow">
                    <stop offset="0%" stopColor="#CFFFFF"/>
                    <stop offset="60%" stopColor="#2FE3FF"/>
                    <stop offset="100%" stopColor="#2FE3FF" stopOpacity="0"/>
                  </radialGradient>
                </defs>
                <rect
                  x="64"
                  y="64"
                  width="896"
                  height="896"
                  rx="200"
                  fill="url(#bgGradient)"
                />
                <g fill="none" stroke="url(#waveGradient)" strokeWidth="64" opacity="0.85">
                  <circle cx="512" cy="512" r="260" className="wave-ring wave-ring-1"/>
                  <circle cx="512" cy="512" r="190" opacity="0.7" className="wave-ring wave-ring-2"/>
                  <circle cx="512" cy="512" r="120" opacity="0.5" className="wave-ring wave-ring-3"/>
                </g>
                <circle
                  cx="512"
                  cy="512"
                  r="48"
                  fill="url(#coreGlow)"
                  className="core-pulse"
                />
              </svg>
            </div>
          </div>
          <h1 className="about-title">MindVoice</h1>
          <p className="about-subtitle">一个能陪你把事做完，也能在你扛不住时接住你的语音个人助理</p>
        </div>

        <div className="about-content">
          <div className="about-section">
            <h2 className="section-title">至用户</h2>
            <div className="about-description" style={{ whiteSpace: 'pre-line' }}>
              MindVoice 是一个被认真对待的产品。

              我们不追求"惊艳"，
              也不希望用复杂功能打动你。

              它更像一个长期存在的工具：
              能听、能记、能在你需要的时候回应。

              如果你愿意长期使用它，
              我们也会用同样长期的耐心去打磨它。

              谢谢你的信任。
            </div>
          </div>

          <div className="about-section">
            <h2 className="section-title">版本信息</h2>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">版本号</span>
                <span className="info-value">{version}</span>
              </div>
              <div className="info-item">
                <span className="info-label">发布日期</span>
                <span className="info-value">{releaseDate}</span>
              </div>
            </div>
          </div>

          <div className="about-section">
            <h2 className="section-title">开发者</h2>
            <div className="developer-info">
              <p className="developer-name">深圳王哥 & AI</p>
              <div className="contact-info">
                <span className="contact-label">联系方式：</span>
                <a href="mailto:manwjh@126.com" className="contact-link">
                  manwjh@126.com
                </a>
              </div>
            </div>
          </div>

          <div className="about-section">
            <h2 className="section-title">关于项目</h2>
            <p className="about-description">
              MindVoice 是一款结合了语音识别(ASR)和大语言模型(LLM)的智能桌面助手。
              通过先进的AI技术，为您提供流畅的语音笔记、智能对话等功能，
              让语音交互变得更加自然和高效。
            </p>
            <p className="about-description" style={{ marginTop: '1rem', fontStyle: 'italic', color: '#6c757d' }}>
              产品定位：一个能陪你把事做完，也能在你扛不住时接住你的语音个人助理。
            </p>
          </div>

          <div className="about-section">
            <h2 className="section-title">技术栈</h2>
            <div className="tech-stack">
              <span className="tech-badge">Electron</span>
              <span className="tech-badge">React</span>
              <span className="tech-badge">TypeScript</span>
              <span className="tech-badge">Python</span>
              <span className="tech-badge">FastAPI</span>
              <span className="tech-badge">WebSocket</span>
            </div>
          </div>

          <div className="about-footer">
            <p className="copyright">© 2025 深圳王哥 & AI. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

