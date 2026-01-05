import { useState, useEffect, useRef, useMemo } from 'react';
import { Sidebar, AppView } from './components/shared/Sidebar';
import { VoiceNote } from './components/apps/VoiceNote/VoiceNote';
import { SmartChat } from './components/apps/SmartChat/SmartChat';
import VoiceZen from './components/apps/VoiceZen/VoiceZen';
import { KnowledgeBase } from './components/apps/KnowledgeBase/KnowledgeBase';
import { MembershipContainer } from './components/apps/Membership/MembershipContainer';
import { HistoryView } from './components/shared/HistoryView';
import { SettingsView } from './components/shared/SettingsView';
import { AboutView } from './components/shared/AboutView';
import { Toast } from './components/shared/Toast';
import { ErrorBanner, ErrorToast } from './components/shared/SystemErrorDisplay';
import { SystemErrorInfo, ErrorCodes, ErrorCategory } from './utils/errorCodes';
import { AutoSaveService } from './services/AutoSaveService';
import { VoiceNoteAdapter } from './services/adapters/VoiceNoteAdapter';
import './App.css';

const API_BASE_URL = 'http://127.0.0.1:8765';

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
  const [systemError, setSystemError] = useState<SystemErrorInfo | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('voice-note');
  const [records, setRecords] = useState<Record[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [appFilter, setAppFilter] = useState<'all' | 'voice-note' | 'smart-chat' | 'voice-zen'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning'; duration?: number } | null>(null);
  
  // 工作状态管理
  const [activeWorkingApp, setActiveWorkingApp] = useState<AppView | null>(null);
  const [isWorkSessionActive, setIsWorkSessionActive] = useState(false);
  
  // 核心：当前正在工作的任务ID
  // null = 没有正在进行的任务（idle）
  // string = 有正在进行的任务（working/paused）
  const [currentWorkingRecordId, setCurrentWorkingRecordId] = useState<string | null>(null);
  
  // 工作会话状态
  type WorkSessionState = 'idle' | 'working' | 'paused';
  const [workSessionState, setWorkSessionState] = useState<WorkSessionState>('idle');
  
  // 综合判断：是否真正在工作
  // 考虑因素：工作状态 + ASR状态 + 任务ID
  const isReallyWorking = 
    workSessionState === 'working' || 
    asrState === 'recording' || 
    asrState === 'stopping' ||
    currentWorkingRecordId !== null;
  
  // SmartChat 和 VoiceZen 的工作状态（通过回调更新）
  const [smartChatHasContent, setSmartChatHasContent] = useState(false);
  const [voiceZenHasContent, setVoiceZenHasContent] = useState(false);
  
  const [initialBlocks, setInitialBlocks] = useState<any[] | undefined>(undefined);
  
  const blockEditorRef = useRef<{ 
    appendAsrText: (text: string, isDefiniteUtterance?: boolean, timeInfo?: any) => void;
    setNoteInfoEndTime: () => string;
    getNoteInfo: () => any;
    getBlocks: () => any[];
    setBlocks: (blocks: any[]) => void;
    appendSummaryBlock: (summary: string) => void;
    updateSummaryBlock: (summary: string) => void;
    finalizeSummaryBlock: () => void;
    removeSummaryBlock: () => void;
  } | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dbSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // ASR 所有者追踪：记录当前哪个 app 正在使用 ASR
  const [asrOwner, setAsrOwner] = useState<AppView | null>(null);
  
  // 当前编辑的 block ID（用于判断临时状态）
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  
  // 创建 VoiceNote 适配器
  const voiceNoteAdapter = useMemo(() => {
    return new VoiceNoteAdapter(
      () => blockEditorRef.current?.getBlocks?.() || [],
      () => blockEditorRef.current?.getNoteInfo?.()
    );
  }, []);
  
  // 创建 VoiceNote 自动保存服务
  const voiceNoteAutoSave = useMemo(() => {
    return new AutoSaveService('voice-note', voiceNoteAdapter, undefined, {
      onRecordIdCreated: (recordId) => {
        setCurrentWorkingRecordId(recordId);
      }
    });
  }, [voiceNoteAdapter]);
  
  // 同步编辑状态到适配器
  useEffect(() => {
    voiceNoteAdapter.setEditingBlockId(editingBlockId);
    voiceNoteAutoSave.setEditingItemId(editingBlockId);
  }, [editingBlockId, voiceNoteAdapter, voiceNoteAutoSave]);
  
  // 状态持久化：保存 currentWorkingRecordId 和 workSessionState 到 localStorage
  useEffect(() => {
    if (currentWorkingRecordId) {
      localStorage.setItem('currentWorkingRecordId', currentWorkingRecordId);
      localStorage.setItem('workSessionState', workSessionState);
    } else {
      localStorage.removeItem('currentWorkingRecordId');
      localStorage.removeItem('workSessionState');
    }
  }, [currentWorkingRecordId, workSessionState]);
  
  // 应用启动时恢复状态
  useEffect(() => {
    const savedRecordId = localStorage.getItem('currentWorkingRecordId');
    const savedState = localStorage.getItem('workSessionState') as WorkSessionState | null;
    
    if (savedRecordId && savedState === 'paused') {
      // 自动设置状态（用户返回语音笔记时会触发恢复）
      setCurrentWorkingRecordId(savedRecordId);
      setWorkSessionState('paused');
      voiceNoteAutoSave.setCurrentRecordId(savedRecordId);
      
      // 提示用户
      setTimeout(() => {
        setToast({ 
          message: '检测到未完成的笔记，返回语音笔记将自动恢复', 
          type: 'info',
          duration: 5000
        });
      }, 1000);
    }
  }, []);  // 只在组件挂载时执行一次

  // 开始工作会话
  const startWorkSession = (app: AppView, recordId?: string): boolean => {
    setActiveWorkingApp(app);
    setIsWorkSessionActive(true);
    
    if (app === 'voice-note') {
      // 如果提供了 recordId，说明是恢复任务
      if (recordId) {
        setCurrentWorkingRecordId(recordId);
      }
      setWorkSessionState('working');
    }
    
    return true;
  };

  // 暂停工作会话（切换视图时调用）
  const pauseWorkSession = () => {
    if (activeView === 'voice-note' && currentWorkingRecordId) {
      // 切换到 paused 状态，保留 recordId
      setWorkSessionState('paused');
      // 不清空 isWorkSessionActive，以便返回时恢复
    }
  };

  // 结束工作会话（EXIT时调用）
  const endWorkSession = () => {
    setActiveWorkingApp(null);
    setIsWorkSessionActive(false);
    setWorkSessionState('idle');
    
    // 清空当前工作ID（关键！）
    setCurrentWorkingRecordId(null);
    
    // 清空 blocks 和重置 AutoSave
    setInitialBlocks(undefined);
    setText('');
    if (activeView === 'voice-note') {
      voiceNoteAutoSave.reset();
    }
  };

  // EXIT退出：保存后退出（显示欢迎界面，开始全新记录）
  const exitWithSave = async () => {
    console.log('[EXIT] 准备退出', { 
      asrState, 
      currentWorkingRecordId, 
      workSessionState,
      isReallyWorking 
    });
    
    if (!apiConnected) {
      setSystemError({
        code: ErrorCodes.API_SERVER_UNAVAILABLE,
        category: ErrorCategory.NETWORK,
        message: 'API未连接',
        user_message: 'API服务器未连接',
        suggestion: '请确认后端服务已启动'
      });
      return;
    }

    // 必须先停止ASR
    if (asrState !== 'idle') {
      setToast({ message: '请先停止ASR后再退出', type: 'info' });
      return;
    }

    // 如果是 voice-note，保存所有数据（包括临时状态）
    if (activeView === 'voice-note') {
      try {
        // 获取所有 blocks（不过滤临时状态）
        const blocks = blockEditorRef.current?.getBlocks?.() || [];
        const noteInfo = blockEditorRef.current?.getNoteInfo?.();
        
        // 检查是否有内容
        const hasContent = blocks.some((b: any) => 
          b.type !== 'note-info' && 
          !b.isBufferBlock && 
          (b.content?.trim() || b.type === 'image')
        );
        
        if (hasContent) {
          // ✅ 修复：保留 note-info 块用于保存，只过滤 buffer blocks
          const allBlocks = blocks.filter((b: any) => 
            !b.isBufferBlock
          );
          
          // 构建文本内容（用于 text 字段，不包含 note-info）
          const textContent = allBlocks
            .filter((b: any) => b.type !== 'note-info')
            .map((b: any) => {
              if (b.isSummary) {
                return `[SUMMARY_BLOCK_START]${b.content}[SUMMARY_BLOCK_END]`;
              }
              // 图片块：添加占位符
              if (b.type === 'image') {
                return `[IMAGE: ${b.imageUrl || ''}]${b.imageCaption ? ' ' + b.imageCaption : ''}`;
              }
              return b.content;
            })
            .filter((text: string) => text?.trim())
            .join('\n');
          
          // 构建保存数据
          const saveData = {
            text: textContent,
            app_type: 'voice-note',
            metadata: {
              blocks: allBlocks,  // 保存所有 blocks（包括临时状态）
              noteInfo,
              trigger: 'exit_with_all_data',
              timestamp: Date.now(),
              block_count: allBlocks.length,
            },
          };
          
          // 更新或创建记录
          const recordId = voiceNoteAutoSave.getCurrentRecordId();
          if (recordId) {
            const response = await fetch(`${API_BASE_URL}/api/records/${recordId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(saveData),
            });
            
            if (!response.ok) {
              throw new Error(`更新记录失败: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.message || '更新记录失败');
            }
          } else {
            const response = await fetch(`${API_BASE_URL}/api/text/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(saveData),
            });
            
            if (!response.ok) {
              throw new Error(`创建记录失败: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.message || '创建记录失败');
            }
          }
          
          setToast({ message: '笔记已保存，退出成功', type: 'success' });
        } else {
          setToast({ message: '已退出，可以开始新的记录', type: 'info' });
        }
        
        // 退出工作会话
        endWorkSession();
        
      } catch (e) {
        console.error('[Exit] 保存失败:', e);
        const confirmed = window.confirm('保存失败，是否仍然退出？未保存的内容将丢失。');
        if (confirmed) {
          endWorkSession();
        }
      }
    } else {
      // 其他应用直接退出
      endWorkSession();
    }
  };

  // 应用切换处理
  const handleViewChange = async (newView: AppView) => {
    // 如果 ASR 正在录音，阻止切换
    if (asrState === 'recording') {
      const ownerName = asrOwner === 'voice-note' ? '语音笔记' : 
                        asrOwner === 'smart-chat' ? '智能助手' : 
                        asrOwner === 'voice-zen' ? '禅' : '当前应用';
      
      setToast({ 
        message: `${ownerName}正在录音中，请先停止录音再切换界面`, 
        type: 'warning',
        duration: 3000
      });
      return;
    }
    
    // 离开 voice-note 时
    if (activeView === 'voice-note' && newView !== 'voice-note') {
      if (isWorkSessionActive && currentWorkingRecordId) {
        // 立即保存
        await voiceNoteAutoSave.saveToDatabase('view_switch', true);
        // 暂停工作会话（保留 recordId）
        pauseWorkSession();
      }
    }
    
    // 返回 voice-note 时
    if (activeView !== 'voice-note' && newView === 'voice-note') {
      console.log('[导航] 返回语音笔记', { 
        workSessionState, 
        currentWorkingRecordId 
      });
      
      // 先切换视图
      setActiveView(newView);
      
      // 如果有暂停的任务，自动恢复
      if (workSessionState === 'paused' && currentWorkingRecordId) {
        console.log('[导航] 恢复暂停的任务', currentWorkingRecordId);
        
        setTimeout(async () => {
          try {
            // 恢复工作会话
            startWorkSession('voice-note', currentWorkingRecordId);
            
            // 使用 AutoSave 恢复数据
            const recoveredData = await voiceNoteAutoSave.recover(currentWorkingRecordId);
            
            if (recoveredData && recoveredData.blocks) {
              setInitialBlocks(recoveredData.blocks);
              
              // 提取文本
              const textContent = recoveredData.blocks
                .filter((b: any) => b.type !== 'note-info' && !b.isBufferBlock)
                .map((b: any) => b.content)
                .filter((text: string) => text.trim())
                .join('\n');
              setText(textContent);
              
              setToast({ 
                message: '已恢复工作现场', 
                type: 'info',
                duration: 2000
              });
            }
          } catch (e) {
            console.error('[导航] 恢复失败:', e);
          }
        }, 100);
        return;
      }
      
      // 否则，显示欢迎界面（没有正在进行的任务）
      // 不需要额外操作，VoiceNote 组件会根据状态显示欢迎界面
      return;
    }
    
    // 其他情况，直接切换
    setActiveView(newView);
  };

  // 启动和停止 VoiceNote 自动保存服务
  useEffect(() => {
    if (isWorkSessionActive && activeView === 'voice-note') {
      voiceNoteAutoSave.start();
      
      return () => {
        voiceNoteAutoSave.stop();
      };
    }
  }, [isWorkSessionActive, activeView, voiceNoteAutoSave]);

  // 在页面刷新/关闭前警告用户（如果正在录音）
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 如果正在录音，警告用户
      if (asrState === 'recording') {
        e.preventDefault();
        e.returnValue = '正在录音中，刷新页面会停止录音。确定要继续吗？';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [asrState]);

  // 使用 ref 追踪上一次的连接状态，避免状态更新时序问题
  const lastApiConnectedRef = useRef<boolean>(false);
  const hasShownConnectedToastRef = useRef<boolean>(false);
  const consecutiveFailuresRef = useRef<number>(0); // 连续失败次数

  // 检查API连接
  const checkApiConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/status`, {
        signal: AbortSignal.timeout(2000) // 2秒超时
      });
      const connected = response.ok;
      
      // 连接成功，重置失败计数
      if (connected) {
        consecutiveFailuresRef.current = 0;
      }
      
      // 使用 ref 来判断状态是否真正变化
      if (connected !== lastApiConnectedRef.current) {
        lastApiConnectedRef.current = connected;
        setApiConnected(connected);
        
        if (connected) {
          // 连接成功，清除错误
          if (systemError?.code === ErrorCodes.API_SERVER_UNAVAILABLE || 
              systemError?.code === ErrorCodes.NETWORK_UNREACHABLE) {
            setSystemError(null);
          }
          
          // 只在首次连接成功时显示 Toast，避免每5秒都显示
          if (!hasShownConnectedToastRef.current) {
            setToast({ message: 'API服务器已连接', type: 'success', duration: 2000 });
            hasShownConnectedToastRef.current = true;
          }
        } else {
          // 连接断开时重置标志，以便重新连接时可以再次显示 Toast
          hasShownConnectedToastRef.current = false;
          
          setSystemError({
            code: ErrorCodes.API_SERVER_UNAVAILABLE,
            category: ErrorCategory.NETWORK,
            message: 'API服务器不可用',
            user_message: '无法连接到API服务器，请确认后端服务已启动',
            suggestion: '1. 确认后端服务已启动\n2. 检查端口8765是否被占用\n3. 查看服务器日志'
          });
        }
      }
      
      return connected;
    } catch (e) {
      // 增加失败计数
      consecutiveFailuresRef.current += 1;
      
      if (lastApiConnectedRef.current === false) {
        // 已经是 false，不需要重复设置错误（避免覆盖其他模块设置的更具体的错误）
        return false;
      }
      
      lastApiConnectedRef.current = false;
      hasShownConnectedToastRef.current = false;
      setApiConnected(false);
      
      // 只有连续失败 3 次以上才设置网络错误（避免短暂波动误报）
      // 并且只在没有其他错误时才设置（避免覆盖更具体的错误）
      if (consecutiveFailuresRef.current >= 3 && !systemError) {
        setSystemError({
          code: ErrorCodes.NETWORK_UNREACHABLE,
          category: ErrorCategory.NETWORK,
          message: '网络不可达',
          user_message: '网络连接失败，请检查网络连接',
          suggestion: '1. 检查网络连接\n2. 确认API服务器地址正确\n3. 检查防火墙设置'
        });
      }
      return false;
    }
  };
  
  // 启动时立即检查API连接，并定期检查
  useEffect(() => {
    // 立即执行第一次检查
    checkApiConnection();
    
    // 每5秒检查一次API连接状态
    const intervalId = setInterval(() => {
      checkApiConnection();
    }, 5000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, []); // 只在组件挂载时设置

  // ==================== 视图切换时的状态同步 ====================
  useEffect(() => {
    // 当切换到任何视图且 API 已连接时，同步后端 ASR 状态
    if (apiConnected) {
      fetch(`${API_BASE_URL}/api/status`)
        .then(res => res.json())
        .then(data => {
          const backendState = data.state;
          
          if (backendState !== asrState) {
            setAsrState(backendState);
          }
        })
        .catch(error => {
          console.error('[状态同步] 获取后端状态失败:', error);
        });
    }
  }, [activeView, apiConnected, asrOwner]); // 添加 asrOwner 依赖

  // ==================== IPC 消息监听（替代 WebSocket）====================
  useEffect(() => {
    // 定义消息处理函数
    const handleAsrMessage = (data: any) => {
      try {
        // 只对重要消息类型打印日志，text_update 太频繁不打印
        // (已移除调试日志，保持代码简洁)

        switch (data.type) {
          case 'initial_state':
            console.log(`[IPC] 初始状态同步: state=${data.state}`);
            setAsrState(data.state);
            if (data.text) setText(data.text);
            break;
          case 'text_update':
            // 中间结果（实时更新）
            if (activeView === 'voice-note' && blockEditorRef.current) {
              blockEditorRef.current.appendAsrText(data.text || '', false);
            }
            break;
          case 'text_final':
            // 确定的结果（完整utterance）- 包含时间信息
            if (activeView === 'voice-note' && blockEditorRef.current) {
              blockEditorRef.current.appendAsrText(
                data.text || '',
                true,
                {
                  startTime: data.start_time,
                  endTime: data.end_time
                }
              );
            }
            break;
          case 'state_change':
            setAsrState(data.state);
            
            // 如果 ASR 停止（从 recording 变为其他状态），清除 ASR 所有者
            if (data.state !== 'recording' && asrState === 'recording') {
              setAsrOwner(null);
            }
            break;
          case 'state_sync':
            // 新增：状态强制同步
            setAsrState(data.state);
            break;
          case 'asr_timeout':
            // ASR连接超时
            console.log('[IPC] ASR连接超时，已自动停止');
            setAsrState('idle');
            setAsrOwner(null);
            
            // 显示友好提示
            setToast({
              message: '语音识别已达到最大连接时长（90分钟），已自动停止。您可以重新开始录音。',
              type: 'warning',
              duration: 8000  // 显示8秒
            });
            break;
          case 'error':
            // 后端必须返回完整的 SystemErrorInfo 对象
            if (data.error && typeof data.error === 'object' && data.error.code) {
              setSystemError(data.error);
            } else {
              console.error('[IPC] 收到不完整的错误信息:', data);
              setSystemError({
                code: ErrorCodes.UNKNOWN_ERROR,
                category: ErrorCategory.SYSTEM,
                message: '未知错误',
                user_message: data.message || '发生未知错误',
                suggestion: '请查看控制台日志'
              });
            }
            break;
          default:
            console.warn('[IPC] 未知的消息类型:', data.type);
        }
      } catch (e) {
        console.error('[IPC] 处理消息失败:', e);
      }
    };

    // 设置IPC监听器（会自动移除旧的）
    if (window.electronAPI?.onAsrMessage) {
      window.electronAPI.onAsrMessage(handleAsrMessage);
    } else {
      console.warn('[IPC] electronAPI 不可用');
    }

    // 清理函数：移除所有监听器
    return () => {
      if (window.electronAPI?.removeAllAsrMessageListeners) {
        window.electronAPI.removeAllAsrMessageListeners();
      }
    };
  }, [activeView, asrState, asrOwner]); // 添加 asrOwner 依赖

  // ASR控制函数
  const callAsrApi = async (endpoint: string) => {
    if (!apiConnected) {
      setSystemError({
        code: ErrorCodes.API_SERVER_UNAVAILABLE,
        category: ErrorCategory.NETWORK,
        message: 'API未连接',
        user_message: 'API服务器未连接',
        suggestion: '请确认后端服务已启动'
      });
      return false;
    }
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'POST' });
      const data = await response.json();
      if (!data.success) {
        // 后端必须返回完整的 SystemErrorInfo 对象
        if (data.error && typeof data.error === 'object' && data.error.code) {
          // 音频设备错误使用 Toast 显示（不阻塞界面）
          if (data.error.code >= 2000 && data.error.code < 3000) {
            setSystemError(data.error);
            // 同时显示 Toast，3秒后自动清除错误
            setTimeout(() => setSystemError(null), 3000);
          } else {
            setSystemError(data.error);
          }
        } else {
          console.error('[callAsrApi] 收到不完整的错误信息:', data);
          setSystemError({
            code: ErrorCodes.ASR_SERVICE_ERROR,
            category: ErrorCategory.ASR,
            message: '操作失败',
            user_message: data.message || '操作失败',
            suggestion: '请重试，如问题持续请查看日志'
          });
        }
        return false;
      }
      return true;
    } catch (e) {
      setSystemError({
        code: ErrorCodes.NETWORK_TIMEOUT,
        category: ErrorCategory.NETWORK,
        message: '操作失败',
        user_message: '网络请求失败',
        suggestion: '请检查网络连接并重试',
        technical_info: String(e)
      });
      return false;
    }
  };

  const startAsr = async (requestingApp?: AppView) => {
    if (!apiConnected) {
      setSystemError({
        code: ErrorCodes.API_SERVER_UNAVAILABLE,
        category: ErrorCategory.NETWORK,
        message: 'API未连接',
        user_message: 'API服务器未连接',
        suggestion: '请确认后端服务已启动'
      });
      return false;
    }
    
    // ASR 互斥访问控制：检查是否有其他 app 正在使用 ASR
    if (asrOwner && requestingApp && asrOwner !== requestingApp) {
      const ownerName = asrOwner === 'voice-note' ? '语音笔记' : 
                        asrOwner === 'smart-chat' ? '智能助手' : 
                        asrOwner === 'voice-zen' ? '禅' : asrOwner;
      const requesterName = requestingApp === 'voice-note' ? '语音笔记' : 
                           requestingApp === 'smart-chat' ? '智能助手' : 
                           requestingApp === 'voice-zen' ? '禅' : requestingApp;
      
      setToast({ 
        message: `ASR 正在被"${ownerName}"使用，无法启动"${requesterName}"的录音`, 
        type: 'warning',
        duration: 4000
      });
      console.warn(`[ASR互斥] 拒绝启动：${asrOwner} 正在使用 ASR，${requestingApp} 无法启动`);
      return false;
    }
    
    // 防止重复调用：如果已经在录音中或正在停止，直接返回
    if (asrState === 'recording' || asrState === 'stopping') {
      console.log('[App] ASR已在运行中或停止中，忽略重复启动请求');
      return false;
    }
    
    // 立即更新状态为recording，防止重复点击
    setAsrState('recording');
    
    // 设置 ASR 所有者
    if (requestingApp) {
      setAsrOwner(requestingApp);
      console.log(`[ASR] 设置 ASR 所有者: ${requestingApp}`);
    }
    
    const success = await callAsrApi('/api/recording/start');
    if (!success) {
      // 如果启动失败，重置状态和所有者
      setAsrState('idle');
      setAsrOwner(null);
    }
    return success;
  };
  
  const stopAsr = async () => {
    if (!apiConnected) {
      console.warn('[App] API未连接，无法停止ASR');
      return;
    }
    
    // 防止重复调用：如果已经在停止中，直接返回
    if (asrState === 'stopping') {
      console.log('[App] ASR已在停止中，忽略重复调用');
      return;
    }
    
    console.log('[App] 开始停止ASR...');
    
    // 立即更新状态为stopping，防止重复点击
    setAsrState('stopping');
    
    // 设置超时保护：如果10秒后状态还是stopping，强制重置为idle
    const timeoutId = setTimeout(() => {
      console.warn('[App] ASR停止超时(10秒)，强制重置状态为idle');
      setAsrState('idle');
      // 停止超时使用 Toast，不阻塞界面
      setToast({ 
        message: 'ASR停止超时，已强制重置。如问题持续，请重启应用', 
        type: 'warning',
        duration: 5000
      });
    }, 10000);
    
    try {
      console.log('[App] 发送停止请求到: /api/recording/stop');
      const response = await fetch(`${API_BASE_URL}/api/recording/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_edited_text: null }),
        signal: AbortSignal.timeout(8000) // 8秒超时，给后端充足时间（后端最多等5秒）
      });
      
      // 清除超时定时器
      clearTimeout(timeoutId);
      
      console.log(`[App] 停止请求响应状态: ${response.status}`);
      
      if (!response.ok) {
        console.error('[App] 停止请求HTTP错误:', response.status, response.statusText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[App] 停止请求响应数据:', data);
      
      if (data.success) {
        console.log('[App] ASR停止成功（静默）');
        // 正常停止时静默，不显示提示
      } else {
        console.error('[App] ASR停止失败:', data.message);
        // 停止失败使用 Toast，不阻塞界面
        setToast({ 
          message: `停止失败: ${data.message}`, 
          type: 'error',
          duration: 5000
        });
        // 如果停止失败，重置状态为idle
        setAsrState('idle');
      }
    } catch (e) {
      // 清除超时定时器
      clearTimeout(timeoutId);
      
      console.error('[App] 停止ASR请求失败:', e);
      
      // 停止失败使用 Toast，不阻塞界面
      const errorMessage = e instanceof Error ? e.message : String(e);
      setToast({ 
        message: `停止ASR失败: ${errorMessage.includes('timeout') ? '请求超时' : '网络错误'}`, 
        type: 'error',
        duration: 5000
      });
      
      // 发生错误时，强制重置状态为idle
      setAsrState('idle');
    }
  };

  // 启动ASR
  const handleAsrStart = async () => {
    if (asrState === 'idle') {
      // 传入当前视图作为请求者
      await startAsr(activeView);
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
      setSystemError({
        code: ErrorCodes.API_SERVER_UNAVAILABLE,
        category: ErrorCategory.NETWORK,
        message: 'API未连接',
        user_message: 'API服务器未连接',
        suggestion: '请确认后端服务已启动'
      });
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
      const appType = activeView === 'smart-chat' ? 'smart-chat' : 'voice-note';
      
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
        setToast({ message: '已保存到历史记录', type: 'success' });
        // 保存成功后，不清空内容，让用户可以继续编辑或查看
        // 注意：不调用 endWorkSession()，让用户可以继续使用
      } else {
        // 使用 SystemErrorInfo
        if (data.error && data.error.code) {
          setSystemError(data.error);
        } else {
          setSystemError({
            code: ErrorCodes.STORAGE_WRITE_FAILED,
            category: ErrorCategory.STORAGE,
            message: '保存失败',
            user_message: data.message || '保存失败',
            suggestion: '请重试保存操作'
          });
        }
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
    console.log('[创建新笔记]', { 
      currentWorkingRecordId, 
      hasContent: !!text?.trim() 
    });
    
    if (!apiConnected) {
      setSystemError({
        code: ErrorCodes.API_SERVER_UNAVAILABLE,
        category: ErrorCategory.NETWORK,
        message: 'API未连接',
        user_message: 'API服务器未连接',
        suggestion: '请确认后端服务已启动'
      });
      return;
    }
    
    if (asrState !== 'idle') {
      setToast({ message: '请先停止ASR后再创建新笔记', type: 'info' });
      return;
    }
    
    try {
      // 如果有当前任务且有内容，先保存
      if (currentWorkingRecordId && text && text.trim()) {
        console.log('[创建新笔记] 保存当前笔记', currentWorkingRecordId);
        await voiceNoteAutoSave.saveToDatabase('manual', true);
        setToast({ message: '当前笔记已保存', type: 'success' });
      }
      
      // 清空状态，开始全新任务
      console.log('[创建新笔记] 重置状态');
      setCurrentWorkingRecordId(null);
      voiceNoteAutoSave.reset();
      voiceNoteAutoSave.setCurrentRecordId(null);
      setInitialBlocks(undefined);
      setText('');
      localStorage.removeItem('voiceNoteDraft');
      
      // 保持工作会话（用户可以直接开始输入）
      setWorkSessionState('working');
      setIsWorkSessionActive(true);
      
      setToast({ message: '已开始新笔记，可以开始记录了', type: 'success' });
      
    } catch (e) {
      console.error('[创建新笔记] 失败:', e);
      setSystemError({
        code: ErrorCodes.STORAGE_WRITE_FAILED,
        category: ErrorCategory.STORAGE,
        message: '保存失败',
        user_message: '保存当前笔记失败',
        suggestion: '请重试',
        technical_info: String(e)
      });
    }
  };

  // 历史记录
  const RECORDS_PER_PAGE = 20;
  
  const loadRecords = async (page: number = currentPage, filter: 'all' | 'voice-note' | 'smart-chat' | 'voice-zen' = appFilter) => {
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
        // 使用 SystemErrorInfo
        if (data.error && data.error.code) {
          setSystemError(data.error);
        } else {
          setSystemError({
            code: ErrorCodes.STORAGE_READ_FAILED,
            category: ErrorCategory.STORAGE,
            message: '加载失败',
            user_message: '加载历史记录失败',
            suggestion: '请刷新页面重试'
          });
        }
      }
    } catch (e) {
      setSystemError({
        code: ErrorCodes.STORAGE_READ_FAILED,
        category: ErrorCategory.STORAGE,
        message: '读取失败',
        user_message: '加载历史记录失败',
        suggestion: '1. 检查网络连接\n2. 刷新页面重试\n3. 确认数据库文件完整',
        technical_info: String(e)
      });
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
        // 使用 SystemErrorInfo
        if (data.error && data.error.code) {
          setSystemError(data.error);
        } else {
          setSystemError({
            code: ErrorCodes.STORAGE_WRITE_FAILED,
            category: ErrorCategory.STORAGE,
            message: '删除失败',
            user_message: data.message || '删除记录失败',
            suggestion: '请重试删除操作'
          });
        }
      }
    } catch (e) {
      setSystemError({
        code: ErrorCodes.STORAGE_WRITE_FAILED,
        category: ErrorCategory.STORAGE,
        message: '删除失败',
        user_message: '删除记录失败',
        suggestion: '1. 检查网络连接\n2. 重试删除操作\n3. 确认数据库文件未被锁定',
        technical_info: String(e)
      });
    }
  };

  const loadRecord = async (recordId: string) => {
    console.log('[历史记录] 恢复记录:', recordId);
    
    if (!apiConnected) {
      console.warn('[历史记录] API未连接，无法恢复任务');
      setToast({ message: 'API未连接，无法恢复任务', type: 'error' });
      return;
    }
    
    try {
      // 使用 AutoSave 恢复
      const recoveredData = await voiceNoteAutoSave.recover(recordId);
      
      if (recoveredData && recoveredData.blocks) {
        console.log('[历史记录] 恢复成功', {
          blocksCount: recoveredData.blocks.length,
          hasNoteInfo: !!recoveredData.noteInfo,
        });
        
        // 设置当前工作ID
        setCurrentWorkingRecordId(recordId);
        voiceNoteAutoSave.setCurrentRecordId(recordId);
        
        // 恢复 blocks
        setInitialBlocks(recoveredData.blocks);
        
        // 提取文本（用于显示）
        const textContent = recoveredData.blocks
          .filter((b: any) => b.type !== 'note-info' && !b.isBufferBlock)
          .map((b: any) => b.content)
          .filter((text: string) => text.trim())
          .join('\n');
        setText(textContent);
        
        // 切换到语音笔记并启动工作会话
        setActiveView('voice-note');
        startWorkSession('voice-note', recordId);
        
        setToast({ message: '已恢复笔记，可以继续编辑', type: 'success' });
      } else {
        console.warn('[历史记录] 恢复失败，数据为空');
        setToast({ message: '记录内容为空', type: 'error' });
      }
    } catch (e) {
      console.error('[历史记录] 恢复失败:', e);
      setSystemError({
        code: ErrorCodes.STORAGE_READ_FAILED,
        category: ErrorCategory.STORAGE,
        message: '读取失败',
        user_message: '加载记录失败',
        suggestion: '1. 检查网络连接\n2. 重试加载\n3. 确认记录ID正确',
        technical_info: String(e)
      });
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
      />
      
      <div className="app-main">
        {/* 系统错误展示 - 使用 ErrorBanner 显示（不阻塞界面） */}
        {systemError && (
          <ErrorBanner
            error={systemError}
            onClose={() => setSystemError(null)}
          />
        )}

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
            currentWorkingRecordId={currentWorkingRecordId}
            onStartWork={() => startWorkSession('voice-note')}
            onEndWork={exitWithSave}
            initialBlocks={initialBlocks}
            onBlockFocus={(blockId) => setEditingBlockId(blockId)}
            onBlockBlur={(blockId) => {
              setEditingBlockId(null);
              voiceNoteAutoSave.saveToDatabase('edit_complete', false);
            }}
            onContentChange={() => {}}
            onNoteInfoChange={() => {}}
            onBlocksChange={() => {}}
            onBlockConfirmed={() => {
              console.log('[保存触发] Block 确定');
              voiceNoteAutoSave.saveToDatabase('block_confirmed', false);
            }}
          />
        )}

        {activeView === 'smart-chat' && (
          <SmartChat 
            asrState={asrState}
            onAsrStart={() => handleAsrStart('smart-chat')}
            onAsrStop={handleAsrStop}
            apiConnected={apiConnected}
            isWorkSessionActive={isWorkSessionActive}
            onStartWork={() => startWorkSession('smart-chat')}
            onEndWork={endWorkSession}
          />
        )}

        {activeView === 'voice-zen' && (
          <VoiceZen 
            onStartWork={() => startWorkSession('voice-zen')}
            onEndWork={endWorkSession}
            onContentChange={setVoiceZenHasContent}
          />
        )}

        {activeView === 'knowledge-base' && (
          <KnowledgeBase />
        )}

        {activeView === 'membership' && (
          <MembershipContainer />
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

      {/* 系统错误 Toast - 用于音频设备等非阻塞性错误 */}
      {systemError && systemError.code >= 2000 && systemError.code < 3000 && (
        <ErrorToast
          error={systemError}
          duration={5000}
          onClose={() => setSystemError(null)}
        />
      )}
    </div>
  );
}

export default App;
