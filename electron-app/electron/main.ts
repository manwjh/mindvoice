/**
 * Electron主进程
 * 负责：
 * 1. 启动和管理Python API服务器进程
 * 2. 创建和管理应用窗口
 * 3. 系统托盘和菜单
 * 4. 应用生命周期管理
 */
import { app, BrowserWindow, Tray, Menu, shell, ipcMain, session, nativeImage } from 'electron';
import { spawn, ChildProcess, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const API_PORT = 8765;
const API_HOST = '127.0.0.1';
const API_URL = `http://${API_HOST}:${API_PORT}`;

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null; // 启动窗口
let tray: Tray | null = null;
let pythonProcess: ChildProcess | null = null;
let isQuitting = false;
let pollingTimer: NodeJS.Timeout | null = null;
let lastMessageId = 0;

/**
 * 轮询后端消息（替代 WebSocket）
 */
async function pollMessages() {
  if (!mainWindow) return;
  
  try {
    const response = await fetch(`${API_URL}/api/messages?after_id=${lastMessageId}`, {
      signal: AbortSignal.timeout(5000), // 5秒超时
    });
    
    if (!response.ok) {
      console.error(`[轮询] HTTP错误: ${response.status}`);
      return;
    }
    
    const data = await response.json() as {
      success: boolean;
      messages?: Array<{ id: number; message: any; timestamp: number }>;
    };
    
    if (data.success && data.messages && data.messages.length > 0) {
      const messages = data.messages; // 保存到局部变量，避免TypeScript类型检查问题
      console.log(`[轮询] 收到 ${messages.length} 条新消息 (lastId: ${lastMessageId})`);
      
      // 通过 IPC 推送到渲染进程
      messages.forEach((item, index) => {
        // Python的time.time()返回秒，需要转换为毫秒（* 1000）
        console.log(`  [${index + 1}/${messages.length}] 消息ID: ${item.id}, 类型: ${item.message.type}, 时间: ${new Date(item.timestamp * 1000).toLocaleTimeString()}`);
        mainWindow?.webContents.send('asr-message', item.message);
        lastMessageId = item.id;
      });
    }
  } catch (error) {
    // 轮询失败不打印错误（避免刷屏），静默重试
    // console.error('[轮询] 请求失败:', error);
  }
}

/**
 * 启动轮询
 */
async function startPolling() {
  if (pollingTimer) {
    console.log('[轮询] 已在运行');
    return;
  }
  
  console.log('[轮询] 开始轮询后端消息 (间隔: 100ms)');
  
  // 清空后端消息缓冲区，避免堆积的旧消息
  try {
    console.log('[轮询] 清空后端消息缓冲区...');
    const response = await fetch(`${API_URL}/api/messages/clear`, {
      method: 'POST',
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      console.log('[轮询] 消息缓冲区已清空');
    }
  } catch (error) {
    console.warn('[轮询] 清空消息缓冲区失败（后端可能未启动）');
  }
  
  lastMessageId = 0; // 重置消息ID
  
  // 立即执行一次
  pollMessages();
  
  // 每 100ms 轮询一次（恢复原始间隔，保证实时性）
  pollingTimer = setInterval(pollMessages, 100);
}

/**
 * 停止轮询
 */
function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log('[轮询] 已停止');
  }
}

/**
 * 检查API服务器是否已经运行
 */
async function checkApiServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/status`, {
      signal: AbortSignal.timeout(1000), // 1秒超时
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 启动Python API服务器
 */
function startPythonServer(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const isDev = !app.isPackaged;
    
    // 更新启动状态
    updateSplashStatus('检查 API 服务器状态...', 10);
    
    // 在开发模式下，先检查API服务器是否已经运行
    if (isDev) {
      console.log('[主进程] 开发模式：检查API服务器是否已运行...');
      const isRunning = await checkApiServerRunning();
      if (isRunning) {
        console.log('[主进程] API服务器已在运行，跳过启动');
        updateSplashStatus('API 服务器已运行', 100);
        resolve();
        return;
      }
      console.log('[主进程] API服务器未运行，将启动新的服务器进程');
    }
    
    updateSplashStatus('准备启动 Python 后端...', 20);
    
    // 获取API服务器路径
    // 在开发环境中，使用 python3 运行 api_server.py
    // 在打包后，直接运行打包好的可执行文件
    let apiExecutable: string;
    let apiArgs: string[] = [];
    
    if (isDev) {
      // 开发环境：使用 python3 运行 api_server.py
      apiExecutable = process.platform === 'win32' ? 'python' : 'python3';
      apiArgs = [path.join(__dirname, '../../api_server.py'), '--host', API_HOST, '--port', String(API_PORT)];
    } else {
      // 生产环境：直接运行打包好的可执行文件
      const apiPath = path.join(process.resourcesPath, 'python-backend', 'mindvoice-api');
      
      // macOS/Linux: 确保可执行文件有执行权限
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(apiPath, 0o755);
        } catch (error) {
          console.warn(`[主进程] 无法设置执行权限: ${error}`);
        }
      }
      
      apiExecutable = apiPath;
      apiArgs = ['--host', API_HOST, '--port', String(API_PORT)];
      
      // 设置工作目录为 resourcesPath，这样 Python 后端可以找到 config.yml.example
      // 注意：用户需要将 config.yml.example 复制为 config.yml 并配置
      console.log(`[主进程] 生产环境工作目录: ${process.resourcesPath}`);
    }
    
    console.log(`[主进程] 启动API服务器: ${apiExecutable} ${apiArgs.join(' ')}`);
    
    // 检查文件是否存在
    if (!fs.existsSync(apiExecutable)) {
      const errorMsg = `API服务器可执行文件不存在: ${apiExecutable}`;
      updateSplashStatus('启动失败', 0, errorMsg);
      reject(new Error(errorMsg));
      return;
    }
    
    updateSplashStatus('正在启动 Python 后端...', 30);
    
    // 启动API服务器进程
    const workDir = isDev ? path.join(__dirname, '../..') : process.resourcesPath;
    console.log(`[主进程] 工作目录: ${workDir}`);
    
    // 生产环境：检查配置文件并设置环境变量
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    };
    
    if (!isDev) {
      const configPath = path.join(process.resourcesPath, 'config.yml');
      const configExamplePath = path.join(process.resourcesPath, 'config.yml.example');
      
      // 设置配置文件路径环境变量（Python 后端会优先使用）
      if (fs.existsSync(configPath)) {
        env.MINDVOICE_CONFIG_PATH = configPath;
        console.log(`[主进程] 设置环境变量 MINDVOICE_CONFIG_PATH: ${configPath}`);
      } else if (fs.existsSync(configExamplePath)) {
        // 如果 config.yml 不存在，尝试使用 config.yml.example（但用户需要复制并配置）
        console.warn(`[主进程] 配置文件不存在: ${configPath}`);
        console.warn(`[主进程] 请从 ${configExamplePath} 复制为 ${configPath} 并配置`);
        console.warn(`[主进程] Python 后端将使用默认配置（功能受限）`);
      } else {
        console.warn(`[主进程] 配置文件模板不存在: ${configExamplePath}`);
        console.warn(`[主进程] Python 后端将使用默认配置（功能受限）`);
      }
    }
    
    pythonProcess = spawn(apiExecutable, apiArgs, {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    
    // 收集所有输出用于调试
    let stdoutBuffer = '';
    let stderrBuffer = '';
    
    pythonProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      stdoutBuffer += output;
      console.log(`[Python stdout] ${output}`);
    });
    
    pythonProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      stderrBuffer += output;
      console.error(`[Python stderr] ${output}`);
    });
    
    pythonProcess.on('error', (error) => {
      console.error(`[主进程] Python进程启动失败: ${error}`);
      console.error(`[主进程] 可执行文件路径: ${apiExecutable}`);
      console.error(`[主进程] 文件是否存在: ${fs.existsSync(apiExecutable)}`);
      const errorMsg = `Python 进程启动失败: ${error.message}\n文件路径: ${apiExecutable}`;
      updateSplashStatus('启动失败', 0, errorMsg);
      reject(error);
    });
    
    pythonProcess.on('exit', (code, signal) => {
      if (code !== null && code !== 0 && !isQuitting) {
        console.error(`[主进程] Python进程异常退出，代码: ${code}, 信号: ${signal}`);
        console.error(`[主进程] stdout: ${stdoutBuffer}`);
        console.error(`[主进程] stderr: ${stderrBuffer}`);
        // 可以在这里实现自动重启逻辑
      } else if (code === 0) {
        console.log(`[主进程] Python进程正常退出`);
      }
    });
    
    // 等待服务器启动（检查端口是否可用）
    let attempts = 0;
    const maxAttempts = 30; // 增加到 30 次（15秒），给 Python 后端更多启动时间
    const checkInterval = setInterval(async () => {
      attempts++;
      
      // 更新进度（30% - 90%）
      const progress = 30 + Math.min(60, (attempts / maxAttempts) * 60);
      updateSplashStatus(`等待 API 服务器启动... (${attempts}/${maxAttempts})`, progress);
      
      // 检查 Python 进程是否还在运行
      if (pythonProcess && pythonProcess.killed) {
        clearInterval(checkInterval);
        const errorMsg = 'Python 进程已退出，无法启动 API 服务器';
        updateSplashStatus('启动失败', 0, errorMsg);
        reject(new Error(errorMsg));
        return;
      }
      
      // 检查进程退出状态
      if (pythonProcess && pythonProcess.exitCode !== null && pythonProcess.exitCode !== 0) {
        clearInterval(checkInterval);
        const errorMsg = `Python 进程异常退出，退出码: ${pythonProcess.exitCode}\n\n错误输出:\n${stderrBuffer.substring(0, 500)}`;
        updateSplashStatus('启动失败', 0, errorMsg);
        reject(new Error(`Python 进程异常退出，退出码: ${pythonProcess.exitCode}\nstdout: ${stdoutBuffer}\nstderr: ${stderrBuffer}`));
        return;
      }
      
      const isRunning = await checkApiServerRunning();
      if (isRunning) {
        clearInterval(checkInterval);
        console.log(`[主进程] API服务器启动成功（检查了 ${attempts} 次）`);
        updateSplashStatus('启动成功！', 100);
        resolve();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        // 检查进程是否还在运行
        if (pythonProcess && pythonProcess.exitCode === null) {
          // 进程还在运行，但 API 还没响应，可能是启动较慢
          console.warn(`[主进程] API服务器启动检查超时（${attempts} 次），但进程仍在运行`);
          console.warn(`[主进程] stdout: ${stdoutBuffer.substring(0, 500)}`);
          console.warn(`[主进程] stderr: ${stderrBuffer.substring(0, 500)}`);
          updateSplashStatus('API 服务器启动较慢，继续运行...', 90);
          // 仍然 resolve，让前端尝试连接（前端有重试机制）
          resolve();
        } else {
          // 进程已退出，拒绝启动
          const errorMsg = `Python 进程已退出，无法启动 API 服务器\n\n错误输出:\n${stderrBuffer.substring(0, 500)}`;
          updateSplashStatus('启动失败', 0, errorMsg);
          reject(new Error(`Python 进程已退出，无法启动 API 服务器\nstdout: ${stdoutBuffer}\nstderr: ${stderrBuffer}`));
        }
      }
    }, 500);
  });
}

/**
 * 通过端口查找并终止进程（用于外部启动的Python服务器）
 */
function killProcessByPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // Windows 使用 netstat 和 taskkill
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (error || !stdout) {
          resolve();
          return;
        }
        const lines = stdout.split('\n');
        const pids = new Set<string>();
        lines.forEach(line => {
          const match = line.match(/\s+(\d+)$/);
          if (match) {
            pids.add(match[1]);
          }
        });
        if (pids.size === 0) {
          resolve();
          return;
        }
        console.log(`[主进程] 找到占用端口 ${port} 的进程: ${Array.from(pids).join(', ')}`);
        exec(`taskkill /F /PID ${Array.from(pids).join(' /PID ')}`, () => {
          resolve();
        });
      });
    } else {
      // macOS/Linux 使用 lsof
      exec(`lsof -ti :${port}`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve();
          return;
        }
        const pids = stdout.trim().split('\n').filter(pid => pid);
        if (pids.length === 0) {
          resolve();
          return;
        }
        console.log(`[主进程] 找到占用端口 ${port} 的进程: ${pids.join(', ')}`);
        // 先尝试优雅终止（SIGTERM）
        exec(`kill -TERM ${pids.join(' ')}`, () => {
          // 等待 2 秒后，如果还有进程在运行，强制终止
          setTimeout(() => {
            exec(`lsof -ti :${port}`, (error2, stdout2) => {
              if (!error2 && stdout2.trim()) {
                const remainingPids = stdout2.trim().split('\n').filter(pid => pid);
                if (remainingPids.length > 0) {
                  console.log(`[主进程] 强制终止进程: ${remainingPids.join(', ')}`);
                  exec(`kill -9 ${remainingPids.join(' ')}`, () => {
                    resolve();
                  });
                } else {
                  resolve();
                }
              } else {
                resolve();
              }
            });
          }, 2000);
        });
      });
    }
  });
}

/**
 * 停止Python API服务器
 */
function stopPythonServer(): Promise<void> {
  return new Promise(async (resolve) => {
    // 首先尝试停止由 Electron 启动的进程
    if (pythonProcess) {
      console.log('[主进程] 停止Python服务器（由Electron启动）...');
      try {
        // 设置退出回调
        const exitHandler = () => {
          console.log('[主进程] Python服务器已停止');
          pythonProcess = null;
          // 继续检查是否有其他进程占用端口
          killProcessByPort(API_PORT).then(resolve);
        };
        
        // 如果进程已经退出，直接返回
        if (pythonProcess.killed) {
          console.log('[主进程] Python进程已终止');
          pythonProcess = null;
          // 继续检查是否有其他进程占用端口
          await killProcessByPort(API_PORT);
          resolve();
          return;
        }
        
        pythonProcess.once('exit', exitHandler);
        
        // 在 macOS/Linux 上，先发送 SIGTERM 信号（优雅退出）
        // 在 Windows 上，kill() 会发送 SIGTERM
        if (process.platform !== 'win32') {
          pythonProcess.kill('SIGTERM');
        } else {
          pythonProcess.kill();
        }
        
        // 设置超时，如果 3 秒内没有退出，强制终止
        const timeout = setTimeout(() => {
          if (pythonProcess && !pythonProcess.killed) {
            console.log('[主进程] Python进程未响应SIGTERM，强制终止...');
            // 移除之前的 exit 监听器，添加新的
            pythonProcess!.removeListener('exit', exitHandler);
            pythonProcess!.once('exit', () => {
              console.log('[主进程] Python服务器已强制终止');
              pythonProcess = null;
              // 继续检查是否有其他进程占用端口
              killProcessByPort(API_PORT).then(resolve);
            });
            // 强制终止（SIGKILL）
            if (process.platform !== 'win32') {
              pythonProcess.kill('SIGKILL');
            } else {
              pythonProcess.kill();
            }
          } else {
            clearTimeout(timeout);
            // 继续检查是否有其他进程占用端口
            killProcessByPort(API_PORT).then(resolve);
          }
        }, 3000);
      } catch (error) {
        console.error(`[主进程] 停止Python服务器失败: ${error}`);
        pythonProcess = null;
        // 继续检查是否有其他进程占用端口
        await killProcessByPort(API_PORT);
        resolve();
      }
    } else {
      console.log('[主进程] Python服务器进程不存在，检查是否有外部进程占用端口...');
      // 如果 Electron 没有启动 Python 进程，尝试通过端口查找并终止
      await killProcessByPort(API_PORT);
      resolve();
    }
  });
}

/**
 * 获取应用图标路径
 */
function getIconPath(): string | undefined {
  const icoPngPath = path.join(__dirname, '../assets/ico.png');
  const icoSvgPath = path.join(__dirname, '../assets/ico.svg');
  const iconPngPath = path.join(__dirname, '../assets/icon.png');
  const iconSvgPath = path.join(__dirname, '../assets/icon.svg');
  
  // 优先使用 PNG（Electron 窗口图标需要 PNG）
  if (fs.existsSync(icoPngPath)) {
    return icoPngPath;
  } else if (fs.existsSync(iconPngPath)) {
    return iconPngPath;
  } else if (fs.existsSync(icoSvgPath)) {
    return icoSvgPath;
  } else if (fs.existsSync(iconSvgPath)) {
    return iconSvgPath;
  }
  return undefined;
}

/**
 * 创建启动窗口（显示启动进度）
 */
function createSplashWindow(): void {
  const iconPath = getIconPath();
  
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  
  // 创建启动页面的 HTML 内容
  const splashHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      padding: 20px;
      text-align: center;
    }
    .logo {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 20px;
      opacity: 0.9;
    }
    .status {
      font-size: 16px;
      margin: 10px 0;
      min-height: 24px;
    }
    .progress {
      width: 200px;
      height: 4px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 2px;
      margin: 20px 0;
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      background: white;
      width: 0%;
      transition: width 0.3s ease;
      border-radius: 2px;
    }
    .error {
      color: #ff6b6b;
      font-size: 14px;
      margin-top: 10px;
      max-width: 350px;
      word-wrap: break-word;
    }
    .spinner {
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top: 3px solid white;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      animation: spin 1s linear infinite;
      margin: 10px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="logo">MindVoice</div>
  <div class="status" id="status">正在启动...</div>
  <div class="progress">
    <div class="progress-bar" id="progress"></div>
  </div>
  <div class="spinner" id="spinner"></div>
  <div class="error" id="error" style="display: none;"></div>
</body>
</html>
  `;
  
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
  splashWindow.show();
}

/**
 * 更新启动窗口状态
 */
function updateSplashStatus(message: string, progress: number = 0, error?: string): void {
  if (!splashWindow) return;
  
  splashWindow.webContents.executeJavaScript(`
    (function() {
      const statusEl = document.getElementById('status');
      const progressEl = document.getElementById('progress');
      const errorEl = document.getElementById('error');
      const spinnerEl = document.getElementById('spinner');
      
      if (statusEl) statusEl.textContent = ${JSON.stringify(message)};
      if (progressEl) progressEl.style.width = ${progress} + '%';
      
      if (${JSON.stringify(error)}) {
        if (errorEl) {
          errorEl.textContent = ${JSON.stringify(error)};
          errorEl.style.display = 'block';
        }
        if (spinnerEl) spinnerEl.style.display = 'none';
      } else {
        if (errorEl) errorEl.style.display = 'none';
        if (spinnerEl) spinnerEl.style.display = 'block';
      }
    })();
  `).catch(err => console.error('[主进程] 更新启动窗口状态失败:', err));
}

/**
 * 关闭启动窗口
 */
function closeSplashWindow(): void {
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
}

/**
 * 创建应用窗口
 */
function createWindow(): void {
  const iconPath = getIconPath();
  
  mainWindow = new BrowserWindow({
    width: 450,        // 手机竖屏比例 9:16
    height: 800,
    minWidth: 375,     // 最小宽度（iPhone SE）
    minHeight: 667,    // 最小高度（iPhone SE）
    title: 'MindVoice',
    frame: false,      // 隐藏标题栏
    icon: iconPath,    // 窗口图标
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // 初始不显示，等待加载完成
  });
  
  // 加载应用
  const isDev = !app.isPackaged;
  if (isDev) {
    // 开发环境：加载Vite开发服务器
    mainWindow.loadURL('http://localhost:5173');
    // 默认不打开开发者工具，需要时可按 Cmd+Option+I (macOS) 或 Ctrl+Shift+I (Windows/Linux) 打开
    // mainWindow.webContents.openDevTools();
  } else {
    // 生产环境：加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  
  // 窗口关闭事件
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  
  // 窗口加载完成
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
}

/**
 * 创建系统托盘
 */
function createTray(): void {
  console.log(`[主进程] 开始创建系统托盘...`);
  console.log(`[主进程] __dirname: ${__dirname}`);
  console.log(`[主进程] app.getAppPath(): ${app.getAppPath()}`);
  
  // macOS 托盘图标路径优先级：
  // 1. 专用托盘图标（22x22 或 44x44，macOS 推荐尺寸）
  // 2. 标准图标文件
  let trayIconPath: string | null = null;
  
  if (process.platform === 'darwin') {
    // macOS: 优先使用专用托盘图标
    const trayIcon22Path = path.join(__dirname, '../assets/tray-icons/tray-icon-22x22.png');
    const trayIcon44Path = path.join(__dirname, '../assets/tray-icons/tray-icon-44x44.png');
    
    if (fs.existsSync(trayIcon22Path)) {
      trayIconPath = trayIcon22Path;
      console.log(`[主进程] 使用专用托盘图标 (22x22): ${trayIcon22Path}`);
    } else if (fs.existsSync(trayIcon44Path)) {
      trayIconPath = trayIcon44Path;
      console.log(`[主进程] 使用专用托盘图标 (44x44): ${trayIcon44Path}`);
    }
  }
  
  // 如果找不到专用托盘图标，尝试使用标准图标
  if (!trayIconPath) {
    const icoPngPath = path.join(__dirname, '../assets/ico.png');
    const iconPngPath = path.join(__dirname, '../assets/icon.png');
    
    if (fs.existsSync(icoPngPath)) {
      trayIconPath = icoPngPath;
      console.log(`[主进程] 使用标准图标: ${icoPngPath}`);
    } else if (fs.existsSync(iconPngPath)) {
      trayIconPath = iconPngPath;
      console.log(`[主进程] 使用标准图标: ${iconPngPath}`);
    }
  }
  
  // 如果还是找不到，尝试从应用路径查找
  if (!trayIconPath) {
    const appIconPath = path.join(app.getAppPath(), 'assets', 'ico.png');
    if (fs.existsSync(appIconPath)) {
      trayIconPath = appIconPath;
      console.log(`[主进程] 使用应用图标: ${appIconPath}`);
    }
  }
  
  if (!trayIconPath) {
    console.error(`[主进程] 无法创建托盘：找不到图标文件`);
    console.error(`[主进程] 已检查的路径:`);
    console.error(`  - ${path.join(__dirname, '../assets/tray-icons/tray-icon-22x22.png')}`);
    console.error(`  - ${path.join(__dirname, '../assets/tray-icons/tray-icon-44x44.png')}`);
    console.error(`  - ${path.join(__dirname, '../assets/ico.png')}`);
    console.error(`  - ${path.join(__dirname, '../assets/icon.png')}`);
    return;
  }
  
  try {
    console.log(`[主进程] 加载图标文件: ${trayIconPath}`);
    console.log(`[主进程] 文件是否存在: ${fs.existsSync(trayIconPath)}`);
    
    // 使用 nativeImage 加载图标（macOS 需要）
    const icon = nativeImage.createFromPath(trayIconPath);
    
    // 检查图标是否有效
    if (icon.isEmpty()) {
      console.error(`[主进程] 托盘图标文件无效或无法加载: ${trayIconPath}`);
      return;
    }
    
    const size = icon.getSize();
    console.log(`[主进程] 图标尺寸: ${size.width}x${size.height}`);
    
    // macOS 上，可以设置为模板图像（可选，用于适配系统主题）
    // 注意：模板图像应该是单色的，如果图标是彩色的，可能不需要设置为模板
    if (process.platform === 'darwin') {
      // 先不设置为模板图像，看看是否能正常显示
      // icon.setTemplateImage(true);
    }
    
    // 创建托盘
    tray = new Tray(icon);
    console.log(`[主进程] 系统托盘创建成功`);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Window',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Display Mode',
        submenu: [
          {
            label: '📱 Portrait',
            click: () => {
              if (mainWindow) {
                if (mainWindow.isMaximized()) {
                  mainWindow.unmaximize();
                }
                mainWindow.setSize(450, 800);
                mainWindow.center();
                mainWindow.show();
              }
            },
          },
          {
            label: '🖥️ Landscape',
            click: () => {
              if (mainWindow) {
                if (mainWindow.isMaximized()) {
                  mainWindow.unmaximize();
                }
                mainWindow.setSize(800, 450);
                mainWindow.center();
                mainWindow.show();
              }
            },
          },
          {
            label: '⛶ Maximize',
            click: () => {
              if (mainWindow) {
                if (!mainWindow.isMaximized()) {
                  mainWindow.maximize();
                }
                mainWindow.show();
              }
            },
          },
        ],
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    
    tray.setToolTip('MindVoice');
    tray.setContextMenu(contextMenu);
    
    // 点击托盘图标显示/隐藏窗口
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        createWindow();
      }
    });
    
    console.log(`[主进程] 托盘菜单和事件已设置`);
  } catch (error) {
    console.error(`[主进程] 创建系统托盘失败: ${error}`);
    if (error instanceof Error) {
      console.error(`[主进程] 错误详情: ${error.message}`);
      console.error(`[主进程] 错误堆栈: ${error.stack}`);
    }
    // 托盘创建失败不影响应用运行
  }
}

/**
 * 设置Content Security Policy
 * 
 * 注意：开发环境中使用 unsafe-eval 是为了支持 Vite HMR（热模块替换），
 * 这是必需的。Electron 会显示警告，但这是可以接受的，因为：
 * 1. 仅在开发环境中使用
 * 2. 生产环境已移除 unsafe-eval
 * 3. 打包后的应用不会显示此警告
 */
function setupCSP(): void {
  const isDev = !app.isPackaged;
  
  // 开发环境：允许unsafe-eval用于Vite HMR，生产环境：更严格的策略
  const csp = isDev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; style-src 'self' 'unsafe-inline' http://localhost:5173; connect-src 'self' ws://127.0.0.1:8765 http://127.0.0.1:8765 http://localhost:5173 ws://localhost:5173; img-src 'self' data: http://127.0.0.1:8765; font-src 'self' data:;"
    : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:8765 http://127.0.0.1:8765; img-src 'self' data: http://127.0.0.1:8765; font-src 'self' data:;";
  
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

/**
 * 设置 Electron 用户数据目录（在 app.whenReady() 之前调用）
 * 将 Electron 的缓存/配置与应用数据分离
 */
const os = require('os');
const electronAppName = 'MindVoice-App'; // Electron 专用目录

// 根据平台设置 Electron 数据目录
let electronUserDataPath: string;
if (process.platform === 'darwin') {
  // macOS: ~/Library/Application Support/MindVoice-App
  electronUserDataPath = path.join(os.homedir(), 'Library', 'Application Support', electronAppName);
} else if (process.platform === 'win32') {
  // Windows: %APPDATA%/MindVoice-App
  electronUserDataPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), electronAppName);
} else {
  // Linux: ~/.config/MindVoice-App
  electronUserDataPath = path.join(os.homedir(), '.config', electronAppName);
}

// 设置 Electron 用户数据目录
app.setPath('userData', electronUserDataPath);
console.log(`[主进程] Electron 用户数据目录: ${electronUserDataPath}`);

/**
 * 应用准备就绪
 */
app.whenReady().then(async () => {
  console.log('[主进程] 应用启动...');
  
  // 创建启动窗口
  createSplashWindow();
  updateSplashStatus('正在初始化...', 5);
  
  // 设置CSP
  setupCSP();
  
  try {
    // 初始化设备ID
    updateSplashStatus('初始化设备ID...', 10);
    try {
      const { initializeDeviceId } = await import('./device-id');
      const deviceInfo = await initializeDeviceId();
      console.log('[主进程] ✅ 设备ID已初始化:', deviceInfo.deviceId);
      
      // 启动Python API服务器
      await startPythonServer();
      console.log('[主进程] Python API服务器已启动');
      
      // 注册设备到后端
      updateSplashStatus('注册设备...', 15);
      try {
        const response = await fetch(`${API_URL}/api/device/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: deviceInfo.deviceId,
            machine_id: deviceInfo.machineId,
            platform: deviceInfo.platform,
          }),
          signal: AbortSignal.timeout(5000),
        });
        
        if (response.ok) {
          const result = await response.json() as {
            success: boolean;
            data?: { is_new: boolean; membership?: any };
            error?: string;
          };
          if (result.success) {
            console.log('[主进程] ✅ 设备注册成功');
            if (result.data?.is_new) {
              console.log('[主进程] 🎉 欢迎新用户！已自动开通免费永久权限');
            }
            
            // 设置设备ID到语音服务（用于消费记录）
            try {
              const setDeviceIdResponse = await fetch(`${API_URL}/api/voice/set-device-id`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_id: deviceInfo.deviceId }),
                signal: AbortSignal.timeout(5000),
              });
              
              if (setDeviceIdResponse.ok) {
                console.log('[主进程] ✅ 设备ID已设置到语音服务');
              } else {
                console.warn('[主进程] 设置设备ID到语音服务失败');
              }
            } catch (error) {
              console.warn('[主进程] 设置设备ID到语音服务失败:', error);
            }
          }
        }
      } catch (error) {
        console.warn('[主进程] 设备注册失败（不影响启动）:', error);
      }
    } catch (error) {
      console.error('[主进程] 设备ID初始化失败（不影响启动）:', error);
    }
    
    // 启动Python API服务器（如果上面失败了）
    if (!pythonProcess) {
      await startPythonServer();
      console.log('[主进程] Python API服务器已启动');
    }
    
    // 更新启动状态
    updateSplashStatus('正在加载应用界面...', 95);
    
    // 创建窗口和托盘
    createWindow();
    createTray();
    
    // 启动轮询
    startPolling();
    
    console.log('[主进程] 应用初始化完成');
    
    // 等待主窗口加载完成后关闭启动窗口
    if (mainWindow) {
      mainWindow.once('ready-to-show', () => {
        // 延迟关闭启动窗口，让用户看到完成状态
        setTimeout(() => {
          closeSplashWindow();
          mainWindow?.show();
        }, 500);
      });
    } else {
      closeSplashWindow();
    }
  } catch (error) {
    console.error('[主进程] 初始化失败:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    updateSplashStatus('启动失败', 0, errorMsg);
    
    // 显示错误后等待 5 秒再退出，让用户看到错误信息
    setTimeout(() => {
      app.quit();
    }, 5000);
  }
});

/**
 * 所有窗口关闭时（macOS除外）
 */
app.on('window-all-closed', () => {
  // macOS上，即使所有窗口关闭，应用通常继续运行
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 应用激活（macOS）
 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/**
 * 应用退出前
 */
app.on('before-quit', (event) => {
  isQuitting = true;
  
  // 停止轮询
  stopPolling();
  
  // 如果 pythonProcess 存在，阻止默认退出，等待服务器停止
  if (pythonProcess && !pythonProcess.killed) {
    event.preventDefault();
    stopPythonServer().then(() => {
      // 服务器停止后，真正退出应用
      app.exit(0);
    }).catch((error) => {
      console.error('[主进程] 停止Python服务器时出错:', error);
      app.exit(1);
    });
  }
});

/**
 * IPC通信处理
 */
ipcMain.handle('get-api-url', () => {
  return API_URL;
});

// 设备ID相关IPC处理器
ipcMain.handle('get-device-id', async () => {
  try {
    const { getDeviceId } = await import('./device-id');
    return getDeviceId();
  } catch (error) {
    console.error('[IPC] 获取设备ID失败:', error);
    return null;
  }
});

ipcMain.handle('get-device-info', async () => {
  try {
    const { getDeviceInfo } = await import('./device-id');
    return getDeviceInfo();
  } catch (error) {
    console.error('[IPC] 获取设备信息失败:', error);
    return null;
  }
});

ipcMain.handle('check-api-server', async () => {
  try {
    const response = await fetch(`${API_URL}/api/status`);
    return response.ok;
  } catch {
    return false;
  }
});

// 窗口控制（移除最小化功能，因为已有 hide window）
ipcMain.handle('window-set-landscape', () => {
  if (mainWindow) {
    // 横屏模式: 800x450 (16:9)
    const landscapeWidth = 800;
    const landscapeHeight = 450;
    
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }
    
    mainWindow.setSize(landscapeWidth, landscapeHeight);
    mainWindow.center();
  }
});

ipcMain.handle('window-set-portrait', () => {
  if (mainWindow) {
    // 竖屏模式: 450x800 (9:16)
    const portraitWidth = 450;
    const portraitHeight = 800;
    
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }
    
    mainWindow.setSize(portraitWidth, portraitHeight);
    mainWindow.center();
  }
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-restore-default', () => {
  if (mainWindow) {
    // 默认手机屏幕模式: 450x800
    const defaultWidth = 450;
    const defaultHeight = 800;
    
    // 如果窗口是最大化状态，先取消最大化
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }
    
    // 设置窗口大小为默认值
    mainWindow.setSize(defaultWidth, defaultHeight);
    
    // 居中窗口
    mainWindow.center();
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('app-quit', async () => {
  isQuitting = true;
  // 停止 Python 后端服务器
  await stopPythonServer();
  // 退出整个应用（前端和后端）
  app.quit();
});

