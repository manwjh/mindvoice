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
app.on('before-quit', (event) => {
  isQuitting = true;
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

ipcMain.handle('check-api-server', async () => {
  try {
    const response = await fetch(`${API_URL}/api/status`);
    return response.ok;
  } catch {
    return false;
  }
});

// 窗口控制
ipcMain.handle('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
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

