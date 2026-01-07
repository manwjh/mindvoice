#!/bin/bash
#
# MindVoice macOS 构建脚本
# 用途：构建 macOS 平台的完整安装包（arm64）
# 作者：深圳王哥 & AI
# 日期：2026-01-05
# 版本：1.0.0
#

set -euo pipefail  # 严格错误处理

# ============================================================================
# 配置
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
PYTHON_DIST_DIR="$PROJECT_ROOT/dist"
PYTHON_BUILD_DIR="$PROJECT_ROOT/build/python-backend"
ELECTRON_DIR="$PROJECT_ROOT/electron-app"
RELEASE_DIR="$PROJECT_ROOT/release"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# 工具函数
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 未安装"
        return 1
    fi
    return 0
}

# ============================================================================
# 环境检查
# ============================================================================

check_environment() {
    log_info "检查构建环境..."
    
    # 检查必要命令
    local required_commands=("python3" "node" "npm")
    for cmd in "${required_commands[@]}"; do
        if ! check_command "$cmd"; then
            log_error "缺少必要命令: $cmd"
            exit 1
        fi
    done
    
    # 检查 Python 版本
    local python_version=$(python3 --version | awk '{print $2}')
    log_info "Python 版本: $python_version"
    
    # 检查 Node.js 版本
    local node_version=$(node --version)
    log_info "Node.js 版本: $node_version"
    
    # 检查 venv
    if [ ! -d "$PROJECT_ROOT/venv" ]; then
        log_error "Python 虚拟环境不存在，请先运行: python3 -m venv venv"
        exit 1
    fi
    
    log_success "环境检查通过"
}

# ============================================================================
# 清理
# ============================================================================

clean_build() {
    log_info "清理旧的构建文件..."
    
    rm -rf "$PYTHON_DIST_DIR"
    rm -rf "$PYTHON_BUILD_DIR"
    rm -rf "$ELECTRON_DIR/dist"
    rm -rf "$ELECTRON_DIR/dist-electron"
    
    # 只清理 macOS 相关的构建产物，保留其他平台的
    log_info "清理 macOS 构建产物..."
    rm -rf "$RELEASE_DIR/latest/mac" 2>/dev/null || true
    rm -rf "$RELEASE_DIR/latest/mac-arm64" 2>/dev/null || true
    rm -f "$RELEASE_DIR/latest"/*-mac-*.dmg 2>/dev/null || true
    rm -f "$RELEASE_DIR/latest"/*-mac-*.dmg.sha256 2>/dev/null || true
    rm -f "$RELEASE_DIR/latest"/*-mac-*.zip 2>/dev/null || true
    rm -f "$RELEASE_DIR/latest"/*-mac-*.zip.sha256 2>/dev/null || true
    rm -f "$RELEASE_DIR/latest"/*-mac-*.blockmap 2>/dev/null || true
    
    log_success "清理完成"
}

# ============================================================================
# Python 后端打包
# ============================================================================

build_python_backend() {
    log_info "开始打包 Python 后端..."
    
    cd "$PROJECT_ROOT"
    source venv/bin/activate
    
    # 安装 PyInstaller
    log_info "检查 PyInstaller..."
    pip install pyinstaller --quiet
    
    # 使用 spec 文件打包
    log_info "执行打包..."
    pyinstaller "$BUILD_DIR/config/pyinstaller.spec" \
        --distpath "$PYTHON_DIST_DIR" \
        --workpath "$PYTHON_BUILD_DIR" \
        --noconfirm
    
    # 验证输出
    if [ ! -f "$PYTHON_DIST_DIR/mindvoice-api" ]; then
        log_error "Python 后端打包失败"
        deactivate
        exit 1
    fi
    
    # 测试运行
    log_info "测试 Python 后端..."
    if "$PYTHON_DIST_DIR/mindvoice-api" --help &> /dev/null; then
        log_success "Python 后端打包成功"
    else
        log_warning "Python 后端可能存在问题，但继续构建..."
    fi
    
    deactivate
}

# ============================================================================
# Electron 前端构建
# ============================================================================

build_electron_frontend() {
    log_info "开始构建 Electron 前端..."
    
    cd "$ELECTRON_DIR"
    
    # 检查 node_modules
    if [ ! -d "node_modules" ]; then
        log_info "安装依赖..."
        npm install
    fi
    
    # 复制构建资源到 electron-app/build
    log_info "准备构建资源..."
    mkdir -p build
    cp -r "$BUILD_DIR/resources/"* build/ 2>/dev/null || true
    
    # 构建前端
    log_info "构建 Vite 前端..."
    npm run build:vite
    
    log_info "构建 Electron 主进程..."
    npm run build:electron
    
    log_success "Electron 前端构建完成"
}

# ============================================================================
# 打包应用
# ============================================================================

package_application() {
    log_info "开始打包 macOS 应用..."
    
    cd "$ELECTRON_DIR"
    
    # 使用 electron-builder 打包
    npx electron-builder \
        --mac \
        --config "$BUILD_DIR/config/electron-builder.json" \
        --publish never
    
    log_success "应用打包完成"
}

# ============================================================================
# 后处理
# ============================================================================

post_build() {
    log_info "后处理..."
    
    # 清理不需要的文件（只清理 macOS 相关的）
    log_info "清理 macOS 中间文件和不需要的构建产物..."
    rm -rf "$RELEASE_DIR/latest/mac" 2>/dev/null || true
    rm -rf "$RELEASE_DIR/latest/mac-arm64" 2>/dev/null || true
    rm -f "$RELEASE_DIR/latest"/*-mac-*.blockmap 2>/dev/null || true
    rm -f "$RELEASE_DIR/latest"/*-mac-*.zip 2>/dev/null || true
    rm -f "$RELEASE_DIR/latest"/*-mac-x64.dmg 2>/dev/null || true
    rm -f "$RELEASE_DIR/latest"/*-mac-x64.dmg.sha256 2>/dev/null || true
    # 注意：builder-*.yml 和 builder-*.yaml 可能是多平台共享的，保留
    
    # 显示最终输出文件
    log_info "构建产物："
    find "$RELEASE_DIR/latest" -type f -name "*.dmg" -exec ls -lh {} \; 2>/dev/null || log_warning "未找到安装包文件"
    
    # 只生成 arm64 dmg 的 SHA256 校验和
    log_info "生成 SHA256 校验和..."
    cd "$RELEASE_DIR/latest"
    for file in MindVoice-*-mac-arm64.dmg; do
        if [ -f "$file" ]; then
            if command -v shasum &> /dev/null; then
                shasum -a 256 "$file" > "$file.sha256"
                log_success "$file → $file.sha256"
            elif command -v sha256sum &> /dev/null; then
                sha256sum "$file" > "$file.sha256"
                log_success "$file → $file.sha256"
            else
                log_warning "未找到 SHA256 工具，跳过校验和生成"
            fi
        fi
    done
    
    cd "$PROJECT_ROOT"
    
    log_success "清理完成，只保留 macOS arm64 DMG 安装包"
}

# ============================================================================
# 主流程
# ============================================================================

main() {
    log_info "=========================================="
    log_info "MindVoice macOS 构建脚本"
    log_info "=========================================="
    echo
    
    # 读取版本号
    local version=$(grep -o '"version": *"[^"]*"' "$ELECTRON_DIR/package.json" | cut -d'"' -f4)
    log_info "构建版本: $version"
    echo
    
    # 执行构建流程
    check_environment
    clean_build
    build_python_backend
    build_electron_frontend
    package_application
    post_build
    
    echo
    log_success "=========================================="
    log_success "构建完成！"
    log_success "=========================================="
    log_info "安装包位置: $RELEASE_DIR/latest/"
    log_info "macOS arm64 安装包: MindVoice-${version}-mac-arm64.dmg"
}

# 执行主流程
main "$@"

