#!/usr/bin/env python3
"""
初始化会员体系数据库

功能：
- 创建会员相关数据库表
- 初始化索引
- 向后兼容现有数据
"""

import sqlite3
import sys
from pathlib import Path
from datetime import datetime

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.core.config import Config
from src.core.logger import get_logger

logger = get_logger("MembershipDB")


def create_membership_tables(db_path: Path) -> None:
    """创建会员体系相关表"""
    
    logger.info(f"[数据库] 初始化会员体系数据库: {db_path}")
    
    # 确保数据库目录存在
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. 设备信息表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS devices (
                device_id TEXT PRIMARY KEY,
                machine_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                first_install_time TIMESTAMP NOT NULL,
                last_active_time TIMESTAMP NOT NULL,
                install_count INTEGER DEFAULT 1,
                created_at TIMESTAMP NOT NULL
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_devices_machine_id ON devices(machine_id)')
        logger.info("[数据库] ✓ 设备信息表已创建")
        
        # 2. 用户信息表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_profiles (
                device_id TEXT PRIMARY KEY,
                nickname TEXT,
                email TEXT,
                bio TEXT,
                avatar_path TEXT,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                FOREIGN KEY (device_id) REFERENCES devices(device_id)
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email)')
        logger.info("[数据库] ✓ 用户信息表已创建")
        
        # 3. 会员信息表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS memberships (
                device_id TEXT PRIMARY KEY,
                tier TEXT NOT NULL DEFAULT 'free',
                status TEXT NOT NULL DEFAULT 'active',
                subscription_period INTEGER,
                activated_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP,
                auto_renew INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                FOREIGN KEY (device_id) REFERENCES devices(device_id),
                CHECK (subscription_period IS NULL OR (subscription_period >= 1 AND subscription_period <= 120)),
                CHECK (tier IN ('free', 'vip', 'pro', 'pro_plus')),
                CHECK (status IN ('active', 'expired', 'pending'))
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status, expires_at)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_memberships_tier ON memberships(tier)')
        logger.info("[数据库] ✓ 会员信息表已创建")
        
        # 4. 消费记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS consumption_records (
                id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                unit TEXT NOT NULL,
                model_source TEXT DEFAULT 'vendor',
                details TEXT,
                session_id TEXT,
                timestamp TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL,
                FOREIGN KEY (device_id) REFERENCES devices(device_id),
                CHECK (type IN ('asr', 'llm')),
                CHECK (unit IN ('ms', 'tokens')),
                CHECK (model_source IN ('vendor', 'user')),
                CHECK (amount >= 0)
            )
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_consumption_device_time 
            ON consumption_records(device_id, year, month, timestamp DESC)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_consumption_type 
            ON consumption_records(device_id, type)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_consumption_model_source 
            ON consumption_records(device_id, type, model_source)
        ''')
        logger.info("[数据库] ✓ 消费记录表已创建")
        
        # 5. 月度消费汇总表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS monthly_consumption (
                device_id TEXT NOT NULL,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                asr_duration_ms INTEGER NOT NULL DEFAULT 0,
                llm_prompt_tokens INTEGER NOT NULL DEFAULT 0,
                llm_completion_tokens INTEGER NOT NULL DEFAULT 0,
                llm_total_tokens INTEGER NOT NULL DEFAULT 0,
                record_count INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                PRIMARY KEY (device_id, year, month),
                FOREIGN KEY (device_id) REFERENCES devices(device_id),
                CHECK (asr_duration_ms >= 0),
                CHECK (llm_total_tokens >= 0)
            )
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_monthly_consumption_device 
            ON monthly_consumption(device_id, year DESC, month DESC)
        ''')
        logger.info("[数据库] ✓ 月度消费汇总表已创建")
        
        # 6. 会员升级历史表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS membership_history (
                id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                from_tier TEXT NOT NULL,
                to_tier TEXT NOT NULL,
                subscription_period INTEGER NOT NULL,
                activated_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL,
                FOREIGN KEY (device_id) REFERENCES devices(device_id),
                CHECK (subscription_period >= 1)
            )
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_membership_history_device 
            ON membership_history(device_id, activated_at DESC)
        ''')
        logger.info("[数据库] ✓ 会员升级历史表已创建")
        
        # 7. 版本表（用于数据库迁移）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL,
                description TEXT
            )
        ''')
        
        # 检查是否已有版本记录
        cursor.execute('SELECT COUNT(*) FROM schema_version WHERE version = 1')
        if cursor.fetchone()[0] == 0:
            cursor.execute('''
                INSERT INTO schema_version (version, applied_at, description)
                VALUES (1, ?, '会员体系初始版本')
            ''', (datetime.now().strftime('%Y-%m-%d %H:%M:%S'),))
            logger.info("[数据库] ✓ 数据库版本已初始化")
        
        conn.commit()
        logger.info("[数据库] ✅ 会员体系数据库初始化完成")
        
    except Exception as e:
        conn.rollback()
        logger.error(f"[数据库] ❌ 初始化失败: {e}")
        raise
    finally:
        conn.close()


def main():
    """主函数"""
    try:
        # 加载配置
        config = Config()
        
        # 获取数据库路径
        data_dir = Path(config.get('storage.data_dir')).expanduser()
        database_relative = Path(config.get('storage.database'))
        db_path = data_dir / database_relative
        
        logger.info(f"[数据库] 数据目录: {data_dir}")
        logger.info(f"[数据库] 数据库路径: {db_path}")
        
        # 创建表
        create_membership_tables(db_path)
        
        logger.info("[数据库] 🎉 所有任务完成！")
        
    except Exception as e:
        logger.error(f"[数据库] 执行失败: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()

