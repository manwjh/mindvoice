import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { AppLayout } from '../../shared/AppLayout';
import { StatusIndicator, AppStatusType } from '../../shared/StatusIndicator';
import { AppButton, ButtonGroup } from '../../shared/AppButton';
import { WelcomeScreen } from './WelcomeScreen';
import './SmartChat.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8765';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// 导出接口供 App.tsx 使用
export interface SmartChatHandle {
  appendAsrText: (text: string, isDefiniteUtterance?: boolean) => void;
}

interface SmartChatProps {
  // ASR状态 - 空实现，不使用实际ASR
  asrState: 'idle' | 'recording' | 'stopping';
  // ASR控制 - 空实现
  onAsrStart?: () => void;
  onAsrStop?: () => void;
  // API连接状态
  apiConnected: boolean;
  // 工作会话
  isWorkSessionActive: boolean;
  onStartWork: () => void;
  onEndWork: () => void;
}

export const SmartChat = forwardRef<SmartChatHandle, SmartChatProps>(({ 
  asrState,
  onAsrStart,
  onAsrStop,
  apiConnected,
  isWorkSessionActive,
  onStartWork,
  onEndWork
}, ref) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useKnowledge, setUseKnowledge] = useState(true);
  const [isPressingMic, setIsPressingMic] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 判断是否显示欢迎界面
  const showWelcome = !isWorkSessionActive;

  // 暴露接口给父组件（App.tsx）- 空实现，不使用ASR
  useImperativeHandle(ref, () => ({
    appendAsrText: (text: string, isDefiniteUtterance: boolean = false) => {
      // 空实现 - 语音输入接口预留，由用户后续集成
      console.log('[SmartChat] ASR接口预留，暂不实现', { text, isDefiniteUtterance });
    }
  }), [isPressingMic]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 发送消息
  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      // 获取device_id
      const deviceIdResponse = await fetch(`${API_BASE_URL}/api/device_id`);
      const deviceIdData = await deviceIdResponse.json();
      const deviceId = deviceIdData.device_id;
      
      const response = await fetch(`${API_BASE_URL}/api/smartchat/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          stream: true,
          use_history: true,
          use_knowledge: useKnowledge,
          device_id: deviceId  // 传递device_id用于消费记录
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.chunk) {
                  accumulatedContent += parsed.chunk;
                  setMessages(prev => 
                    prev.map(msg => 
                      msg.id === assistantMessage.id 
                        ? { ...msg, content: accumulatedContent }
                        : msg
                    )
                  );
                }
                if (parsed.error) {
                  throw new Error(parsed.error.message || '对话失败');
                }
              } catch (e) {
                // 忽略JSON解析错误
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[SmartChat] 发送消息失败:', error);
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `抱歉，发生错误：${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 清空历史
  const handleClearHistory = async () => {
    if (!confirm('确定要清空对话历史吗？')) return;

    try {
      await fetch(`${API_BASE_URL}/api/smartchat/clear_history`, {
        method: 'POST'
      });
      setMessages([]);
    } catch (error) {
      console.error('[SmartChat] 清空历史失败:', error);
      alert('清空历史失败');
    }
  };

  // Enter 发送，Shift+Enter 换行
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 按住麦克风开始语音输入 - 空实现
  const handleMicMouseDown = () => {
    // 空实现 - 不实际触发ASR
    console.log('[SmartChat] 语音输入功能预留，暂不实现');
  };

  // 松开麦克风停止语音输入 - 空实现
  const handleMicMouseUp = () => {
    // 空实现
  };

  // 防止鼠标移出按钮时松开 - 空实现
  const handleMicMouseLeave = () => {
    // 空实现
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  // 处理开始工作按钮
  const handleStartWork = () => {
    onStartWork();
  };

  // 计算 App 状态
  const getAppStatus = (): AppStatusType => {
    if (!apiConnected) return 'error';
    if (asrState === 'stopping') return 'waiting';
    if (isWorkSessionActive) return 'working';
    return 'idle';
  };

  return (
    <AppLayout
      title="语音助手"
      subtitle="智能对话，支持知识库检索"
      icon="🤖"
      statusIndicator={
        <StatusIndicator 
          status={asrState}
          appStatus={getAppStatus()}
          appStatusText={
            !apiConnected ? 'API未连接' :
            isWorkSessionActive ? '对话中' :
            '空闲'
          }
          asrStatus={asrState}
        />
      }
      actions={
        <>
          {/* 功能按钮 */}
          {isWorkSessionActive && (
            <ButtonGroup>
              <label className="knowledge-toggle">
                <input
                  type="checkbox"
                  checked={useKnowledge}
                  onChange={(e) => setUseKnowledge(e.target.checked)}
                />
                <span>📚 知识库</span>
              </label>
              <AppButton
                onClick={handleClearHistory}
                disabled={messages.length === 0}
                variant="ghost"
                size="medium"
                icon="🗑️"
                title="清空对话历史"
                ariaLabel="清空历史"
              >
                清空
              </AppButton>
              <AppButton
                onClick={onEndWork}
                disabled={asrState !== 'idle'}
                variant="ghost"
                size="medium"
                icon="🚪"
                title="退出当前对话"
                ariaLabel="退出"
              >
                退出
              </AppButton>
            </ButtonGroup>
          )}
        </>
      }
    >
      {showWelcome ? (
        <WelcomeScreen onStartWork={handleStartWork} />
      ) : (
        <div className="smart-chat-content">
          {/* 消息列表 */}
          <div className="chat-messages">
            {messages.length === 0 && !isLoading ? (
              <div className="chat-empty-hint">
                <div className="hint-icon">💬</div>
                <p>开始输入开始对话...</p>
              </div>
            ) : (
              <>
                {messages.map(msg => (
                  <div key={msg.id} className={`message message-${msg.role}`}>
                    <div className="message-avatar">
                      {msg.role === 'user' ? '👤' : '😊'}
                    </div>
                    <div className="message-bubble">
                      {msg.content ? (
                        <>
                          <div className="message-text">{msg.content}</div>
                          <div className="message-time">{formatTime(msg.timestamp)}</div>
                        </>
                      ) : (
                        // 内容为空时显示加载动画
                        <div className="loading-dots">
                          <span></span><span></span><span></span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入区域 */}
          <div className="chat-input-area">
            <div className={`input-wrapper ${asrState === 'recording' ? 'recording' : ''}`}>
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息 (回车发送，Shift+Enter换行)"
                className={`chat-input ${asrState === 'recording' ? 'recording' : ''}`}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
});

SmartChat.displayName = 'SmartChat';

