"""
消费计量服务模块

功能：
- ASR消费记录
- LLM消费记录
- 月度汇总更新
- 消费历史查询
"""

import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from src.core.config import Config
from src.core.logger import get_logger

logger = get_logger("ConsumptionService")


class ConsumptionService:
    """消费计量服务"""
    
    def __init__(self, config: Config):
        """初始化消费服务
        
        Args:
            config: 配置对象
        """
        self.config = config
        
        # 获取数据库路径
        data_dir = Path(config.get('storage.data_dir')).expanduser()
        database_relative = Path(config.get('storage.database'))
        self.db_path = data_dir / database_relative
        
        logger.info(f"[消费服务] 初始化，数据库: {self.db_path}")
    
    def _get_connection(self) -> sqlite3.Connection:
        """获取数据库连接"""
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        # 启用WAL模式，支持并发读写
        conn.execute('PRAGMA journal_mode=WAL')
        return conn
    
    def record_asr_consumption(
        self,
        device_id: str,
        duration_ms: int,
        start_time: int,
        end_time: int,
        provider: str = 'volcano',
        language: str = 'zh-CN',
        session_id: Optional[str] = None
    ) -> str:
        """记录ASR消费
        
        Args:
            device_id: 设备ID
            duration_ms: 时长（毫秒）
            start_time: 开始时间（毫秒时间戳）
            end_time: 结束时间（毫秒时间戳）
            provider: ASR提供商
            language: 语言
            session_id: 会话ID
        
        Returns:
            消费记录ID
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            record_id = str(uuid.uuid4())
            now = datetime.now()
            year = now.year
            month = now.month
            timestamp = now.timestamp()
            created_at = now.strftime('%Y-%m-%d %H:%M:%S')
            
            # 构建详情JSON
            details = {
                'duration_ms': duration_ms,
                'start_time': start_time,
                'end_time': end_time,
                'provider': provider,
                'language': language
            }
            
            import json
            details_json = json.dumps(details, ensure_ascii=False)
            
            # 插入消费记录
            cursor.execute('''
                INSERT INTO consumption_records 
                (id, device_id, year, month, type, amount, unit, model_source, details, session_id, timestamp, created_at)
                VALUES (?, ?, ?, ?, 'asr', ?, 'ms', 'vendor', ?, ?, ?, ?)
            ''', (record_id, device_id, year, month, duration_ms, details_json, session_id, timestamp, created_at))
            
            # 更新月度汇总（使用同一个连接和游标）
            self._update_monthly_asr_with_cursor(cursor, device_id, year, month, duration_ms)
            
            conn.commit()
            
            logger.info(f"[消费服务] ASR消费已记录: {device_id}, {duration_ms}ms")
            
            return record_id
            
        except Exception as e:
            conn.rollback()
            logger.error(f"[消费服务] 记录ASR消费失败: {e}", exc_info=True)
            raise
        finally:
            conn.close()
    
    def check_asr_quota(self, device_id: str, required_ms: int) -> Dict[str, Any]:
        """检查ASR额度是否充足
        
        Args:
            device_id: 设备ID
            required_ms: 所需时长（毫秒）
        
        Returns:
            检查结果 {'has_quota': bool, 'used_ms': int, 'quota_ms': int, 'remaining_ms': int}
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            year = datetime.now().year
            month = datetime.now().month
            
            # 获取月度汇总
            cursor.execute('''
                SELECT asr_duration_ms FROM monthly_consumption
                WHERE device_id = ? AND year = ? AND month = ?
            ''', (device_id, year, month))
            
            row = cursor.fetchone()
            used_ms = row[0] if row else 0
            
            # 获取会员额度限制（需要从membership_service获取，这里先返回默认值）
            # TODO: 与membership_service集成获取实际额度
            quota_ms = 3_600_000  # 默认1小时（免费会员）
            
            remaining_ms = max(0, quota_ms - used_ms)
            has_quota = remaining_ms >= required_ms
            
            return {
                'has_quota': has_quota,
                'used_ms': used_ms,
                'quota_ms': quota_ms,
                'remaining_ms': remaining_ms
            }
        finally:
            conn.close()
    
    def record_llm_consumption(
        self,
        device_id: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        model: str,
        provider: str,
        model_source: str = 'vendor',
        request_id: Optional[str] = None
    ) -> str:
        """记录LLM消费
        
        Args:
            device_id: 设备ID
            prompt_tokens: 输入tokens
            completion_tokens: 输出tokens
            total_tokens: 总tokens
            model: 模型名称
            provider: LLM提供商
            model_source: 模型来源（'vendor'或'user'）
            request_id: 请求ID
        
        Returns:
            消费记录ID
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            record_id = str(uuid.uuid4())
            now = datetime.now()
            year = now.year
            month = now.month
            timestamp = now.timestamp()
            created_at = now.strftime('%Y-%m-%d %H:%M:%S')
            
            # 构建详情JSON
            details = {
                'prompt_tokens': prompt_tokens,
                'completion_tokens': completion_tokens,
                'total_tokens': total_tokens,
                'model': model,
                'provider': provider,
                'model_source': model_source
            }
            
            import json
            details_json = json.dumps(details, ensure_ascii=False)
            
            # 插入消费记录
            cursor.execute('''
                INSERT INTO consumption_records 
                (id, device_id, year, month, type, amount, unit, model_source, details, session_id, timestamp, created_at)
                VALUES (?, ?, ?, ?, 'llm', ?, 'tokens', ?, ?, ?, ?, ?)
            ''', (record_id, device_id, year, month, total_tokens, model_source, details_json, request_id, timestamp, created_at))
            
            # 仅厂商模型计入月度汇总
            if model_source == 'vendor':
                self._update_monthly_llm_with_cursor(cursor, device_id, year, month, prompt_tokens, completion_tokens, total_tokens)
            
            conn.commit()
            
            logger.info(f"[消费服务] LLM消费已记录: {device_id}, {total_tokens}tokens, source={model_source}")
            
            return record_id
            
        except Exception as e:
            conn.rollback()
            logger.error(f"[消费服务] 记录LLM消费失败: {e}", exc_info=True)
            raise
        finally:
            conn.close()
    
    def check_llm_quota(self, device_id: str, required_tokens: int) -> Dict[str, Any]:
        """检查LLM额度是否充足
        
        Args:
            device_id: 设备ID
            required_tokens: 所需tokens数
        
        Returns:
            检查结果 {'has_quota': bool, 'used_tokens': int, 'quota_tokens': int, 'remaining_tokens': int}
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            year = datetime.now().year
            month = datetime.now().month
            
            # 获取月度汇总
            cursor.execute('''
                SELECT llm_total_tokens FROM monthly_consumption
                WHERE device_id = ? AND year = ? AND month = ?
            ''', (device_id, year, month))
            
            row = cursor.fetchone()
            used_tokens = row[0] if row else 0
            
            # 获取会员额度限制（需要从membership_service获取，这里先返回默认值）
            # TODO: 与membership_service集成获取实际额度
            quota_tokens = 100_000  # 默认10万tokens（免费会员）
            
            remaining_tokens = max(0, quota_tokens - used_tokens)
            has_quota = remaining_tokens >= required_tokens
            
            return {
                'has_quota': has_quota,
                'used_tokens': used_tokens,
                'quota_tokens': quota_tokens,
                'remaining_tokens': remaining_tokens
            }
        finally:
            conn.close()
    
    def get_monthly_consumption(self, device_id: str, year: int, month: int) -> Dict[str, Any]:
        """获取指定月份的消费统计
        
        Args:
            device_id: 设备ID
            year: 年份
            month: 月份
        
        Returns:
            包含ASR和LLM消费统计的字典
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                SELECT asr_duration_ms, llm_prompt_tokens, llm_completion_tokens, llm_total_tokens,
                       record_count, created_at, updated_at
                FROM monthly_consumption
                WHERE device_id = ? AND year = ? AND month = ?
            ''', (device_id, year, month))
            
            row = cursor.fetchone()
            
            # 计算下次重置时间（下个月1日）
            from datetime import datetime
            if month == 12:
                next_year = year + 1
                next_month = 1
            else:
                next_year = year
                next_month = month + 1
            reset_at = f"{next_year}-{next_month:02d}-01T00:00:00"
            
            if row:
                return {
                    'device_id': device_id,
                    'year': year,
                    'month': month,
                    'asr_used_ms': row[0] or 0,  # 前端期望的字段名
                    'asr_duration_minutes': round((row[0] or 0) / 60000, 2),  # 转换为分钟
                    'llm_prompt_tokens': row[1] or 0,
                    'llm_completion_tokens': row[2] or 0,
                    'llm_used_tokens': row[3] or 0,  # 前端期望的字段名
                    'record_count': row[4] or 0,
                    'created_at': row[5],
                    'updated_at': row[6],
                    'reset_at': reset_at  # 额度重置时间
                }
            else:
                # 没有记录，返回0值
                return {
                    'device_id': device_id,
                    'year': year,
                    'month': month,
                    'asr_used_ms': 0,  # 前端期望的字段名
                    'asr_duration_minutes': 0.0,
                    'llm_prompt_tokens': 0,
                    'llm_completion_tokens': 0,
                    'llm_used_tokens': 0,  # 前端期望的字段名
                    'record_count': 0,
                    'created_at': None,
                    'updated_at': None,
                    'reset_at': reset_at  # 额度重置时间
                }
        finally:
            conn.close()
    
    def _update_monthly_asr(self, device_id: str, year: int, month: int, duration_ms: int) -> None:
        """更新月度ASR汇总"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # 检查是否已存在记录
            cursor.execute('''
                SELECT * FROM monthly_consumption
                WHERE device_id = ? AND year = ? AND month = ?
            ''', (device_id, year, month))
            
            row = cursor.fetchone()
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            if row:
                # 更新现有记录
                cursor.execute('''
                    UPDATE monthly_consumption
                    SET asr_duration_ms = asr_duration_ms + ?,
                        record_count = record_count + 1,
                        updated_at = ?
                    WHERE device_id = ? AND year = ? AND month = ?
                ''', (duration_ms, now, device_id, year, month))
            else:
                # 创建新记录
                cursor.execute('''
                    INSERT INTO monthly_consumption 
                    (device_id, year, month, asr_duration_ms, llm_total_tokens, record_count, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 0, 1, ?, ?)
                ''', (device_id, year, month, duration_ms, now, now))
            
            conn.commit()
        finally:
            conn.close()
    
    def _update_monthly_asr_with_cursor(self, cursor, device_id: str, year: int, month: int, duration_ms: int) -> None:
        """更新月度ASR汇总（使用传入的游标，避免创建新连接）"""
        # 检查是否已存在记录
        cursor.execute('''
            SELECT * FROM monthly_consumption
            WHERE device_id = ? AND year = ? AND month = ?
        ''', (device_id, year, month))
        
        row = cursor.fetchone()
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        if row:
            # 更新现有记录
            cursor.execute('''
                UPDATE monthly_consumption
                SET asr_duration_ms = asr_duration_ms + ?,
                    record_count = record_count + 1,
                    updated_at = ?
                WHERE device_id = ? AND year = ? AND month = ?
            ''', (duration_ms, now, device_id, year, month))
        else:
            # 创建新记录
            cursor.execute('''
                INSERT INTO monthly_consumption 
                (device_id, year, month, asr_duration_ms, llm_total_tokens, record_count, created_at, updated_at)
                VALUES (?, ?, ?, ?, 0, 1, ?, ?)
            ''', (device_id, year, month, duration_ms, now, now))
    
    def _update_monthly_llm(self, device_id: str, year: int, month: int, 
                           prompt_tokens: int, completion_tokens: int, total_tokens: int) -> None:
        """更新月度LLM汇总"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # 检查是否已存在记录
            cursor.execute('''
                SELECT * FROM monthly_consumption
                WHERE device_id = ? AND year = ? AND month = ?
            ''', (device_id, year, month))
            
            row = cursor.fetchone()
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            if row:
                # 更新现有记录
                cursor.execute('''
                    UPDATE monthly_consumption
                    SET llm_prompt_tokens = llm_prompt_tokens + ?,
                        llm_completion_tokens = llm_completion_tokens + ?,
                        llm_total_tokens = llm_total_tokens + ?,
                        record_count = record_count + 1,
                        updated_at = ?
                    WHERE device_id = ? AND year = ? AND month = ?
                ''', (prompt_tokens, completion_tokens, total_tokens, now, device_id, year, month))
            else:
                # 创建新记录
                cursor.execute('''
                    INSERT INTO monthly_consumption 
                    (device_id, year, month, asr_duration_ms, llm_prompt_tokens, llm_completion_tokens, llm_total_tokens, record_count, created_at, updated_at)
                    VALUES (?, ?, ?, 0, ?, ?, ?, 1, ?, ?)
                ''', (device_id, year, month, prompt_tokens, completion_tokens, total_tokens, now, now))
            
            conn.commit()
        finally:
            conn.close()
    
    def _update_monthly_llm_with_cursor(self, cursor, device_id: str, year: int, month: int, 
                           prompt_tokens: int, completion_tokens: int, total_tokens: int) -> None:
        """更新月度LLM汇总（使用传入的游标，避免创建新连接）"""
        # 检查是否已存在记录
        cursor.execute('''
            SELECT * FROM monthly_consumption
            WHERE device_id = ? AND year = ? AND month = ?
        ''', (device_id, year, month))
        
        row = cursor.fetchone()
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        if row:
            # 更新现有记录
            cursor.execute('''
                UPDATE monthly_consumption
                SET llm_prompt_tokens = llm_prompt_tokens + ?,
                    llm_completion_tokens = llm_completion_tokens + ?,
                    llm_total_tokens = llm_total_tokens + ?,
                    record_count = record_count + 1,
                    updated_at = ?
                WHERE device_id = ? AND year = ? AND month = ?
            ''', (prompt_tokens, completion_tokens, total_tokens, now, device_id, year, month))
        else:
            # 创建新记录
            cursor.execute('''
                INSERT INTO monthly_consumption 
                (device_id, year, month, asr_duration_ms, llm_prompt_tokens, llm_completion_tokens, llm_total_tokens, record_count, created_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?, ?, 1, ?, ?)
            ''', (device_id, year, month, prompt_tokens, completion_tokens, total_tokens, now, now))
    
    def get_consumption_history(
        self,
        device_id: str,
        year: int,
        month: Optional[int] = None,
        consumption_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """获取消费历史
        
        Args:
            device_id: 设备ID
            year: 年份
            month: 月份（可选）
            consumption_type: 消费类型（可选，'asr'或'llm'）
            limit: 限制条数
            offset: 偏移量
        
        Returns:
            消费记录列表
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # 构建查询
            query = '''
                SELECT * FROM consumption_records
                WHERE device_id = ? AND year = ?
            '''
            params = [device_id, year]
            
            if month is not None:
                query += ' AND month = ?'
                params.append(month)
            
            if consumption_type:
                query += ' AND type = ?'
                params.append(consumption_type)
            
            query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
            params.extend([limit, offset])
            
            cursor.execute(query, params)
            
            records = []
            for row in cursor.fetchall():
                import json
                details = json.loads(row['details']) if row['details'] else {}
                
                records.append({
                    'id': row['id'],
                    'type': row['type'],
                    'amount': row['amount'],
                    'unit': row['unit'],
                    'model_source': row['model_source'],
                    'details': details,
                    'timestamp': row['timestamp'],
                    'created_at': row['created_at']
                })
            
            return records
            
        finally:
            conn.close()

