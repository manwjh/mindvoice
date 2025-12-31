import { useState, useEffect, useRef } from 'react';
import { Sidebar, AppView } from './components/shared/Sidebar';
import { VoiceNote } from './components/apps/VoiceNote/VoiceNote';
import { VoiceChat } from './components/apps/VoiceChat/VoiceChat';
import VoiceZen from './components/apps/VoiceZen/VoiceZen';
import { HistoryView } from './components/shared/HistoryView';
import { SettingsView } from './components/shared/SettingsView';
import { AboutView } from './components/shared/AboutView';
import { Toast } from './components/shared/Toast';
import { ConfirmDialog } from './components/shared/ConfirmDialog';
import './App.css';

const API_BASE_URL = 'http://127.0.0.1:8765';
const WS_URL = 'ws://127.0.0.1:8765/ws';

type RecordingState = 'idle' | 'recording' | 'stopping';

interface Record {
  id: string;
  text: string;
  metadata: any;
  created_at: string;
}

function App() {
  const [asrState, setAsrState] = useState<RecordingState>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('voice-note');
  const [records, setRecords] = useState<Record[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [appFilter, setAppFilter] = useState<'all' | 'voice-note' | 'voice-chat' | 'voice-zen'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning'; duration?: number } | null>(null);
  
  // 工作状态管理
  const [activeWorkingApp, setActiveWorkingApp] = useState<AppView | null>(null);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [pendingView, setPendingView] = useState<AppView | null>(null);
  const [isWorkSessionActive, setIsWorkSessionActive] = useState(false);
  
  // VoiceChat 和 VoiceZen 的工作状态（通过回调更新）
  const [voiceChatHasContent, setVoiceChatHasContent] = useState(false);
  const [voiceZenHasContent, setVoiceZenHasContent] = useState(false);
  
  const [initialBlocks, setInitialBlocks] = useState<any[] | undefined>(undefined);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const blockEditorRef = useRef<{ 
    appendAsrText: (text: string, isDefiniteUtterance?: boolean, timeInfo?: any) => void;
    setNoteInfoEndTime: () => void;
    getNoteInfo: () => any;
    getBlocks: () => any[];
    setBlocks: (blocks: any[]) => void;
  } | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 工作状态检查
  const isAppWorking = (app: AppView): boolean => {
    switch (app) {
      case 'voice-note':
        return asrState === 'recording' || text.trim().length > 0 || isWorkSessionActive;
      case 'voice-chat':
        return voiceChatHasContent;
      case 'voice-zen':
        return voiceZenHasContent;
      default:
        return false;
    }
  };

  // 开始工作会话
  const startWorkSession = (app: AppView): boolean => {
    if (activeWorkingApp && activeWorkingApp !== app) {
      setToast({ 
        message: `${getAppName(activeWorkingApp)} 正在工作中，请先完成当前工作`, 
        type: 'warning' 
      });
      return false;
    }
    setActiveWorkingApp(app);
    setIsWorkSessionActive(true);
    return true;
  };

  // 结束工作会话
  const endWorkSession = () => {
    setActiveWorkingApp(null);
    setIsWorkSessionActive(false);
  };

  // 获取应用名称
  const getAppName = (app: AppView): string => {
    const names: Record<AppView, string> = {
      'voice-note': '语音笔记',
      'voice-chat': '语音助手',
      'voice-zen': '禅',
      'history': '历史记录',
      'settings': '设置',
      'about': '关于',
    };
    return names[app] || app;
  };

  // 应用切换处理
  const handleViewChange = (newView: AppView) => {
    // 如果切换到历史或设置，检查是否有工作中的应用
    if (newView === 'history' || newView === 'settings' || newView === 'about') {
      if (activeWorkingApp && isAppWorking(activeWorkingApp)) {
        setPendingView(newView);
        setShowSwitchConfirm(true);
        return;
      }
      setActiveView(newView);
      return;
    }
    
    // 如果有应用在工作
    if (activeWorkingApp && activeWorkingApp !== newView) {
      if (isAppWorking(activeWorkingApp)) {
        setPendingView(newView);
        setShowSwitchConfirm(true);
        return;
      }
    }
    
    // 切换到新应用
    setActiveView(newView);
  };

  // 保存并切换
  const saveAndSwitch = async () => {
    if (activeWorkingApp === 'voice-note') {
      if (text.trim()) {
        await saveText();
      }
    }
    // VoiceChat 和 VoiceZen 的保存逻辑在各自组件内部处理
    // 这里只需要重置工作状态
    
    endWorkSession();
    if (pendingView) {
      setActiveView(pendingView);
      setPendingView(null);
    }
    setShowSwitchConfirm(false);
  };

  // 放弃并切换
  const discardAndSwitch = () => {
    if (activeWorkingApp === 'voice-note') {
      setText('');
      localStorage.removeItem('voiceNoteDraft');  // 清除草稿
    } else if (activeWorkingApp === 'voice-chat') {
      setVoiceChatHasContent(false);
    } else if (activeWorkingApp === 'voice-zen') {
      setVoiceZenHasContent(false);
    }
    
    endWorkSession();
    if (pendingView) {
      setActiveView(pendingView);
      setPendingView(null);
    }
    setShowSwitchConfirm(false);
  };

  // 取消切换
  const cancelSwitch = () => {
    setPendingView(null);
    setShowSwitchConfirm(false);
  };

  // 自动保存草稿到 localStorage
  useEffect(() => {
    if (text.trim() && isWorkSessionActive && activeView === 'voice-note') {
      // 清除之前的定时器
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      
      // 3秒后自动保存草稿
      autoSaveTimerRef.current = setTimeout(() => {
        try {
          const draft = {
            text,
            app: activeView,
            timestamp: Date.now(),
          };
          localStorage.setItem('voiceNoteDraft', JSON.stringify(draft));
          console.log('草稿已自动保存');
        } catch (e) {
          console.error('保存草稿失败:', e);
        }
      }, 3000);
    }
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [text, isWorkSessionActive, activeView]);

  // 恢复草稿
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem('voiceNoteDraft');
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        // 只恢复24小时内的草稿
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (draft.timestamp > oneDayAgo && draft.text) {
          setText(draft.text);
          // 恢复草稿时自动启动工作会话
          const appType = draft.app || 'voice-note';
          if (appType === 'voice-note') {
            startWorkSession('voice-note');
          }
          setToast({ message: '已恢复上次未保存的草稿', type: 'info' });
        } else {
          // 清除过期草稿
          localStorage.removeItem('voiceNoteDraft');
        }
      }
    } catch (e) {
      console.error('恢复草稿失败:', e);
    }
  }, []);

  // 检查API连接
  const checkApiConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/status`);
      const connected = response.ok;
      setApiConnected(connected);
      if (!connected) {
        setError('无法连接到API服务器');
      }
      return connected;
    } catch (e) {
      setApiConnected(false);
      setError('无法连接到API服务器');
      return false;
    }
  };

  // 连接WebSocket
  const connectWebSocket = () => {
    // 如果连接已存在且状态是 OPEN 或 CONNECTING，则不创建新连接
    if (wsRef.current && 
        (wsRef.current.readyState === WebSocket.OPEN || 
         wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
        console.warn('关闭WebSocket连接失败:', e);
      }
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setError(null);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'initial_state':
              setAsrState(data.state);
              if (data.text) setText(data.text);
              break;
            case 'text_update':
              // 中间结果（实时更新）
              blockEditorRef.current?.appendAsrText(
                data.text || '',
                false
              );
              break;
            case 'text_final':
              // 确定的结果（完整utterance）- 包含时间信息
              blockEditorRef.current?.appendAsrText(
                data.text || '',
                true,
                {
                  startTime: data.start_time,
                  endTime: data.end_time
                }
              );
              break;
            case 'state_change':
              setAsrState(data.state);
              break;
            case 'error':
              setError(`${data.error_type || '错误'}: ${data.message || '未知错误'}`);
              break;
            default:
              console.warn('未知的WebSocket消息类型:', data.type);
          }
        } catch (e) {
          console.error('解析WebSocket消息失败:', e);
          setError('WebSocket消息解析失败');
        }
      };

      ws.onerror = () => {
        if (!apiConnected) {
          setError('WebSocket连接错误');
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (apiConnected && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connectWebSocket();
          }, 3000);
        }
      };

      wsRef.current = ws;
    } catch (e) {
      console.error('WebSocket连接失败:', e);
    }
  };

  useEffect(() => {
    checkApiConnection().then((connected) => {
      if (connected) connectWebSocket();
    });

    const interval = setInterval(() => {
      checkApiConnection().then((connected) => {
        if (connected && !wsRef.current) {
          connectWebSocket();
        }
      });
    }, 5000);

    return () => {
      clearInterval(interval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // ASR控制函数
  const callAsrApi = async (endpoint: string) => {
    if (!apiConnected) {
      setError('API未连接');
      return false;
    }
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        // 识别音频设备错误，使用 Toast 显示，并延长显示时间
        const errorMsg = data.message || '操作失败';
        if (errorMsg.includes('音频设备') || errorMsg.includes('PortAudio') || errorMsg.includes('单声道')) {
          setToast({ message: errorMsg, type: 'error', duration: 6000 });
        } else {
          setError(errorMsg);
        }
        return false;
      }
      return true;
    } catch (e) {
      setError(`操作失败: ${e}`);
      return false;
    }
  };

  const startAsr = () => callAsrApi('/api/recording/start');
  const stopAsr = async () => {
    if (!apiConnected) return;
    
    // 防止重复调用：如果已经在停止中，直接返回
    if (asrState === 'stopping') {
      console.log('[App] ASR已在停止中，忽略重复调用');
      return;
    }
    
    // 立即更新状态为stopping，防止重复点击
    setAsrState('stopping');
    
    // 设置超时保护：如果10秒后状态还是stopping，强制重置为idle
    const timeoutId = setTimeout(() => {
      console.warn('[App] ASR停止超时(10秒)，强制重置状态为idle');
      setAsrState('idle');
      setError('ASR停止超时，已强制重置状态。如果问题持续，请重启应用。');
    }, 10000);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/recording/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_edited_text: null }),
      });
      
      // 清除超时定时器
      clearTimeout(timeoutId);
      
      const data = await response.json();
      if (data.success) {
        setToast({ message: 'ASR已停止', type: 'info' });
      } else {
        setError(data.message);
        // 如果停止失败，重置状态为idle
        setAsrState('idle');
      }
    } catch (e) {
      // 清除超时定时器
      clearTimeout(timeoutId);
      
      setError(`停止ASR失败: ${e}`);
      // 发生错误时，强制重置状态为idle
      setAsrState('idle');
    }
  };

  // 启动ASR
  const handleAsrStart = async () => {
    if (asrState === 'idle') {
      await startAsr();
    }
  };

  // 停止ASR
  const handleAsrStop = async () => {
    // 只有在recording状态时才能停止（不需要checking stopping状态）
    if (asrState === 'recording') {
      await stopAsr();
    }
  };

  // 保存文本（仅在idle状态时可用）
  const saveText = async (noteInfo?: any) => {
    if (!apiConnected) {
      setError('API未连接');
      return;
    }

    if (asrState !== 'idle') {
      setToast({ message: '只有在ASR处于空闲状态时才能保存', type: 'info' });
      return;
    }

    if (!text?.trim()) {
      setToast({ message: '没有内容可保存', type: 'info' });
      return;
    }

    try {
      // 根据当前活动视图确定应用类型
      const appType = activeView === 'voice-chat' ? 'voice-chat' : 'voice-note';
      
      // 构建保存的文本内容（如果有noteInfo，则在前面添加）
      let contentToSave = text.trim();
      if (noteInfo && appType === 'voice-note') {
        const infoHeader = [
          `📋 笔记信息`,
          noteInfo.title ? `📌 标题: ${noteInfo.title}` : '',
          noteInfo.type ? `🏷️ 类型: ${noteInfo.type}` : '',
          noteInfo.relatedPeople ? `👥 相关人员: ${noteInfo.relatedPeople}` : '',
          noteInfo.location ? `📍 地点: ${noteInfo.location}` : '',
          `⏰ 开始时间: ${noteInfo.startTime}`,
          noteInfo.endTime ? `⏱️ 结束时间: ${noteInfo.endTime}` : '',
          '',
          '---',
          '',
        ].filter(line => line).join('\n');
        
        contentToSave = infoHeader + contentToSave;
      }
      
      const blocksData = blockEditorRef.current?.getBlocks?.() || null;
      
      const response = await fetch(`${API_BASE_URL}/api/text/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: contentToSave,
          app_type: appType,
          blocks: blocksData
        }),
      });
      const data = await response.json();
      if (data.success) {
        setToast({ message: '已保存到历史记录，可继续记录新内容', type: 'success' });
        localStorage.removeItem('voiceNoteDraft');
        setText('');
        setInitialBlocks(undefined);
        // 注意：不调用 endWorkSession()，让用户可以继续使用
      } else {
        setError(data.message || '保存失败');
      }
    } catch (e) {
      setToast({ message: '保存失败，请重试', type: 'error' });
    }
  };

  const copyText = async () => {
    if (!text) {
      setToast({ message: '没有可复制的文本', type: 'error' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setToast({ message: '文本已复制到剪贴板', type: 'success' });
    } catch (e) {
      setToast({ message: `复制失败: ${e}`, type: 'error' });
    }
  };

  const createNewNote = async () => {
    // 如果当前有内容，先保存
    if (text && text.trim()) {
      if (!apiConnected) {
        setError('API未连接');
        return;
      }
      
      if (asrState !== 'idle') {
        setToast({ message: '请先停止ASR后再创建新笔记', type: 'info' });
        return;
      }
      
      try {
        // 获取笔记信息
        const noteInfo = blockEditorRef.current?.getNoteInfo?.();
        
        // 先设置结束时间
        if (blockEditorRef.current?.setNoteInfoEndTime) {
          blockEditorRef.current.setNoteInfoEndTime();
        }
        
        // 构建保存内容
        let contentToSave = text.trim();
        if (noteInfo) {
          const infoHeader = [
            `📋 笔记信息`,
            noteInfo.title ? `📌 标题: ${noteInfo.title}` : '',
            noteInfo.type ? `🏷️ 类型: ${noteInfo.type}` : '',
            noteInfo.relatedPeople ? `👥 相关人员: ${noteInfo.relatedPeople}` : '',
            noteInfo.location ? `📍 地点: ${noteInfo.location}` : '',
            `⏰ 开始时间: ${noteInfo.startTime}`,
            noteInfo.endTime ? `⏱️ 结束时间: ${noteInfo.endTime}` : '',
            '',
            '---',
            '',
          ].filter(line => line).join('\n');
          
          contentToSave = infoHeader + contentToSave;
        }
        
        // 保存当前笔记
        const response = await fetch(`${API_BASE_URL}/api/text/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: contentToSave,
            app_type: 'voice-note'
          }),
        });
        
        const data = await response.json();
        if (data.success) {
          // 清空内容并清除草稿
          setText('');
          localStorage.removeItem('voiceNoteDraft');
          setToast({ message: '当前笔记已保存，可以开始新笔记了', type: 'success' });
          // 保持工作会话活跃，用户可以继续记录
        } else {
          setError(data.message || '保存失败');
        }
      } catch (e) {
        setToast({ message: '保存失败，请重试', type: 'error' });
      }
    } else {
      // 如果没有内容，直接清空
      setText('');
      localStorage.removeItem('voiceNoteDraft');
      setToast({ message: '准备好记录新笔记了', type: 'info' });
    }
  };

  // 历史记录
  const RECORDS_PER_PAGE = 20;
  
  const loadRecords = async (page: number = currentPage, filter: 'all' | 'voice-note' | 'voice-chat' | 'voice-zen' = appFilter) => {
    if (!apiConnected) return;
    setLoadingRecords(true);
    try {
      const offset = (page - 1) * RECORDS_PER_PAGE;
      const filterParam = filter !== 'all' ? `&app_type=${filter}` : '';
      const response = await fetch(`${API_BASE_URL}/api/records?limit=${RECORDS_PER_PAGE}&offset=${offset}${filterParam}`);
      const data = await response.json();
      if (data.success) {
        setRecords(data.records);
        setRecordsTotal(data.total);
        setCurrentPage(page);
        setAppFilter(filter);
      } else {
        setError('加载历史记录失败');
      }
    } catch (e) {
      setError(`加载历史记录失败: ${e}`);
    } finally {
      setLoadingRecords(false);
    }
  };

  const deleteRecords = async (recordIds: string[]) => {
    if (!apiConnected || recordIds.length === 0) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/records/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_ids: recordIds }),
      });
      const data = await response.json();
      if (data.success) {
        setToast({ message: data.message || `已删除 ${data.deleted_count} 条记录`, type: 'success' });
        // 重新加载当前页
        await loadRecords(currentPage);
      } else {
        setError(data.message || '删除记录失败');
      }
    } catch (e) {
      setError(`删除记录失败: ${e}`);
    }
  };

  const loadRecord = async (recordId: string) => {
    if (!apiConnected) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/records/${recordId}`);
      const data = await response.json();
      if (data.text) {
        setText(data.text);
        
        if (data.metadata?.blocks && Array.isArray(data.metadata.blocks)) {
          setInitialBlocks(data.metadata.blocks);
        } else {
          setInitialBlocks(undefined);
        }
        
        setActiveView('voice-note');
      }
    } catch (e) {
      setError(`加载记录失败: ${e}`);
    }
  };

  useEffect(() => {
    if (activeView === 'history' && apiConnected) {
      loadRecords(1);
    }
  }, [activeView, apiConnected]);

  return (
    <div className="app">
      <Sidebar 
        activeView={activeView} 
        onViewChange={handleViewChange}
        activeWorkingApp={activeWorkingApp}
      />
      
      <div className="app-main">
        {error && <div className="error-banner">{error}</div>}

        {activeView === 'voice-note' && (
          <VoiceNote
            text={text}
            onTextChange={setText}
            asrState={asrState}
            onAsrStart={handleAsrStart}
            onAsrStop={handleAsrStop}
            onSaveText={saveText}
            onCopyText={copyText}
            onCreateNewNote={createNewNote}
            apiConnected={apiConnected}
            blockEditorRef={blockEditorRef}
            isWorkSessionActive={isWorkSessionActive}
            onStartWork={() => startWorkSession('voice-note')}
            onEndWork={endWorkSession}
            initialBlocks={initialBlocks}
          />
        )}

        {activeView === 'voice-chat' && (
          <VoiceChat 
            apiConnected={apiConnected}
            onStartWork={() => startWorkSession('voice-chat')}
            onEndWork={endWorkSession}
            onContentChange={setVoiceChatHasContent}
          />
        )}

        {activeView === 'voice-zen' && (
          <VoiceZen 
            onStartWork={() => startWorkSession('voice-zen')}
            onEndWork={endWorkSession}
            onContentChange={setVoiceZenHasContent}
          />
        )}

        {activeView === 'history' && (
          <HistoryView
            records={records}
            loading={loadingRecords}
            total={recordsTotal}
            currentPage={currentPage}
            recordsPerPage={RECORDS_PER_PAGE}
            appFilter={appFilter}
            onLoadRecord={loadRecord}
            onDeleteRecords={deleteRecords}
            onPageChange={loadRecords}
          />
        )}

        {activeView === 'settings' && <SettingsView apiConnected={apiConnected} />}

        {activeView === 'about' && <AboutView />}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmDialog
        open={showSwitchConfirm}
        title="工作未完成"
        message={`您在 ${getAppName(activeWorkingApp || 'voice-note')} 中有未保存的内容，是否保存？`}
        type="warning"
        actions={[
          {
            label: '保存并切换',
            variant: 'success',
            onClick: saveAndSwitch,
          },
          {
            label: '放弃内容',
            variant: 'danger',
            onClick: discardAndSwitch,
          },
          {
            label: '取消',
            variant: 'ghost',
            onClick: cancelSwitch,
          },
        ]}
        onClose={cancelSwitch}
      />
    </div>
  );
}

export default App;
