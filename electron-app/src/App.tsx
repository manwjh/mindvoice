import { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { Toast } from './components/Toast';
import './App.css';

const API_BASE_URL = 'http://127.0.0.1:8765';
const WS_URL = 'ws://127.0.0.1:8765/ws';

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopping';

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
  const [activeView, setActiveView] = useState<'workspace' | 'history' | 'settings'>('workspace');
  const [records, setRecords] = useState<Record[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const blockEditorRef = useRef<{ appendAsrText: (text: string, isDefiniteUtterance?: boolean) => void } | null>(null);

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

    // 如果有旧连接，先关闭它
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
        console.warn('关闭旧WebSocket连接失败:', e);
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
              // 确定的结果（完整utterance）
              blockEditorRef.current?.appendAsrText(
                data.text || '',
                true
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
        setError(data.message);
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
    try {
      const response = await fetch(`${API_BASE_URL}/api/recording/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_edited_text: null }),
      });
      const data = await response.json();
      if (data.success) {
        setToast({ message: 'ASR已停止', type: 'info' });
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError(`停止ASR失败: ${e}`);
    }
  };

  // ASR按钮：仅在idle时可用，启动ASR
  const handleAsrToggle = async () => {
    if (asrState === 'idle') {
      await startAsr();
    }
  };

  // PAUSE按钮：仅在recording时可用，停止ASR（执行停止操作）
  const handlePauseToggle = async () => {
    if (asrState === 'recording') {
      await stopAsr();
    }
  };

  // 保存文本（仅在idle状态时可用）
  const saveText = async () => {
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
      const response = await fetch(`${API_BASE_URL}/api/text/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        setToast({ message: '已保存到历史记录', type: 'success' });
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

  const clearText = () => {
    if (text && window.confirm('确定要清空当前内容吗？此操作不可撤销。')) {
      setText('');
      setToast({ message: '内容已清空', type: 'info' });
    }
  };

  // 历史记录
  const RECORDS_PER_PAGE = 20;
  
  const loadRecords = async (page: number = currentPage) => {
    if (!apiConnected) return;
    setLoadingRecords(true);
    try {
      const offset = (page - 1) * RECORDS_PER_PAGE;
      const response = await fetch(`${API_BASE_URL}/api/records?limit=${RECORDS_PER_PAGE}&offset=${offset}`);
      const data = await response.json();
      if (data.success) {
        setRecords(data.records);
        setRecordsTotal(data.total);
        setCurrentPage(page);
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
        setActiveView('workspace');
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
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      
      <div className="app-main">
        {error && <div className="error-banner">{error}</div>}

        {activeView === 'workspace' && (
          <Workspace
            text={text}
            onTextChange={setText}
            asrState={asrState}
            onAsrToggle={handleAsrToggle}
            onPauseToggle={handlePauseToggle}
            onSaveText={saveText}
            onCopyText={copyText}
            onClearText={clearText}
            apiConnected={apiConnected}
            blockEditorRef={blockEditorRef}
          />
        )}

        {activeView === 'history' && (
          <HistoryView
            records={records}
            loading={loadingRecords}
            total={recordsTotal}
            currentPage={currentPage}
            recordsPerPage={RECORDS_PER_PAGE}
            onLoadRecord={loadRecord}
            onDeleteRecords={deleteRecords}
            onPageChange={loadRecords}
          />
        )}

        {activeView === 'settings' && <SettingsView apiConnected={apiConnected} />}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default App;
