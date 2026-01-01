#!/bin/bash

# 生成系统托盘图标脚本
# 为 macOS 生成各种尺寸的托盘图标

SOURCE_ICON="assets/ico.png"
OUTPUT_DIR="assets/tray-icons"

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

echo "[INFO] 开始生成托盘图标..."

# 检查源图标是否存在
if [ ! -f "$SOURCE_ICON" ]; then
    echo "[ERROR] 源图标文件不存在: $SOURCE_ICON"
    exit 1
fi

# macOS 系统托盘图标尺寸
# 标准尺寸: 16x16, 22x22 (macOS 推荐), 32x32
# Retina 尺寸: 32x32, 44x44, 64x64

echo "[INFO] 生成标准尺寸图标..."

# 16x16 (标准 1x)
sips -z 16 16 "$SOURCE_ICON" --out "$OUTPUT_DIR/tray-icon-16x16.png" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "[SUCCESS] 生成 16x16 图标"
else
    echo "[WARN] 生成 16x16 图标失败，尝试使用 ImageMagick..."
    convert "$SOURCE_ICON" -resize 16x16 "$OUTPUT_DIR/tray-icon-16x16.png" 2>/dev/null
fi

# 22x22 (macOS 推荐尺寸，1x)
sips -z 22 22 "$SOURCE_ICON" --out "$OUTPUT_DIR/tray-icon-22x22.png" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "[SUCCESS] 生成 22x22 图标"
else
    convert "$SOURCE_ICON" -resize 22x22 "$OUTPUT_DIR/tray-icon-22x22.png" 2>/dev/null
fi

# 32x32 (标准 2x / Retina 1x)
sips -z 32 32 "$SOURCE_ICON" --out "$OUTPUT_DIR/tray-icon-32x32.png" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "[SUCCESS] 生成 32x32 图标"
else
    convert "$SOURCE_ICON" -resize 32x32 "$OUTPUT_DIR/tray-icon-32x32.png" 2>/dev/null
fi

# 44x44 (Retina 2x，macOS 推荐)
sips -z 44 44 "$SOURCE_ICON" --out "$OUTPUT_DIR/tray-icon-44x44.png" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "[SUCCESS] 生成 44x44 图标"
else
    convert "$SOURCE_ICON" -resize 44x44 "$OUTPUT_DIR/tray-icon-44x44.png" 2>/dev/null
fi

# 64x64 (高分辨率)
sips -z 64 64 "$SOURCE_ICON" --out "$OUTPUT_DIR/tray-icon-64x64.png" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "[SUCCESS] 生成 64x64 图标"
else
    convert "$SOURCE_ICON" -resize 64x64 "$OUTPUT_DIR/tray-icon-64x64.png" 2>/dev/null
fi

echo ""
echo "[INFO] 图标生成完成！"
echo "[INFO] 输出目录: $OUTPUT_DIR"
echo ""
echo "生成的图标文件："
ls -lh "$OUTPUT_DIR"/*.png 2>/dev/null | awk '{print "  - " $9 " (" $5 ")"}'

echo ""
echo "[INFO] 建议使用 22x22 或 44x44 作为 macOS 托盘图标"

