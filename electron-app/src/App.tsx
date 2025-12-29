import { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { HistoryView } from './components/HistoryView';
import { Toast } from './components/Toast';
import { OperationTransformer, Operation } from './utils/operationTransform';
import './App.css';

// API配置 - 可以从Electron主进程获取
const API_BASE_URL = 'http://127.0.0.1:8765';
const WS_URL = 'ws://127.0.0.1:8765/ws';

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';

interface Record {
  id: string;
  text: string;
  metadata: any;
  created_at: string;
}

function App() {
  const [state, setState] = useState<RecordingState>('idle');
  const [text, setText] = useState(''); // 显示缓冲区：显示给用户的文本
  const [error, setError] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [activeView, setActiveView] = useState<'workspace' | 'history' | 'settings'>('workspace');
  const [records, setRecords] = useState<Record[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // 双缓冲机制
  const asrBufferRef = useRef<string>(''); // ASR缓冲区：存储ASR推送的原始文本
  const userEditBufferRef = useRef<string>(''); // 用户编辑缓冲区：存储用户编辑的文本
  const lastMergedAsrRef = useRef<string>(''); // 记录上次合并时的ASR文本，用于检测新增内容
  
  // 操作转换系统
  const operationHistoryRef = useRef<Operation[]>([]); // 操作历史
  const lastAsrOperationsRef = useRef<Operation[]>([]); // 上次ASR的操作序列
  const pendingAsrOperationsRef = useRef<Operation[]>([]); // 待应用的ASR操作
  
  const isEditingRef = useRef(false); // 使用ref实时跟踪编辑状态，避免状态更新延迟
  const editingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 同步用户编辑到后端的定时器
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const blockEditorRef = useRef<{ appendAsrText: (text: string) => void } | null>(null);

  // 检查API服务器连接
  const checkApiConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/status`);
      if (response.ok) {
        setApiConnected(true);
        setError(null);
        return true;
      }
    } catch (e) {
      setApiConnected(false);
      setError('无法连接到API服务器，请确保后端服务正在运行');
    }
    return false;
  };

  // 连接WebSocket
  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('WebSocket连接已建立');
        setError(null);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('收到WebSocket消息:', data);

          switch (data.type) {
            case 'initial_state':
              setState(data.state);
              const initialText = data.text || '';
              setText(initialText);
              asrBufferRef.current = initialText;
              userEditBufferRef.current = initialText;
              lastMergedAsrRef.current = initialText;
              // 重置操作历史
              operationHistoryRef.current = [];
              pendingAsrOperationsRef.current = [];
              lastAsrOperationsRef.current = [];
              break;
            case 'text_update':
              handleAsrTextUpdate(data.text);
              break;
            case 'state_change':
              setState(data.state);
              break;
            case 'error':
              setError(`${data.error_type}: ${data.message}`);
              break;
          }
        } catch (e) {
          console.error('解析WebSocket消息失败:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
        if (!apiConnected) {
          setError('WebSocket连接错误，请确保API服务器正在运行');
        }
      };

      ws.onclose = () => {
        console.log('WebSocket连接已关闭');
        wsRef.current = null;
        
        // 如果API已连接，尝试重连
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
      if (!apiConnected) {
        setError('无法连接到API服务器');
      }
    }
  };

  useEffect(() => {
    // 初始检查API连接
    checkApiConnection().then((connected) => {
      if (connected) {
        connectWebSocket();
      }
    });

    // 定期检查API连接
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
      if (editingTimeoutRef.current) {
        clearTimeout(editingTimeoutRef.current);
      }
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/recording/start`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!data.success) {
        setError(data.message);
      } else {
        setError(null);
      }
    } catch (e) {
      setError(`启动录音失败: ${e}`);
    }
  };

  const pauseRecording = async () => {
    try {
      // 暂停前，如果有用户编辑，先同步
      if (isEditingRef.current || userEditBufferRef.current !== asrBufferRef.current) {
        // 停止编辑状态
        if (isEditingRef.current) {
          isEditingRef.current = false;
          if (editingTimeoutRef.current) {
            clearTimeout(editingTimeoutRef.current);
            editingTimeoutRef.current = null;
          }
          mergeAsrUpdates();
        }
        // 同步用户编辑版本
        await syncUserEditToBackend(userEditBufferRef.current);
      }
      
      const response = await fetch(`${API_BASE_URL}/api/recording/pause`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!data.success) {
        setError(data.message);
      }
    } catch (e) {
      setError(`暂停录音失败: ${e}`);
    }
  };

  const resumeRecording = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/recording/resume`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!data.success) {
        setError(data.message);
      }
    } catch (e) {
      setError(`恢复录音失败: ${e}`);
    }
  };

  const stopRecording = async () => {
    try {
      // 停止编辑状态，执行最终合并
      if (isEditingRef.current) {
        isEditingRef.current = false;
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current);
          editingTimeoutRef.current = null;
        }
        mergeAsrUpdates();
        // 等待合并完成
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // 获取最终的用户编辑文本（如果有），用于保存历史记录
      const finalUserEditedText = userEditBufferRef.current && 
                                  userEditBufferRef.current !== asrBufferRef.current
                                  ? userEditBufferRef.current 
                                  : null;
      
      // 停止录音前，先保存用户编辑的版本（如果有）
      if (finalUserEditedText) {
        // 用户编辑过，先同步用户编辑版本
        await syncUserEditToBackend(finalUserEditedText);
        // 等待同步完成
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // 停止录音，传递用户编辑的文本用于保存历史记录
      const response = await fetch(`${API_BASE_URL}/api/recording/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_edited_text: finalUserEditedText || null
        }),
      });
      const data = await response.json();
      
      // 停止录音后，使用用户编辑版本（如果有），否则使用ASR最终版本
      const finalText = finalUserEditedText || data.final_text || '';
      if (finalText) {
        setText(finalText);
        userEditBufferRef.current = finalText;
        asrBufferRef.current = data.final_text || finalText;
      }
      
      if (!data.success) {
        setError(data.message);
      }
    } catch (e) {
      setError(`停止录音失败: ${e}`);
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

  const loadRecords = async () => {
    if (!apiConnected) return;
    
    setLoadingRecords(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/records?limit=100&offset=0`);
      const data = await response.json();
      if (data.success) {
        setRecords(data.records);
      } else {
        setError('加载历史记录失败');
      }
    } catch (e) {
      setError(`加载历史记录失败: ${e}`);
    } finally {
      setLoadingRecords(false);
    }
  };

  const deleteRecord = async (recordId: string) => {
    if (!apiConnected) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/records/${recordId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        // 重新加载记录列表
        await loadRecords();
      } else {
        setError('删除记录失败');
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
        const loadedText = data.text;
        setText(loadedText);
        // 重置缓冲区和操作历史
        asrBufferRef.current = loadedText;
        userEditBufferRef.current = loadedText;
        lastMergedAsrRef.current = loadedText;
        isEditingRef.current = false;
        operationHistoryRef.current = [];
        pendingAsrOperationsRef.current = [];
        lastAsrOperationsRef.current = [];
        setActiveView('workspace');
      }
    } catch (e) {
      setError(`加载记录失败: ${e}`);
    }
  };

  // ASR更新处理 - 使用操作转换系统
  const handleAsrTextUpdate = (asrText: string) => {
    // 1. 更新ASR缓冲区（始终更新，后端会自动保存）
    const oldAsr = asrBufferRef.current;
    asrBufferRef.current = asrText;

    // 2. 将ASR文本变化转换为操作
    const asrOperations = OperationTransformer.diffToOperations(oldAsr, asrText, 'asr');
    
    if (asrOperations.length === 0) {
      return; // 没有变化
    }

    // 3. 如果用户没有在编辑，直接应用ASR操作
    if (!isEditingRef.current) {
      // 应用ASR操作到当前文档
      let currentDoc = userEditBufferRef.current || text;
      for (const op of asrOperations) {
        const newDoc = OperationTransformer.applyOperation(currentDoc, op);
        // 只有操作真正改变了文档时才记录
        if (newDoc !== currentDoc) {
          currentDoc = newDoc;
          operationHistoryRef.current.push(op);
        }
      }
      
      // 更新显示和缓冲区
      setText(currentDoc);
      userEditBufferRef.current = currentDoc;
      lastMergedAsrRef.current = asrText;
      lastAsrOperationsRef.current = asrOperations;
      
      // 如果是追加操作，通过BlockEditor追加（保持光标位置）
      if (asrOperations.length === 1 && asrOperations[0].type === 'insert' && blockEditorRef.current && state === 'recording') {
        const op = asrOperations[0];
        if (op.text && op.position >= currentDoc.length - op.text.length) {
          // 追加操作，使用BlockEditor追加
          blockEditorRef.current.appendAsrText(op.text);
        }
      }
    } else {
      // 4. 用户正在编辑时，保存ASR操作待合并
      // 转换ASR操作，使其相对于用户操作之后的状态
      const userOperations = operationHistoryRef.current.filter(op => op.author === 'user');
      const transformedAsrOps = OperationTransformer.transformOperations(asrOperations, userOperations);
      
      // 过滤掉空操作（被跳过的操作）
      const validOps = transformedAsrOps.filter(op => {
        if (op.type === 'insert') return op.text && op.text.length > 0;
        if (op.type === 'delete') return op.length && op.length > 0;
        if (op.type === 'replace') return op.text && op.oldText;
        return false;
      });
      
      pendingAsrOperationsRef.current.push(...validOps);
      lastAsrOperationsRef.current = asrOperations;
    }
  };

  // 处理文本内容变化（来自 BlockEditor）
  const handleTextChange = (newText: string) => {
    const oldText = userEditBufferRef.current || text;
    
    // 检查是否是用户编辑（通过比较当前文本和ASR缓冲区）
    const currentAsr = asrBufferRef.current;
    const isUserEdit = newText !== currentAsr;
    
    if (isUserEdit) {
      // 用户编辑：将变化转换为操作
      const userOperations = OperationTransformer.diffToOperations(oldText, newText, 'user');
      
      if (userOperations.length > 0) {
        // 转换用户操作，使其相对于已应用的ASR操作之后的状态
        const asrOps = operationHistoryRef.current.filter(op => op.author === 'asr');
        const transformedUserOps = OperationTransformer.transformOperations(userOperations, asrOps);
        
        // 应用用户操作
        let currentDoc = oldText;
        for (const op of transformedUserOps) {
          const newDoc = OperationTransformer.applyOperation(currentDoc, op);
          // 只有操作真正改变了文档时才记录
          if (newDoc !== currentDoc) {
            currentDoc = newDoc;
            operationHistoryRef.current.push(op);
          }
        }
        
        // 标记编辑状态并同步
        isEditingRef.current = true;
        setText(currentDoc);
        userEditBufferRef.current = currentDoc;
        
        // 清除之前的定时器
        if (editingTimeoutRef.current) {
          clearTimeout(editingTimeoutRef.current);
        }
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
        
        // 设置新的定时器：用户停止输入2秒后，标记为停止编辑并合并ASR新内容
        editingTimeoutRef.current = setTimeout(() => {
          isEditingRef.current = false;
          editingTimeoutRef.current = null;
          mergeAsrUpdates();
        }, 2000);
        
        // 延迟同步用户编辑到后端（防抖）
        syncTimeoutRef.current = setTimeout(() => {
          syncUserEditToBackend(currentDoc);
        }, 1000);
      }
    } else {
      // ASR自动更新：只更新显示和缓冲区，不标记为用户编辑
      // 这种情况发生在appendAsrText调用onContentChange时
      setText(newText);
      userEditBufferRef.current = newText;
    }
  };


  // 合并ASR更新到用户编辑缓冲区 - 使用操作转换系统
  const mergeAsrUpdates = () => {
    const userEdit = userEditBufferRef.current || '';
    const pendingOps = [...pendingAsrOperationsRef.current]; // 复制数组，避免修改原数组
    
    if (pendingOps.length === 0) {
      // 没有待合并的ASR操作
      lastMergedAsrRef.current = asrBufferRef.current;
      return;
    }
    
    // 应用待合并的ASR操作
    let mergedDoc = userEdit;
    
    // 获取所有用户操作（用于转换）
    const allUserOps = operationHistoryRef.current.filter(o => o.author === 'user');
    
    // 按时间戳排序待合并的操作
    const sortedOps = [...pendingOps].sort((a, b) => a.timestamp - b.timestamp);
    
    for (const op of sortedOps) {
      // 转换操作，使其相对于当前文档状态正确
      // 需要转换相对于所有已应用的用户操作
      const transformedOp = OperationTransformer.transformOperations([op], allUserOps)[0];
      
      // 应用转换后的操作
      const newDoc = OperationTransformer.applyOperation(mergedDoc, transformedOp);
      
      // 只有操作真正改变了文档时才记录
      if (newDoc !== mergedDoc) {
        mergedDoc = newDoc;
        operationHistoryRef.current.push(transformedOp);
      }
    }
    
    // 清空待合并操作
    pendingAsrOperationsRef.current = [];
    
    // 更新显示和缓冲区
    setText(mergedDoc);
    userEditBufferRef.current = mergedDoc;
    lastMergedAsrRef.current = asrBufferRef.current;
    
    // 同步合并后的文本到后端
    syncUserEditToBackend(mergedDoc);
    
    console.log('[OT合并] 已合并ASR操作，文档长度:', mergedDoc.length, '操作数:', sortedOps.length);
  };
  
  // 同步用户编辑到后端（带防抖和去重）
  const syncUserEditToBackend = async (userText: string) => {
    if (!apiConnected || (state !== 'recording' && state !== 'paused')) {
      return;
    }
    
    try {
      // 调用API同步用户编辑的文本
      const response = await fetch(`${API_BASE_URL}/api/recording/sync-edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: userText }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log('[同步] 用户编辑已同步到后端');
        }
      }
    } catch (e) {
      console.error('[同步] 同步用户编辑失败:', e);
    }
  };

  useEffect(() => {
    if (activeView === 'history' && apiConnected) {
      loadRecords();
    }
  }, [activeView, apiConnected]);

  return (
    <div className="app">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      
      <div className="app-main">
        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        {activeView === 'workspace' && (
          <Workspace
            text={text}
            onTextChange={handleTextChange}
            isRecording={state === 'recording'}
            isPaused={state === 'paused'}
            onAsrTextUpdate={handleAsrTextUpdate}
            onStartRecording={startRecording}
            onPauseRecording={pauseRecording}
            onResumeRecording={resumeRecording}
            onStopRecording={stopRecording}
            onCopyText={copyText}
            apiConnected={apiConnected}
            recordingState={state}
            blockEditorRef={blockEditorRef}
          />
        )}

        {activeView === 'history' && (
          <HistoryView
            records={records}
            loading={loadingRecords}
            onLoadRecord={loadRecord}
            onDeleteRecord={deleteRecord}
          />
        )}

        {activeView === 'settings' && (
          <div className="settings-view">
            <div className="settings-content">
              <h2>设置</h2>
              <p>设置功能开发中...</p>
            </div>
          </div>
        )}
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

