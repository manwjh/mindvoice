"""
SQLite 存储扩展功能

提供软删除、收藏、归档、全文搜索等高级功能
"""

import sqlite3
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path


class SQLiteExtended:
    """SQLite 扩展功能类（Mixin）"""
    
    def soft_delete_record(self, record_id: str) -> bool:
        """软删除记录
        
        Args:
            record_id: 记录ID
        
        Returns:
            是否删除成功
        """
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                UPDATE records
                SET is_deleted = 1, deleted_at = ?, updated_at = ?
                WHERE id = ? AND is_deleted = 0
            ''', (now, now, record_id))
            
            success = cursor.rowcount > 0
            conn.commit()
            return success
        finally:
            conn.close()
    
    def restore_record(self, record_id: str) -> bool:
        """恢复已删除的记录
        
        Args:
            record_id: 记录ID
        
        Returns:
            是否恢复成功
        """
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                UPDATE records
                SET is_deleted = 0, deleted_at = NULL, updated_at = ?
                WHERE id = ? AND is_deleted = 1
            ''', (now, record_id))
            
            success = cursor.rowcount > 0
            conn.commit()
            return success
        finally:
            conn.close()
    
    def toggle_starred(self, record_id: str) -> bool:
        """切换记录收藏状态
        
        Args:
            record_id: 记录ID
        
        Returns:
            新的收藏状态（True=已收藏，False=未收藏）
        """
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # 获取当前状态
            cursor.execute('SELECT is_starred FROM records WHERE id = ?', (record_id,))
            row = cursor.fetchone()
            if not row:
                return False
            
            new_state = 0 if row[0] else 1
            
            cursor.execute('''
                UPDATE records
                SET is_starred = ?, updated_at = ?
                WHERE id = ?
            ''', (new_state, now, record_id))
            
            conn.commit()
            return bool(new_state)
        finally:
            conn.close()
    
    def toggle_archived(self, record_id: str) -> bool:
        """切换记录归档状态
        
        Args:
            record_id: 记录ID
        
        Returns:
            新的归档状态（True=已归档，False=未归档）
        """
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # 获取当前状态
            cursor.execute('SELECT is_archived FROM records WHERE id = ?', (record_id,))
            row = cursor.fetchone()
            if not row:
                return False
            
            new_state = 0 if row[0] else 1
            
            cursor.execute('''
                UPDATE records
                SET is_archived = ?, updated_at = ?
                WHERE id = ?
            ''', (new_state, now, record_id))
            
            conn.commit()
            return bool(new_state)
        finally:
            conn.close()
    
    def search_records(self, query: str, user_id: Optional[str] = None,
                       app_type: Optional[str] = None,
                       limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """全文搜索记录（使用FTS5）
        
        Args:
            query: 搜索关键词
            user_id: 用户ID筛选（可选）
            app_type: 应用类型筛选（可选）
            limit: 返回数量限制
            offset: 偏移量（用于分页）
        
        Returns:
            记录列表（按相关性排序）
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # 构建查询条件
            where_conditions = ['r.is_deleted = 0']
            params = [query]
            
            if user_id:
                where_conditions.append('r.user_id = ?')
                params.append(user_id)
            
            if app_type:
                where_conditions.append('r.app_type = ?')
                params.append(app_type)
            
            where_clause = ' AND '.join(where_conditions)
            params.extend([limit, offset])
            
            # FTS5 搜索（使用 record_id 关联，因为 FTS 表是独立的）
            cursor.execute(f'''
                SELECT r.id, r.text, r.metadata, r.app_type, r.user_id, r.device_id,
                       r.is_starred, r.is_archived, r.created_at, r.updated_at,
                       f.rank
                FROM records r
                INNER JOIN records_fts f ON r.id = f.record_id
                WHERE records_fts MATCH ? AND {where_clause}
                ORDER BY f.rank
                LIMIT ? OFFSET ?
            ''', params)
            
            records = []
            for row in cursor.fetchall():
                records.append({
                    'id': row[0],
                    'text': row[1],
                    'metadata': json.loads(row[2]) if row[2] else {},
                    'app_type': row[3] or 'voice-note',
                    'user_id': row[4],
                    'device_id': row[5],
                    'is_starred': bool(row[6]),
                    'is_archived': bool(row[7]),
                    'created_at': row[8],
                    'updated_at': row[9],
                    'relevance': abs(row[10])  # rank 转为正数表示相关性
                })
            
            return records
        finally:
            conn.close()
    
    def get_starred_records(self, user_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """获取收藏的记录
        
        Args:
            user_id: 用户ID
            limit: 返回数量限制
            offset: 偏移量
        
        Returns:
            记录列表
        """
        return self.list_records(
            user_id=user_id,
            limit=limit,
            offset=offset,
            filters={'is_starred': 1, 'is_deleted': 0}
        )
    
    def get_archived_records(self, user_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """获取归档的记录
        
        Args:
            user_id: 用户ID
            limit: 返回数量限制
            offset: 偏移量
        
        Returns:
            记录列表
        """
        return self.list_records(
            user_id=user_id,
            limit=limit,
            offset=offset,
            filters={'is_archived': 1, 'is_deleted': 0}
        )
    
    def get_deleted_records(self, user_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """获取已删除的记录（回收站）
        
        Args:
            user_id: 用户ID
            limit: 返回数量限制
            offset: 偏移量
        
        Returns:
            记录列表
        """
        return self.list_records(
            user_id=user_id,
            limit=limit,
            offset=offset,
            filters={'is_deleted': 1}
        )
    
    def permanent_delete_old_records(self, days: int = 30) -> int:
        """永久删除超过指定天数的已删除记录
        
        Args:
            days: 天数（默认30天）
        
        Returns:
            删除的记录数
        """
        import logging
        logger = logging.getLogger(__name__)
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                DELETE FROM records
                WHERE is_deleted = 1
                AND deleted_at < datetime('now', '-' || ? || ' days')
            ''', (days,))
            
            count = cursor.rowcount
            conn.commit()
            
            logger.info(f"[Storage] 永久删除 {count} 条超过 {days} 天的已删除记录")
            return count
        finally:
            conn.close()


# 为了使用方便，添加 JSON 导入
import json

