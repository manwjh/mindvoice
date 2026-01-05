#!/usr/bin/env python3
"""
测试消费记录修复
验证ASR消费是否正确记录到数据库
"""
import sys
import sqlite3
from pathlib import Path
from datetime import datetime

def main():
    # 数据库路径
    db_path = Path.home() / "Library/Application Support/MindVoice/database/history.db"
    
    if not db_path.exists():
        print(f"❌ 数据库不存在: {db_path}")
        return 1
    
    print(f"✅ 数据库路径: {db_path}")
    print(f"✅ 数据库大小: {db_path.stat().st_size / 1024:.2f} KB")
    print()
    
    # 连接数据库
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 检查表是否存在
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='consumption_records'")
    if not cursor.fetchone():
        print("❌ consumption_records 表不存在")
        return 1
    
    print("✅ consumption_records 表存在")
    print()
    
    # 查询ASR消费记录总数
    cursor.execute("SELECT COUNT(*) FROM consumption_records WHERE type='asr'")
    asr_count = cursor.fetchone()[0]
    print(f"📊 ASR消费记录总数: {asr_count}")
    
    # 查询LLM消费记录总数
    cursor.execute("SELECT COUNT(*) FROM consumption_records WHERE type='llm'")
    llm_count = cursor.fetchone()[0]
    print(f"📊 LLM消费记录总数: {llm_count}")
    
    # 查询所有消费记录总数
    cursor.execute("SELECT COUNT(*) FROM consumption_records")
    total_count = cursor.fetchone()[0]
    print(f"📊 总消费记录数: {total_count}")
    print()
    
    # 查询最近10条ASR消费记录
    cursor.execute("""
        SELECT created_at, amount, unit, details 
        FROM consumption_records 
        WHERE type='asr'
        ORDER BY created_at DESC 
        LIMIT 10
    """)
    
    asr_records = cursor.fetchall()
    
    if asr_records:
        print("📋 最近10条ASR消费记录:")
        print("-" * 100)
        for record in asr_records:
            created_at, amount, unit, details = record
            duration_sec = amount / 1000 if unit == 'ms' else amount
            print(f"时间: {created_at} | 时长: {duration_sec:.2f}秒 | 详情: {details}")
    else:
        print("⚠️  暂无ASR消费记录")
    
    print()
    
    # 查询最近10条LLM消费记录
    cursor.execute("""
        SELECT created_at, amount, unit, details 
        FROM consumption_records 
        WHERE type='llm'
        ORDER BY created_at DESC 
        LIMIT 10
    """)
    
    llm_records = cursor.fetchall()
    
    if llm_records:
        print("📋 最近10条LLM消费记录:")
        print("-" * 100)
        for record in llm_records:
            created_at, amount, unit, details = record
            print(f"时间: {created_at} | Tokens: {amount} | 详情: {details}")
    else:
        print("⚠️  暂无LLM消费记录")
    
    print()
    
    # 查询今日ASR消费总时长
    today = datetime.now().strftime('%Y-%m-%d')
    cursor.execute("""
        SELECT SUM(amount) 
        FROM consumption_records 
        WHERE type='asr' AND created_at LIKE ?
    """, (f"{today}%",))
    
    today_asr_total = cursor.fetchone()[0] or 0
    today_asr_sec = today_asr_total / 1000 if today_asr_total > 0 else 0
    
    # 查询今日LLM消费总tokens
    cursor.execute("""
        SELECT SUM(amount) 
        FROM consumption_records 
        WHERE type='llm' AND created_at LIKE ?
    """, (f"{today}%",))
    
    today_llm_total = cursor.fetchone()[0] or 0
    
    print(f"📅 今日ASR消费总时长: {today_asr_sec:.2f}秒 ({today_asr_sec/60:.2f}分钟)")
    print(f"📅 今日LLM消费总tokens: {today_llm_total}")
    
    conn.close()
    
    print()
    print("=" * 100)
    print("✅ 测试完成")
    return 0

if __name__ == '__main__':
    sys.exit(main())

