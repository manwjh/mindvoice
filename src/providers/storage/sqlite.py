"""
SQLite 存储提供商

提供基于 SQLite 的持久化存储服务，支持多应用类型的记录管理。
"""
import sqlite3
import json
import re
from datetime import datetime
from typing import Dict, Any, Optional, List
from pathlib import Path

from .base_storage import BaseStorageProvider


class SQLiteStorageProvider(BaseStorageProvider):
    """SQLite 存储提供商
    
    特性：
    - 支持多应用类型（voice-note, smart-chat, voice-zen）
    - 本地时间戳（非 UTC）
    - JSON 元数据存储
    """
    
    PROVIDER_NAME = "sqlite"
    
    def initialize(self, config: Dict[str, Any]) -> bool:
        """初始化存储提供商
        
        Args:
            config: 配置字典，包含：
                - data_dir: 数据根目录
                - database: 数据库文件相对路径
                - images: 图片目录相对路径
        
        Returns:
            初始化是否成功
        """
        super().initialize(config)
        
        # 读取配置
        data_dir = Path(config['data_dir']).expanduser()
        db_relative_path = config['database']
        self.db_path = data_dir / db_relative_path
        
        # 存储图片目录配置，用于删除图片
        self.data_dir = data_dir
        self.images_relative = Path(config.get('images', 'images'))
        self.images_dir = self.data_dir / self.images_relative
        
        # 确保目录存在
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        self._create_table()
        return True
    
    def _create_table(self):
        """初始化数据表结构（v1.2.0 基准版本）"""
        import logging
        logger = logging.getLogger(__name__)
        
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA foreign_keys=ON')
        cursor = conn.cursor()
        
        # ==================== 核心表 ====================
        
        # 1. records 表（历史记录）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                metadata TEXT,
                app_type TEXT NOT NULL DEFAULT 'voice-note',
                user_id TEXT,
                device_id TEXT,
                
                -- 软删除
                is_deleted INTEGER DEFAULT 0,
                deleted_at TIMESTAMP,
                
                -- 收藏和归档
                is_starred INTEGER DEFAULT 0,
                is_archived INTEGER DEFAULT 0,
                
                -- 时间戳
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP
            )
        ''')
        
        # records 表索引
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_records_device_id ON records(device_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_records_user_created ON records(user_id, created_at DESC)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_records_not_deleted ON records(is_deleted, user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_records_starred ON records(user_id, is_starred DESC) WHERE is_starred = 1')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_records_archived ON records(user_id, is_archived) WHERE is_archived = 1')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_records_app_type ON records(app_type, user_id, created_at DESC)')
        
        # 2. 全文搜索虚拟表（FTS5）
        # 注意：不使用 content='records'，使用独立的 FTS5 表以避免触发器问题
        cursor.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
                record_id UNINDEXED,
                text,
                tokenize='unicode61 remove_diacritics 2'
            )
        ''')
        
        # FTS5 同步触发器（适用于独立 FTS5 表）
        cursor.execute('''
            CREATE TRIGGER IF NOT EXISTS records_ai AFTER INSERT ON records BEGIN
                INSERT INTO records_fts(record_id, text)
                VALUES (new.id, new.text);
            END
        ''')
        
        cursor.execute('''
            CREATE TRIGGER IF NOT EXISTS records_au AFTER UPDATE ON records BEGIN
                UPDATE records_fts SET text = new.text WHERE record_id = old.id;
            END
        ''')
        
        cursor.execute('''
            CREATE TRIGGER IF NOT EXISTS records_ad AFTER DELETE ON records BEGIN
                DELETE FROM records_fts WHERE record_id = old.id;
            END
        ''')
        
        # ==================== 标签系统 ====================
        
        # 3. tags 表（标签）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tags (
                tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                tag_name TEXT NOT NULL,
                color TEXT,
                icon TEXT,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP NOT NULL,
                UNIQUE(user_id, tag_name)
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id, sort_order)')
        
        # 4. record_tags 表（记录-标签关联）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS record_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id TEXT NOT NULL,
                tag_id INTEGER NOT NULL,
                created_at TIMESTAMP NOT NULL,
                UNIQUE(record_id, tag_id),
                FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(tag_id) ON DELETE CASCADE
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_record_tags_record ON record_tags(record_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_record_tags_tag ON record_tags(tag_id)')
        
        # ==================== 统计和监控 ====================
        
        # 5. daily_stats 表（每日使用统计）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS daily_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                date DATE NOT NULL,
                app_type TEXT NOT NULL,
                
                -- 使用统计
                record_count INTEGER DEFAULT 0,
                asr_duration_seconds INTEGER DEFAULT 0,
                llm_tokens INTEGER DEFAULT 0,
                active_duration_seconds INTEGER DEFAULT 0,
                
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP,
                
                UNIQUE(user_id, date, app_type)
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, date DESC)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC)')
        
        # 6. backup_logs 表（备份记录）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS backup_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                backup_type TEXT NOT NULL,
                backup_path TEXT NOT NULL,
                file_size INTEGER,
                status TEXT NOT NULL,
                error_message TEXT,
                started_at TIMESTAMP NOT NULL,
                completed_at TIMESTAMP,
                records_count INTEGER,
                users_count INTEGER
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_backup_logs_started ON backup_logs(started_at DESC)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs(status, started_at DESC)')
        
        # ==================== 会员系统 ====================
        
        # 7. devices 表（设备信息）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS devices (
                device_id TEXT PRIMARY KEY,
                machine_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                first_registered_at TIMESTAMP NOT NULL,
                last_active_at TIMESTAMP NOT NULL,
                UNIQUE(machine_id, platform)
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_devices_machine ON devices(machine_id, platform)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(last_active_at DESC)')
        
        # 8. memberships 表（会员信息 - 绑定到用户而不是设备）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS memberships (
                user_id TEXT PRIMARY KEY,
                tier TEXT NOT NULL DEFAULT 'free',
                status TEXT NOT NULL DEFAULT 'active',
                subscription_period INTEGER,
                activated_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP,
                auto_renew INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                CHECK (subscription_period IS NULL OR (subscription_period >= 1 AND subscription_period <= 120)),
                CHECK (tier IN ('free', 'vip', 'pro', 'pro_plus')),
                CHECK (status IN ('active', 'expired', 'pending'))
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status, expires_at)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_memberships_tier ON memberships(tier)')
        
        # 9. consumption_records 表（消费记录 - 按设备记录，按用户统计）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS consumption_records (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
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
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (device_id) REFERENCES devices(device_id),
                CHECK (type IN ('asr', 'llm')),
                CHECK (unit IN ('ms', 'tokens')),
                CHECK (model_source IN ('vendor', 'user')),
                CHECK (amount >= 0)
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_consumption_user_time ON consumption_records(user_id, year, month, timestamp DESC)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_consumption_device_time ON consumption_records(device_id, year, month, timestamp DESC)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_consumption_type ON consumption_records(user_id, type)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_consumption_model_source ON consumption_records(user_id, type, model_source)')
        
        # 10. monthly_consumption 表（月度消费汇总 - 按用户统计，device_id仅用于记录明细）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS monthly_consumption (
                user_id TEXT NOT NULL,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                asr_duration_ms INTEGER NOT NULL DEFAULT 0,
                llm_prompt_tokens INTEGER NOT NULL DEFAULT 0,
                llm_completion_tokens INTEGER NOT NULL DEFAULT 0,
                llm_total_tokens INTEGER NOT NULL DEFAULT 0,
                record_count INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                PRIMARY KEY (user_id, year, month),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                CHECK (asr_duration_ms >= 0),
                CHECK (llm_total_tokens >= 0)
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_monthly_consumption_user ON monthly_consumption(user_id, year DESC, month DESC)')
        
        # 11. activation_codes 表（激活码）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS activation_codes (
                code TEXT PRIMARY KEY,
                tier TEXT NOT NULL,
                subscription_period INTEGER NOT NULL,
                is_used INTEGER NOT NULL DEFAULT 0,
                used_by_device_id TEXT,
                used_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP,
                batch_id TEXT,
                CHECK (tier IN ('vip', 'pro', 'pro_plus')),
                CHECK (subscription_period >= 1 AND subscription_period <= 120),
                CHECK (is_used IN (0, 1))
            )
        ''')
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_activation_codes_used ON activation_codes(is_used, expires_at)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_activation_codes_tier ON activation_codes(tier)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_activation_codes_batch ON activation_codes(batch_id)')
        
        # ==================== 数据库版本管理 ====================
        
        # 12. schema_versions 表（数据库版本）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS schema_versions (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL,
                description TEXT
            )
        ''')
        
        # 记录当前版本
        cursor.execute('''
            INSERT OR IGNORE INTO schema_versions (version, applied_at, description)
            VALUES ('1.2.1', datetime('now', 'localtime'), '会员系统重构：会员等级绑定到用户而非设备，支持多设备共享会员权益')
        ''')
        
        logger.info(f"[Storage] 数据表已初始化 (v1.2.1): {self.db_path}")
        conn.commit()
        conn.close()
    
    def _get_connection(self):
        """获取数据库连接"""
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.execute('PRAGMA journal_mode=WAL')
        return conn
    
    def save_record(self, text: str, metadata: Dict[str, Any], 
                   user_id: Optional[str] = None, device_id: Optional[str] = None) -> str:
        """创建新记录
        
        Args:
            text: 文本内容
            metadata: 元数据，必须包含 'app_type' 字段
            user_id: 用户ID（可选）
            device_id: 设备ID（可选）
        
        Returns:
            记录 ID (UUID)
        """
        import uuid
        import logging
        logger = logging.getLogger(__name__)
        
        record_id = str(uuid.uuid4())
        app_type = metadata.get('app_type', 'voice-note')
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # 如果 metadata 中包含 user_id 或 device_id，优先使用
        if 'user_id' in metadata and not user_id:
            user_id = metadata['user_id']
        if 'device_id' in metadata and not device_id:
            device_id = metadata['device_id']
        
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO records (
                id, text, metadata, app_type, user_id, device_id,
                is_deleted, deleted_at, is_starred, is_archived,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            record_id, text, json.dumps(metadata, ensure_ascii=False), app_type, user_id, device_id,
            0, None, 0, 0,  # is_deleted, deleted_at, is_starred, is_archived
            now, now  # created_at, updated_at
        ))
        conn.commit()
        conn.close()
        
        logger.debug(f"[Storage] 记录已创建: id={record_id}, app_type={app_type}, user_id={user_id}, device_id={device_id}")
        return record_id
    
    def update_record(self, record_id: str, text: str, metadata: Dict[str, Any],
                     user_id: Optional[str] = None, device_id: Optional[str] = None) -> bool:
        """更新已有记录
        
        Args:
            record_id: 记录 ID
            text: 更新的文本内容
            metadata: 更新的元数据
            user_id: 用户ID（可选，不传则不更新）
            device_id: 设备ID（可选，不传则不更新）
        
        Returns:
            更新是否成功
        """
        import logging
        logger = logging.getLogger(__name__)
        
        # 如果 metadata 中包含 user_id 或 device_id，优先使用
        if 'user_id' in metadata and not user_id:
            user_id = metadata['user_id']
        if 'device_id' in metadata and not device_id:
            device_id = metadata['device_id']
        
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # 构建更新语句
        update_fields = ['text = ?', 'metadata = ?', 'updated_at = ?']
        params = [text, json.dumps(metadata, ensure_ascii=False), now]
        
        if user_id:
            update_fields.append('user_id = ?')
            params.append(user_id)
        if device_id:
            update_fields.append('device_id = ?')
            params.append(device_id)
        
        params.append(record_id)
        query = f"UPDATE records SET {', '.join(update_fields)} WHERE id = ?"
        cursor.execute(query, params)
        
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        
        logger.debug(f"[Storage] 记录已更新: id={record_id}, success={success}")
        return success
    
    def get_record(self, record_id: str) -> Optional[Dict[str, Any]]:
        """获取单条记录
        
        Args:
            record_id: 记录 ID
        
        Returns:
            记录数据字典，不存在则返回 None
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, text, metadata, app_type, user_id, device_id, created_at
            FROM records
            WHERE id = ?
        ''', (record_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                'id': row[0],
                'text': row[1],
                'metadata': json.loads(row[2]) if row[2] else {},
                'app_type': row[3] or 'voice-note',
                'user_id': row[4],
                'device_id': row[5],
                'created_at': row[6]
            }
        return None
    
    def list_records(self, limit: int = 100, offset: int = 0, app_type: Optional[str] = None,
                    user_id: Optional[str] = None, device_id: Optional[str] = None) -> list[Dict[str, Any]]:
        """查询记录列表
        
        Args:
            limit: 返回数量限制
            offset: 偏移量（用于分页）
            app_type: 应用类型筛选（可选）
            user_id: 用户ID筛选（可选）
            device_id: 设备ID筛选（可选）
        
        Returns:
            记录列表，按创建时间倒序
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # 构建查询条件
        conditions = []
        params = []
        
        if app_type:
            conditions.append('app_type = ?')
            params.append(app_type)
        
        if user_id:
            conditions.append('user_id = ?')
            params.append(user_id)
        
        if device_id:
            conditions.append('device_id = ?')
            params.append(device_id)
        
        where_clause = ' AND '.join(conditions) if conditions else '1=1'
        params.extend([limit, offset])
        
        cursor.execute(f'''
            SELECT id, text, metadata, app_type, user_id, device_id, created_at
            FROM records
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ''', params)
        
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {
                'id': row[0],
                'text': row[1],
                'metadata': json.loads(row[2]) if row[2] else {},
                'app_type': row[3] or 'voice-note',
                'user_id': row[4],
                'device_id': row[5],
                'created_at': row[6]
            }
            for row in rows
        ]
    
    def delete_record(self, record_id: str) -> bool:
        """删除单条记录（同步删除关联图片）
        
        Args:
            record_id: 记录 ID
        
        Returns:
            删除是否成功
        """
        import logging
        logger = logging.getLogger(__name__)
        
        # 1. 先获取记录，提取图片URL
        record = self.get_record(record_id)
        if not record:
            return False
        
        # 2. 提取并删除关联图片
        image_urls = self._extract_image_urls(record)
        deleted_images = self._delete_images(image_urls)
        if deleted_images:
            logger.info(f"[Storage] 删除记录 {record_id} 的关联图片: {deleted_images}")
        
        # 3. 删除数据库记录
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM records WHERE id = ?', (record_id,))
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        
        if success:
            logger.info(f"[Storage] 记录已删除: id={record_id}, 同时删除了 {len(deleted_images)} 个图片文件")
        
        return success
    
    def _extract_image_urls(self, record: Dict[str, Any]) -> List[str]:
        """从记录中提取所有图片URL
        
        Args:
            record: 记录数据（包含 text 和 metadata）
        
        Returns:
            图片URL列表（相对路径，如 'images/xxx.png'）
        """
        image_urls = []
        
        # 从 metadata.blocks 中提取图片
        metadata = record.get('metadata', {})
        if isinstance(metadata, dict):
            blocks = metadata.get('blocks', [])
            for block in blocks:
                if isinstance(block, dict) and block.get('type') == 'image':
                    image_url = block.get('imageUrl')
                    if image_url:
                        image_urls.append(image_url)
        
        # 从 text 字段提取图片占位符（降级方案）
        text = record.get('text', '')
        if text:
            # 匹配 [IMAGE: images/xxx.png] 格式
            pattern = r'\[IMAGE:\s*([^\]]+)\]'
            matches = re.findall(pattern, text)
            for match in matches:
                if match not in image_urls:
                    image_urls.append(match)
        
        return image_urls
    
    def _delete_images(self, image_urls: List[str]) -> List[str]:
        """删除图片文件
        
        Args:
            image_urls: 图片URL列表（相对路径，如 'images/xxx.png'）
        
        Returns:
            成功删除的图片URL列表
        """
        import logging
        logger = logging.getLogger(__name__)
        
        deleted = []
        for url in image_urls:
            try:
                # 处理相对路径
                if url.startswith('images/'):
                    filename = url.replace('images/', '')
                else:
                    filename = url
                
                image_path = self.images_dir / filename
                if image_path.exists() and image_path.is_file():
                    image_path.unlink()
                    deleted.append(url)
                    logger.debug(f"[Storage] 已删除图片文件: {url}")
                else:
                    logger.debug(f"[Storage] 图片文件不存在，跳过: {url}")
            except Exception as e:
                logger.warning(f"[Storage] 删除图片文件失败: {url}, 错误: {e}")
        
        return deleted
    
    def count_records(self, app_type: Optional[str] = None, 
                     user_id: Optional[str] = None, device_id: Optional[str] = None) -> int:
        """统计记录总数
        
        Args:
            app_type: 应用类型筛选（可选）
            user_id: 用户ID筛选（可选）
            device_id: 设备ID筛选（可选）
        
        Returns:
            记录总数
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # 构建查询条件
        conditions = []
        params = []
        
        if app_type:
            conditions.append('app_type = ?')
            params.append(app_type)
        
        if user_id:
            conditions.append('user_id = ?')
            params.append(user_id)
        
        if device_id:
            conditions.append('device_id = ?')
            params.append(device_id)
        
        where_clause = ' AND '.join(conditions) if conditions else '1=1'
        
        cursor.execute(f'SELECT COUNT(*) FROM records WHERE {where_clause}', params)
        count = cursor.fetchone()[0]
        conn.close()
        
        return count
    
    def delete_records(self, record_ids: list[str]) -> int:
        """批量删除记录（同步删除关联图片）
        
        Args:
            record_ids: 记录 ID 列表
        
        Returns:
            成功删除的记录数
        """
        import logging
        logger = logging.getLogger(__name__)
        
        if not record_ids:
            return 0
        
        # 1. 先获取所有记录，提取图片URL
        all_image_urls = []
        for record_id in record_ids:
            record = self.get_record(record_id)
            if record:
                image_urls = self._extract_image_urls(record)
                all_image_urls.extend(image_urls)
        
        # 2. 删除所有关联图片
        deleted_images = self._delete_images(all_image_urls)
        if deleted_images:
            logger.info(f"[Storage] 批量删除 {len(record_ids)} 条记录的关联图片: {len(deleted_images)} 个")
        
        # 3. 批量删除数据库记录
        conn = self._get_connection()
        cursor = conn.cursor()
        placeholders = ','.join(['?'] * len(record_ids))
        cursor.execute(f'DELETE FROM records WHERE id IN ({placeholders})', record_ids)
        deleted_count = cursor.rowcount
        conn.commit()
        conn.close()
        
        logger.info(f"[Storage] 批量删除完成: 删除了 {deleted_count} 条记录和 {len(deleted_images)} 个图片文件")
        
        return deleted_count
