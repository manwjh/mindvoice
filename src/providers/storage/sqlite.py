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
        """初始化数据表结构"""
        import logging
        logger = logging.getLogger(__name__)
        
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.execute('PRAGMA journal_mode=WAL')
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                metadata TEXT,
                app_type TEXT NOT NULL DEFAULT 'voice-note',
                created_at TIMESTAMP NOT NULL
            )
        ''')
        
        logger.info(f"[Storage] 数据表已初始化: {self.db_path}")
        conn.commit()
        conn.close()
    
    def _get_connection(self):
        """获取数据库连接"""
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.execute('PRAGMA journal_mode=WAL')
        return conn
    
    def save_record(self, text: str, metadata: Dict[str, Any]) -> str:
        """创建新记录
        
        Args:
            text: 文本内容
            metadata: 元数据，必须包含 'app_type' 字段
        
        Returns:
            记录 ID (UUID)
        """
        import uuid
        import logging
        logger = logging.getLogger(__name__)
        
        record_id = str(uuid.uuid4())
        app_type = metadata.get('app_type', 'voice-note')
        created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO records (id, text, metadata, app_type, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (record_id, text, json.dumps(metadata, ensure_ascii=False), app_type, created_at))
        conn.commit()
        conn.close()
        
        logger.debug(f"[Storage] 记录已创建: id={record_id}, app_type={app_type}")
        return record_id
    
    def update_record(self, record_id: str, text: str, metadata: Dict[str, Any]) -> bool:
        """更新已有记录
        
        Args:
            record_id: 记录 ID
            text: 更新的文本内容
            metadata: 更新的元数据
        
        Returns:
            更新是否成功
        """
        import logging
        logger = logging.getLogger(__name__)
        
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE records
            SET text = ?, metadata = ?
            WHERE id = ?
        ''', (text, json.dumps(metadata, ensure_ascii=False), record_id))
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
            SELECT id, text, metadata, app_type, created_at
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
                'created_at': row[4]
            }
        return None
    
    def list_records(self, limit: int = 100, offset: int = 0, app_type: Optional[str] = None) -> list[Dict[str, Any]]:
        """查询记录列表
        
        Args:
            limit: 返回数量限制
            offset: 偏移量（用于分页）
            app_type: 应用类型筛选（可选）
        
        Returns:
            记录列表，按创建时间倒序
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if app_type:
            cursor.execute('''
                SELECT id, text, metadata, app_type, created_at
                FROM records
                WHERE app_type = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            ''', (app_type, limit, offset))
        else:
            cursor.execute('''
                SELECT id, text, metadata, app_type, created_at
                FROM records
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            ''', (limit, offset))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {
                'id': row[0],
                'text': row[1],
                'metadata': json.loads(row[2]) if row[2] else {},
                'app_type': row[3] or 'voice-note',
                'created_at': row[4]
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
    
    def count_records(self, app_type: Optional[str] = None) -> int:
        """统计记录总数
        
        Args:
            app_type: 应用类型筛选（可选）
        
        Returns:
            记录总数
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if app_type:
            cursor.execute('SELECT COUNT(*) FROM records WHERE app_type = ?', (app_type,))
        else:
            cursor.execute('SELECT COUNT(*) FROM records')
        
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
