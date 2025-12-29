/**
 * Electron主进程
 * 负责：
 * 1. 启动和管理Python API服务器进程
 * 2. 创建和管理应用窗口
 * 3. 系统托盘和菜单
 * 4. 应用生命周期管理
 */
import { app, BrowserWindow, Tray, Menu, shell, ipcMain, session } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const API_PORT = 8765;
const API_HOST = '127.0.0.1';
const API_URL = `http://${API_HOST}:${API_PORT}`;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pythonProcess: ChildProcess | null = null;
let isQuitting = false;

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
    
    // 在开发模式下，先检查API服务器是否已经运行
    if (isDev) {
      console.log('[主进程] 开发模式：检查API服务器是否已运行...');
      const isRunning = await checkApiServerRunning();
      if (isRunning) {
        console.log('[主进程] API服务器已在运行，跳过启动');
        resolve();
        return;
      }
      console.log('[主进程] API服务器未运行，将启动新的服务器进程');
    }
    
    // 获取Python可执行文件路径
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    
    // 获取API服务器脚本路径
    // 在开发环境中，从项目根目录查找
    // 在打包后，从resources目录查找
    let apiScriptPath: string;
    
    if (isDev) {
      // 开发环境：从项目根目录查找
      apiScriptPath = path.join(__dirname, '../../api_server.py');
    } else {
      // 生产环境：从resources目录查找
      apiScriptPath = path.join(process.resourcesPath, 'api_server.py');
    }
    
    console.log(`[主进程] 启动Python服务器: ${apiScriptPath}`);
    
    // 检查文件是否存在
    if (!fs.existsSync(apiScriptPath)) {
      reject(new Error(`API服务器脚本不存在: ${apiScriptPath}`));
      return;
    }
    
    // 启动Python进程
    pythonProcess = spawn(pythonPath, [apiScriptPath, '--host', API_HOST, '--port', String(API_PORT)], {
      cwd: isDev ? path.join(__dirname, '../..') : process.resourcesPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    pythonProcess.stdout?.on('data', (data) => {
      console.log(`[Python] ${data.toString()}`);
    });
    
    pythonProcess.stderr?.on('data', (data) => {
      console.error(`[Python Error] ${data.toString()}`);
    });
    
    pythonProcess.on('error', (error) => {
      console.error(`[主进程] Python进程启动失败: ${error}`);
      reject(error);
    });
    
    pythonProcess.on('exit', (code) => {
      if (code !== null && code !== 0 && !isQuitting) {
        console.error(`[主进程] Python进程异常退出，代码: ${code}`);
        // 可以在这里实现自动重启逻辑
      }
    });
    
    // 等待服务器启动（检查端口是否可用）
    let attempts = 0;
    const maxAttempts = 10;
    const checkInterval = setInterval(async () => {
      attempts++;
      const isRunning = await checkApiServerRunning();
      if (isRunning) {
        clearInterval(checkInterval);
        resolve();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        // 即使检查失败也resolve，因为服务器可能正在启动中
        console.log('[主进程] API服务器启动检查超时，但继续运行');
        resolve();
      }
    }, 500);
  });
}

/**
 * 停止Python API服务器
 */
function stopPythonServer(): void {
  if (pythonProcess) {
    console.log('[主进程] 停止Python服务器...');
    pythonProcess.kill();
    pythonProcess = null;
  }
}

/**
 * 创建应用窗口
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    minWidth: 400,
    minHeight: 300,
    title: 'MindVoice',
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
  // 托盘图标路径
  const iconPath = path.join(__dirname, '../assets/icon.png');
  
  // 检查图标文件是否存在，如果不存在则使用默认图标
  let trayIconPath: string;
  if (fs.existsSync(iconPath)) {
    trayIconPath = iconPath;
  } else {
    // 使用 Electron 默认图标（macOS 上会使用应用图标）
    // 在 macOS 上，如果没有指定图标，Tray 会使用应用图标
    if (process.platform === 'darwin') {
      // macOS: 使用应用图标
      trayIconPath = app.getAppPath();
    } else {
      // 其他平台：尝试使用一个简单的图标路径，如果失败则跳过托盘
      trayIconPath = iconPath; // 让 Electron 处理错误
    }
    console.log(`[主进程] 托盘图标文件不存在: ${iconPath}，使用默认图标`);
  }
  
  try {
    tray = new Tray(trayIconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示窗口',
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
        label: '退出',
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
  } catch (error) {
    console.warn(`[主进程] 创建系统托盘失败: ${error}，应用将继续运行但无托盘图标`);
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
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; style-src 'self' 'unsafe-inline' http://localhost:5173; connect-src 'self' ws://127.0.0.1:8765 http://127.0.0.1:8765 http://localhost:5173 ws://localhost:5173; img-src 'self' data:; font-src 'self' data:;"
    : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:8765 http://127.0.0.1:8765; img-src 'self' data:; font-src 'self' data:;";
  
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
 * 应用准备就绪
 */
app.whenReady().then(async () => {
  console.log('[主进程] 应用启动...');
  
  // 设置CSP
  setupCSP();
  
  try {
    // 启动Python API服务器
    await startPythonServer();
    console.log('[主进程] Python API服务器已启动');
    
    // 创建窗口和托盘
    createWindow();
    createTray();
    
    console.log('[主进程] 应用初始化完成');
  } catch (error) {
    console.error('[主进程] 初始化失败:', error);
    app.quit();
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
app.on('before-quit', () => {
  isQuitting = true;
  stopPythonServer();
});

/**
 * IPC通信处理
 */
ipcMain.handle('get-api-url', () => {
  return API_URL;
});

ipcMain.handle('check-api-server', async () => {
  try {
    const response = await fetch(`${API_URL}/api/status`);
    return response.ok;
  } catch {
    return false;
  }
});

