#!/bin/bash

# =============================================================
# macOS 语音桌面助手 - 快速启动脚本
# 功能：自动检查环境、部署依赖、运行应用
# =============================================================

# 设置编码为 UTF-8
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

# 不使用 set -e，手动处理错误
set +e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$PROJECT_DIR/venv"
PYTHON_CMD="python3"

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if command -v "$1" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 检查 Python 环境
check_python() {
    print_info "检查 Python 环境..."
    
    if ! check_command "$PYTHON_CMD"; then
        print_error "未找到 $PYTHON_CMD，请先安装 Python 3"
        exit 1
    fi
    
    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | awk '{print $2}')
    print_success "Python 版本: $PYTHON_VERSION"
    
    # 检查 Python 版本是否 >= 3.9
    MAJOR_VERSION=$(echo $PYTHON_VERSION | cut -d. -f1)
    MINOR_VERSION=$(echo $PYTHON_VERSION | cut -d. -f2)
    
    if [ "$MAJOR_VERSION" -lt 3 ] || ([ "$MAJOR_VERSION" -eq 3 ] && [ "$MINOR_VERSION" -lt 9 ]); then
        print_error "需要 Python 3.9 或更高版本，当前版本: $PYTHON_VERSION"
        exit 1
    fi
}

# 检查系统依赖
check_system_deps() {
    print_info "检查系统依赖..."
    
    # 检查操作系统
    if [[ "$OSTYPE" == "darwin"* ]]; then
        print_info "检测到 macOS 系统"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        print_info "检测到 Linux 系统"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        print_info "检测到 Windows 系统"
    else
        print_warning "未知操作系统: $OSTYPE"
    fi
    
    # 检查必要的系统工具
    local missing_deps=()
    
    if ! check_command "pip3"; then
        missing_deps+=("pip3")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "缺少以下依赖: ${missing_deps[*]}"
        print_info "请运行: brew install python3"
        exit 1
    fi
    
    print_success "系统依赖检查通过"
}

# 创建虚拟环境
setup_venv() {
    print_info "设置虚拟环境..."
    
    if [ -d "$VENV_DIR" ]; then
        print_info "虚拟环境已存在，跳过创建"
    else
        print_info "创建虚拟环境..."
        $PYTHON_CMD -m venv "$VENV_DIR"
        print_success "虚拟环境创建成功"
    fi
    
    # 激活虚拟环境
    source "$VENV_DIR/bin/activate"
    
    # 升级 pip
    print_info "升级 pip..."
    pip install --upgrade pip --quiet
    
    print_success "虚拟环境设置完成"
}

# 安装依赖
install_dependencies() {
    print_info "安装项目依赖..."
    
    if [ ! -f "$PROJECT_DIR/requirements.txt" ]; then
        print_error "未找到 requirements.txt"
        exit 1
    fi
    
    # 检查是否需要安装依赖
    # 比较 requirements.txt 的修改时间与 .installed 标记
    if [ -f "$VENV_DIR/.installed" ]; then
        if [ "$PROJECT_DIR/requirements.txt" -nt "$VENV_DIR/.installed" ]; then
            print_info "requirements.txt 已更新，重新安装依赖..."
            rm -f "$VENV_DIR/.installed"
        else
            print_info "依赖已安装，跳过..."
            return
        fi
    fi
    
    pip install -r "$PROJECT_DIR/requirements.txt" --quiet
    
    # 标记已安装（记录 requirements.txt 的修改时间）
    touch "$VENV_DIR/.installed"
    
    print_success "依赖安装完成"
}

# 检查配置
check_config() {
    print_info "检查配置..."
    
    # 检查项目根目录的 config.yml
    PROJECT_CONFIG_YML="$PROJECT_DIR/config.yml"
    
    if [ -f "$PROJECT_CONFIG_YML" ]; then
        print_success "配置文件存在: $PROJECT_CONFIG_YML"
    else
        print_warning "配置文件不存在，将使用默认配置"
        if [ -f "$PROJECT_DIR/config.yml.example" ]; then
            print_info "可以复制示例配置文件："
            print_info "  cp config.yml.example config.yml"
            print_info "然后编辑 config.yml 填入你的 API 密钥"
        fi
    fi
}

# 检查权限
check_permissions() {
    print_info "检查 macOS 权限..."
    
    # 检查麦克风权限（macOS 10.14+）
    if [[ "$OSTYPE" == "darwin"* ]]; then
        print_info "请确保已授予应用麦克风权限："
        print_info "系统偏好设置 → 安全性与隐私 → 隐私 → 麦克风"
        print_info "如果未授予权限，应用可能无法录音"
    fi
}

# 验证安装
verify_installation() {
    print_info "验证安装..."
    
    # 检查关键模块
    local modules=("fastapi" "uvicorn" "sounddevice" "aiohttp")
    local missing_modules=()
    
    for module in "${modules[@]}"; do
        if ! python -c "import ${module}" 2>/dev/null; then
            missing_modules+=("$module")
        fi
    done
    
    if [ ${#missing_modules[@]} -gt 0 ]; then
        print_error "以下模块未正确安装: ${missing_modules[*]}"
        print_info "尝试重新安装依赖..."
        rm -f "$VENV_DIR/.installed"
        install_dependencies
    else
        print_success "所有关键模块验证通过"
    fi
}

# 检查 Node.js 环境
check_nodejs() {
    print_info "检查 Node.js 环境..."
    
    if ! check_command "node"; then
        print_warning "未找到 Node.js，Electron 前端将无法运行"
        print_info "请安装 Node.js 18+: https://nodejs.org/"
        return 1
    fi
    
    NODE_VERSION=$(node --version)
    print_success "Node.js 版本: $NODE_VERSION"
    
    if ! check_command "npm"; then
        print_warning "未找到 npm"
        return 1
    fi
    
    NPM_VERSION=$(npm --version)
    print_success "npm 版本: $NPM_VERSION"
    return 0
}

# 安装 Electron 前端依赖
install_electron_deps() {
    print_info "检查 Electron 前端依赖..."
    
    ELECTRON_DIR="$PROJECT_DIR/electron-app"
    
    if [ ! -d "$ELECTRON_DIR" ]; then
        print_warning "Electron 前端目录不存在: $ELECTRON_DIR"
        return 1
    fi
    
    if [ ! -f "$ELECTRON_DIR/package.json" ]; then
        print_warning "未找到 package.json"
        return 1
    fi
    
    cd "$ELECTRON_DIR"
    
    # 安装 npm 依赖
    if [ ! -d "$ELECTRON_DIR/node_modules" ]; then
        print_info "安装 Electron 前端依赖..."
        if npm install; then
            print_success "Electron 前端依赖安装完成"
        else
            print_error "Electron 前端依赖安装失败"
            cd "$PROJECT_DIR"
            return 1
        fi
    else
        print_info "Electron 前端依赖已安装"
    fi
    
    # 检查并构建 Electron 主进程代码
    if [ ! -f "$ELECTRON_DIR/dist-electron/main.js" ]; then
        print_info "构建 Electron 主进程代码..."
        if npm run build:electron; then
            print_success "Electron 主进程代码构建完成"
        else
            print_error "Electron 主进程代码构建失败"
            cd "$PROJECT_DIR"
            return 1
        fi
    else
        # 检查源代码是否有更新
        if [ "$ELECTRON_DIR/electron/main.ts" -nt "$ELECTRON_DIR/dist-electron/main.js" ] || \
           [ "$ELECTRON_DIR/electron/preload.ts" -nt "$ELECTRON_DIR/dist-electron/preload.js" ]; then
            print_info "检测到 Electron 源代码更新，重新构建..."
            if npm run build:electron; then
                print_success "Electron 主进程代码重新构建完成"
            else
                print_error "Electron 主进程代码重新构建失败"
                cd "$PROJECT_DIR"
                return 1
            fi
        else
            print_info "Electron 主进程代码已构建"
        fi
    fi
    
    cd "$PROJECT_DIR"
    return 0
}

# 检查端口是否被占用
check_port() {
    local port=$1
    local host=${2:-"127.0.0.1"}
    
    # 使用 Python 尝试绑定端口（最可靠的方法）
    # 如果能绑定成功，说明端口未被占用；如果失败，说明端口被占用
    # 使用 SO_REUSEADDR 来允许在 TIME_WAIT 状态下绑定
    # 这样可以区分真正的端口占用（LISTENING）和临时状态（TIME_WAIT）
    python3 <<EOF >/dev/null 2>&1
import socket
import sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(0.1)
try:
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(('$host', $port))
    s.close()
    sys.exit(1)  # 端口未被占用（可以绑定）
except OSError:
    s.close()
    sys.exit(0)  # 端口被占用（无法绑定）
EOF
    if [ $? -eq 0 ]; then
        return 0  # 端口被占用（绑定失败）
    fi
    
    # 使用 netstat 检查 LISTENING 状态（备用方法，仅检查真正监听的连接）
    if command -v netstat >/dev/null 2>&1; then
        if netstat -an 2>/dev/null | grep -q ":$port.*LISTEN"; then
            return 0  # 端口被占用（有进程在监听）
        fi
    fi
    
    # 使用 lsof 检查 LISTENING 状态（仅检查真正监听的连接）
    if command -v lsof >/dev/null 2>&1; then
        if lsof -i :$port 2>/dev/null | grep -q "LISTEN"; then
            return 0  # 端口被占用（有进程在监听）
        fi
    fi
    
    return 1  # 端口未被占用
}

# 清理函数
cleanup_processes() {
    local port=${1:-8765}
    print_info "正在清理进程..."
    
    # 首先，查找并终止占用指定端口的进程
    if command -v lsof >/dev/null 2>&1; then
        local port_pids=$(lsof -ti :$port 2>/dev/null || true)
        if [ -n "$port_pids" ]; then
            print_info "终止占用端口 $port 的进程..."
            echo "$port_pids" | xargs kill -TERM 2>/dev/null || true
            sleep 2
            # 如果还在运行，强制终止
            local remaining_pids=$(lsof -ti :$port 2>/dev/null || true)
            if [ -n "$remaining_pids" ]; then
                echo "$remaining_pids" | xargs kill -9 2>/dev/null || true
                sleep 1
            fi
        fi
    fi
    
    # 查找并终止 API 服务器进程
    local api_pids=$(pgrep -f "api_server.py" || true)
    if [ -n "$api_pids" ]; then
        print_info "终止 API 服务器进程..."
        echo "$api_pids" | xargs kill -TERM 2>/dev/null || true
        sleep 1
        # 如果还在运行，强制终止
        echo "$api_pids" | xargs kill -9 2>/dev/null || true
    fi
    
    # 查找并终止 Electron 进程（排除 grep 自身）
    local electron_pids=$(pgrep -f "electron" 2>/dev/null | grep -v "^$$$" || true)
    if [ -n "$electron_pids" ]; then
        print_info "终止 Electron 进程..."
        echo "$electron_pids" | xargs kill -TERM 2>/dev/null || true
        sleep 1
        echo "$electron_pids" | xargs kill -9 2>/dev/null || true
    fi
    
    # 查找并终止 Vite 进程（排除 grep 自身）
    local vite_pids=$(pgrep -f "vite" 2>/dev/null | grep -v "^$$$" || true)
    if [ -n "$vite_pids" ]; then
        print_info "终止 Vite 进程..."
        echo "$vite_pids" | xargs kill -TERM 2>/dev/null || true
        sleep 1
        echo "$vite_pids" | xargs kill -9 2>/dev/null || true
    fi
    
    # 等待端口完全释放
    sleep 1
    
    print_success "进程清理完成"
}

# 运行应用
run_app() {
    print_info "启动应用..."
    print_info "=========================================="
    print_success "语音桌面助手"
    print_info "=========================================="
    echo ""
    
    # 设置退出时的清理
    trap cleanup_processes EXIT INT TERM
    
    # 默认端口
    local api_port=8765
    local api_host="127.0.0.1"
    
    # 检查端口是否被占用
    if check_port $api_port $api_host; then
        print_warning "端口 $api_port 已被占用，正在清理相关进程..."
        cleanup_processes $api_port
        sleep 3
        
        # 再次检查端口是否已释放
        if check_port $api_port $api_host; then
            print_error "端口 $api_port 清理后仍被占用，启动失败"
            print_info "占用端口的进程信息："
            lsof -i :$api_port 2>/dev/null || print_info "  (无法获取进程信息)"
            print_info ""
            print_info "请手动关闭占用端口的进程，或使用其他端口："
            print_info "  python api_server.py --port <其他端口>"
            print_info "查找占用端口的进程: lsof -i :$api_port"
            print_info "或者手动终止进程: kill -9 \$(lsof -ti :$api_port)"
            return 1
        else
            print_success "端口清理完成，继续启动..."
        fi
    fi
    
    # 检查是否可以启动 Electron
    if check_nodejs && install_electron_deps; then
        print_info "检测到 Electron 前端，将同时启动 API 服务器和前端..."
        print_info "提示：按 Ctrl+C 可以同时停止两个服务"
        echo ""
        
        # 后台启动 API 服务器
        print_info "启动 API 服务器（后台）..."
        
        # 尝试启动 API 服务器，如果失败则清理端口并重试
        local max_retries=2
        local retry_count=0
        local api_started=false
        
        while [ $retry_count -lt $max_retries ] && [ "$api_started" = false ]; do
            # 确保端口未被占用
            if check_port $api_port $api_host; then
                print_warning "端口 $api_port 仍被占用，清理相关进程..."
                cleanup_processes $api_port
                sleep 3
            fi
            
            python "$PROJECT_DIR/api_server.py" --port $api_port --host $api_host &
            API_PID=$!
            
            # 等待 API 服务器启动
            sleep 3
            
            # 检查 API 服务器是否还在运行
            if kill -0 $API_PID 2>/dev/null; then
                # 再次检查端口是否被正确占用（说明服务器启动成功）
                if check_port $api_port $api_host; then
                    api_started=true
                    print_success "API 服务器启动成功（PID: $API_PID）"
                else
                    retry_count=$((retry_count + 1))
                    print_warning "API 服务器进程存在但端口未绑定（尝试 $retry_count/$max_retries）"
                    kill $API_PID 2>/dev/null || true
                    sleep 1
                fi
            else
                retry_count=$((retry_count + 1))
                print_warning "API 服务器启动失败（尝试 $retry_count/$max_retries）"
                
                # 检查是否是端口问题并清理
                if check_port $api_port $api_host; then
                    print_info "检测到端口 $api_port 被占用，清理相关进程..."
                    cleanup_processes $api_port
                    sleep 3
                fi
                
                if [ $retry_count -lt $max_retries ]; then
                    print_info "重试启动 API 服务器..."
                fi
            fi
        done
        
        if [ "$api_started" = false ]; then
            print_error "API 服务器启动失败，已尝试 $max_retries 次"
            return 1
        fi
        
        # 启动 Electron 前端（前台，会阻塞）
        print_info "启动 Electron 前端..."
        cd "$PROJECT_DIR/electron-app"
        
        # 设置 Electron 退出时的清理
        trap "cleanup_processes; exit" INT TERM
        
        npm run dev
        
        # Electron 退出时，停止 API 服务器
        cleanup_processes
        cd "$PROJECT_DIR"
    else
        print_info "仅启动 API 服务器..."
        print_info "提示：要使用完整功能，请安装 Node.js 并在另一个终端运行："
        print_info "  cd electron-app && npm install && npm run dev"
        print_info "提示：按 Ctrl+C 停止服务器"
        echo ""
        
        # 设置退出时的清理
        trap cleanup_processes EXIT INT TERM
        
        python "$PROJECT_DIR/api_server.py" --port $api_port --host $api_host
    fi
}

# 清理函数（已移动到run_app中）
cleanup() {
    cleanup_processes
}

# 主函数
main() {
    print_info "=========================================="
    print_info "语音桌面助手 - 快速启动"
    print_info "=========================================="
    echo ""
    
    # 切换到项目目录
    cd "$PROJECT_DIR"
    
    # 执行检查和部署步骤
    check_python
    check_system_deps
    setup_venv
    install_dependencies
    check_config
    check_permissions
    verify_installation
    check_nodejs  # 检查但不强制要求
    
    echo ""
    print_success "所有检查完成，准备启动应用..."
    echo ""
    
    # 设置退出时的清理
    trap cleanup EXIT
    
    # 运行应用
    run_app
}

# 处理命令行参数
case "${1:-}" in
    --help|-h)
        echo "用法: $0 [选项]"
        echo ""
        echo "选项:"
        echo "  --help, -h      显示帮助信息"
        echo "  --clean         清理虚拟环境和缓存"
        echo "  --reinstall     重新安装依赖"
        echo "  --check-only    仅检查环境，不运行应用"
        echo ""
        exit 0
        ;;
    --clean)
        print_info "清理虚拟环境..."
        rm -rf "$VENV_DIR"
        print_success "虚拟环境已清理"
        exit 0
        ;;
    --reinstall)
        print_info "重新安装依赖..."
        rm -f "$VENV_DIR/.installed"
        check_python
        setup_venv
        install_dependencies
        print_success "依赖重新安装完成"
        exit 0
        ;;
    --check-only)
        check_python
        check_system_deps
        if [ -d "$VENV_DIR" ]; then
            source "$VENV_DIR/bin/activate"
            verify_installation
        else
            print_warning "虚拟环境不存在，请先运行完整部署"
        fi
        exit 0
        ;;
    "")
        # 无参数，执行主流程
        main
        ;;
    *)
        print_error "未知参数: $1"
        echo "使用 --help 查看帮助信息"
        exit 1
        ;;
esac
