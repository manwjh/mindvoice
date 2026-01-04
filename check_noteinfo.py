#!/usr/bin/env python3
"""
检查数据库中历史记录的 noteInfo 数据
"""
import sqlite3
import json
import sys
from pathlib import Path
import yaml

# 读取配置
config_path = Path(__file__).parent / 'config.yml'
with open(config_path, 'r', encoding='utf-8') as f:
    config = yaml.safe_load(f)

# 获取数据库路径
data_dir = Path(config['storage']['data_dir']).expanduser()
db_path = data_dir / config['storage']['database']

print(f"数据库路径: {db_path}")
print(f"数据库是否存在: {db_path.exists()}")
print()

if not db_path.exists():
    print("❌ 数据库不存在！")
    sys.exit(1)

# 连接数据库
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

# 查询最近的记录
cursor.execute('''
    SELECT id, text, metadata, app_type, created_at
    FROM records
    WHERE app_type = 'voice-note'
    ORDER BY created_at DESC
    LIMIT 5
''')

records = cursor.fetchall()

print(f"找到 {len(records)} 条最近的语音笔记记录：")
print("=" * 80)

for i, (record_id, text, metadata_str, app_type, created_at) in enumerate(records, 1):
    print(f"\n记录 #{i}")
    print(f"ID: {record_id}")
    print(f"创建时间: {created_at}")
    print(f"文本长度: {len(text)} 字符")
    print(f"文本预览: {text[:100]}..." if len(text) > 100 else f"文本: {text}")
    print()
    
    # 解析 metadata
    try:
        metadata = json.loads(metadata_str) if metadata_str else {}
        
        # 检查 blocks
        blocks = metadata.get('blocks', [])
        print(f"  blocks 数量: {len(blocks)}")
        
        if blocks:
            # 查找 note-info 块
            note_info_blocks = [b for b in blocks if b.get('type') == 'note-info']
            print(f"  note-info 块数量: {len(note_info_blocks)}")
            
            if note_info_blocks:
                for j, block in enumerate(note_info_blocks, 1):
                    note_info = block.get('noteInfo', {})
                    print(f"\n  note-info 块 #{j}:")
                    print(f"    block.id: {block.get('id')}")
                    print(f"    block.type: {block.get('type')}")
                    print(f"    noteInfo 数据:")
                    print(f"      title: {note_info.get('title', '(无)')}")
                    print(f"      type: {note_info.get('type', '(无)')}")
                    print(f"      relatedPeople: {note_info.get('relatedPeople', '(无)')}")
                    print(f"      location: {note_info.get('location', '(无)')}")
                    print(f"      startTime: {note_info.get('startTime', '(无)')}")
                    print(f"      endTime: {note_info.get('endTime', '(无)')}")
            else:
                print("  ⚠️  没有找到 note-info 块！")
                # 显示所有块的类型
                block_types = [b.get('type') for b in blocks[:5]]
                print(f"  前 5 个块的类型: {block_types}")
        
        # 检查顶层 noteInfo
        top_level_noteinfo = metadata.get('noteInfo')
        if top_level_noteinfo:
            print(f"\n  ✅ 顶层 metadata.noteInfo 存在:")
            print(f"    title: {top_level_noteinfo.get('title', '(无)')}")
            print(f"    type: {top_level_noteinfo.get('type', '(无)')}")
        else:
            print(f"\n  ⚠️  顶层 metadata.noteInfo 不存在")
        
    except json.JSONDecodeError as e:
        print(f"  ❌ metadata 解析失败: {e}")
        print(f"  原始 metadata: {metadata_str[:200]}...")
    
    print("-" * 80)

conn.close()

print("\n检查完成！")
print("\n💡 提示：")
print("  - 如果 note-info 块存在但 noteInfo 字段为空，说明保存时没有保存 noteInfo 数据")
print("  - 如果 note-info 块不存在，说明恢复时被过滤掉了")
print("  - 正确的结构应该是 blocks[0].type='note-info' 且 blocks[0].noteInfo 包含数据")

