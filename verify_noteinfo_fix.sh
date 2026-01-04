#!/bin/bash
# 快速验证 noteInfo 修复

echo "🔍 检查最近保存的记录是否包含 note-info 块..."
echo ""

cd /Users/wangjunhui/playcode/语音桌面助手
source venv/bin/activate

python check_noteinfo.py | grep -A 20 "记录 #1"

echo ""
echo "💡 验证方法："
echo "  1. 前端应该已经热更新（如果没有，刷新页面）"
echo "  2. 创建新笔记，填写 noteInfo 信息"
echo "  3. 输入内容后保存"
echo "  4. 从历史记录恢复，检查 noteInfo 是否正确显示"
echo ""
echo "  如果 noteInfo 正确显示，说明修复成功！"

