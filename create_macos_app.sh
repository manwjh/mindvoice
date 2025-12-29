#!/bin/bash

# =============================================================
# 创建 macOS 应用程序快捷方式
# =============================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="语音桌面助手"
APP_DIR="$HOME/Applications/${APP_NAME}.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

echo "正在创建 macOS 应用程序快捷方式..."

# 创建目录结构
mkdir -p "$MACOS_DIR"
mkdir -p "$RESOURCES_DIR"

# 创建启动脚本（将项目路径硬编码进去）
cat > "$MACOS_DIR/${APP_NAME}" << EOF
#!/bin/bash

# 项目目录（在创建应用程序时设置）
PROJECT_DIR="$PROJECT_DIR"

# 切换到项目目录
cd "\$PROJECT_DIR"

# 打开终端并运行启动脚本
osascript <<APPLESCRIPT
tell application "Terminal"
    activate
    do script "cd \\"$PROJECT_DIR\\" && ./quick_start.sh"
end tell
APPLESCRIPT
EOF

# 设置执行权限
chmod +x "$MACOS_DIR/${APP_NAME}"

# 创建 Info.plist
cat > "$CONTENTS_DIR/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.mindvoice.app</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.14</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
EOF

# 创建图标（如果有的话，可以后续添加）
# 暂时使用系统默认图标

echo "✅ 应用程序已创建: $APP_DIR"
echo ""
echo "使用方法："
echo "1. 打开 Finder，进入 ~/Applications 文件夹"
echo "2. 双击 \"${APP_NAME}.app\" 即可启动应用"
echo ""
echo "提示：你也可以将应用程序拖拽到 Dock 或桌面创建快捷方式"

