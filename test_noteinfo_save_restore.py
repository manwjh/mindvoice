#!/usr/bin/env python3
"""
测试 noteInfo 保存和恢复
"""
import json
import requests
import time

API_BASE_URL = "http://127.0.0.1:8765"

def test_save_with_noteinfo():
    """测试保存带 noteInfo 的记录"""
    print("=" * 80)
    print("测试：保存带 noteInfo 的记录")
    print("=" * 80)
    
    # 构造测试数据
    test_blocks = [
        {
            "id": "block-noteinfo-test",
            "type": "note-info",
            "content": "",
            "noteInfo": {
                "title": "测试笔记标题",
                "type": "测试",
                "relatedPeople": "测试人员",
                "location": "测试地点",
                "startTime": "2026-01-05 10:00:00",
                "endTime": "2026-01-05 11:00:00"
            }
        },
        {
            "id": "block-test-1",
            "type": "paragraph",
            "content": "这是测试内容第一段",
            "isAsrWriting": False
        },
        {
            "id": "block-test-2",
            "type": "paragraph",
            "content": "这是测试内容第二段",
            "isAsrWriting": False
        }
    ]
    
    test_noteinfo = {
        "title": "测试笔记标题",
        "type": "测试",
        "relatedPeople": "测试人员",
        "location": "测试地点",
        "startTime": "2026-01-05 10:00:00",
        "endTime": "2026-01-05 11:00:00"
    }
    
    save_data = {
        "text": "这是测试内容第一段\n这是测试内容第二段",
        "app_type": "voice-note",
        "metadata": {
            "blocks": test_blocks,
            "noteInfo": test_noteinfo,
            "trigger": "test",
            "timestamp": int(time.time() * 1000)
        }
    }
    
    print("\n📤 发送保存请求...")
    print(f"  - blocks 数量: {len(test_blocks)}")
    print(f"  - noteInfo: {test_noteinfo}")
    
    response = requests.post(f"{API_BASE_URL}/api/text/save", json=save_data)
    
    if response.status_code != 200:
        print(f"❌ 保存失败: HTTP {response.status_code}")
        print(response.text)
        return None
    
    result = response.json()
    if not result.get("success"):
        print(f"❌ 保存失败: {result.get('message')}")
        return None
    
    record_id = result.get("record_id")
    print(f"✅ 保存成功！记录 ID: {record_id}")
    
    return record_id


def test_recover_noteinfo(record_id: str):
    """测试恢复记录中的 noteInfo"""
    print("\n" + "=" * 80)
    print(f"测试：恢复记录 {record_id}")
    print("=" * 80)
    
    print("\n📥 发送恢复请求...")
    response = requests.get(f"{API_BASE_URL}/api/records/{record_id}")
    
    if response.status_code != 200:
        print(f"❌ 恢复失败: HTTP {response.status_code}")
        print(response.text)
        return False
    
    record = response.json()
    print(f"✅ 恢复成功！")
    
    # 检查数据
    print("\n🔍 检查恢复的数据:")
    print(f"  - id: {record.get('id')}")
    print(f"  - app_type: {record.get('app_type')}")
    print(f"  - text 长度: {len(record.get('text', ''))}")
    
    metadata = record.get('metadata', {})
    blocks = metadata.get('blocks', [])
    note_info_from_metadata = metadata.get('noteInfo')
    
    print(f"\n  metadata:")
    print(f"    - blocks 数量: {len(blocks)}")
    print(f"    - noteInfo (顶层): {note_info_from_metadata}")
    
    # 查找 note-info 块
    note_info_blocks = [b for b in blocks if b.get('type') == 'note-info']
    print(f"\n  note-info 块:")
    print(f"    - 数量: {len(note_info_blocks)}")
    
    if note_info_blocks:
        for i, block in enumerate(note_info_blocks, 1):
            note_info = block.get('noteInfo', {})
            print(f"\n    块 #{i}:")
            print(f"      - id: {block.get('id')}")
            print(f"      - type: {block.get('type')}")
            print(f"      - noteInfo:")
            print(f"          title: {note_info.get('title')}")
            print(f"          type: {note_info.get('type')}")
            print(f"          relatedPeople: {note_info.get('relatedPeople')}")
            print(f"          location: {note_info.get('location')}")
            print(f"          startTime: {note_info.get('startTime')}")
            print(f"          endTime: {note_info.get('endTime')}")
    else:
        print("    ⚠️  没有找到 note-info 块！")
    
    # 验证
    print("\n" + "=" * 80)
    print("验证结果:")
    
    success = True
    
    # 1. 检查 blocks 中是否有 note-info 块
    if len(note_info_blocks) == 0:
        print("❌ 失败：blocks 中没有 note-info 块")
        success = False
    else:
        print("✅ 通过：blocks 中包含 note-info 块")
    
    # 2. 检查 note-info 块是否包含 noteInfo 数据
    if note_info_blocks:
        block_note_info = note_info_blocks[0].get('noteInfo', {})
        if not block_note_info.get('title'):
            print("❌ 失败：note-info 块中的 noteInfo 数据为空")
            success = False
        else:
            print(f"✅ 通过：note-info 块包含完整的 noteInfo 数据")
    
    # 3. 检查顶层 metadata.noteInfo
    if not note_info_from_metadata:
        print("⚠️  警告：顶层 metadata.noteInfo 不存在（但不影响功能）")
    else:
        print("✅ 通过：顶层 metadata.noteInfo 存在")
    
    print("=" * 80)
    
    return success


def main():
    print("\n🚀 开始测试 noteInfo 保存和恢复功能\n")
    
    # 测试保存
    record_id = test_save_with_noteinfo()
    if not record_id:
        print("\n❌ 测试失败：保存阶段失败")
        return
    
    # 等待一下确保数据已写入
    time.sleep(0.5)
    
    # 测试恢复
    success = test_recover_noteinfo(record_id)
    
    if success:
        print("\n✅ 所有测试通过！noteInfo 保存和恢复功能正常。")
    else:
        print("\n❌ 测试失败！请检查上面的错误信息。")
    
    # 清理测试数据
    print(f"\n🧹 清理测试数据...")
    try:
        response = requests.delete(f"{API_BASE_URL}/api/records", json={"record_ids": [record_id]})
        if response.status_code == 200:
            print("✅ 测试数据已清理")
        else:
            print(f"⚠️  清理失败（可手动删除）: {record_id}")
    except Exception as e:
        print(f"⚠️  清理失败: {e}")


if __name__ == "__main__":
    main()

