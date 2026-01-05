"""
自动清理服务

功能：
- 定期清理旧日志文件（保留最近N天）
- 清理未被引用的孤儿图片文件
- 可配置清理间隔和保留天数
"""
import os
import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Set
import sqlite3
import json
import re

logger = logging.getLogger(__name__)


class CleanupService:
    """自动清理服务
    
    定期执行清理任务：
    1. 清理旧日志文件
    2. 清理孤儿图片文件
    """
    
    def __init__(self, config: dict):
        """初始化清理服务
        
        Args:
            config: 配置字典，包含：
                - cleanup.enabled: 是否启用自动清理
                - cleanup.interval_hours: 清理间隔（小时）
                - cleanup.log_retention_days: 日志保留天数
                - cleanup.orphan_images: 是否清理孤儿图片
                - storage.data_dir: 数据根目录
                - storage.database: 数据库路径
                - storage.images: 图片目录
                - logging.directory: 日志目录
        """
        self.config = config
        self.enabled = config.get('cleanup', {}).get('enabled', True)
        self.interval_hours = config.get('cleanup', {}).get('interval_hours', 24)
        self.log_retention_days = config.get('cleanup', {}).get('log_retention_days', 7)
        self.orphan_images_enabled = config.get('cleanup', {}).get('orphan_images', True)
        
        # 路径配置
        self.data_dir = Path(config.get('storage', {}).get('data_dir', '~/Library/Application Support/MindVoice')).expanduser()
        self.db_path = self.data_dir / config.get('storage', {}).get('database', 'database/history.db')
        self.images_dir = self.data_dir / config.get('storage', {}).get('images', 'images')
        self.logs_dir = Path(config.get('logging', {}).get('directory', 'logs'))
        
        # 运行状态
        self._running = False
        self._task: Optional[asyncio.Task] = None
        
        logger.info(f"[Cleanup] 清理服务已初始化 (间隔: {self.interval_hours}h, 日志保留: {self.log_retention_days}天)")
    
    async def start(self):
        """启动自动清理服务"""
        if not self.enabled:
            logger.info("[Cleanup] 自动清理服务已禁用")
            return
        
        if self._running:
            logger.warning("[Cleanup] 清理服务已在运行中")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._cleanup_loop())
        logger.info(f"[Cleanup] 自动清理服务已启动，每 {self.interval_hours} 小时执行一次")
    
    async def stop(self):
        """停止自动清理服务"""
        if not self._running:
            return
        
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("[Cleanup] 自动清理服务已停止")
    
    async def _cleanup_loop(self):
        """清理循环任务"""
        try:
            while self._running:
                # 执行清理
                await self.cleanup()
                
                # 等待下一次清理
                await asyncio.sleep(self.interval_hours * 3600)
        except asyncio.CancelledError:
            logger.info("[Cleanup] 清理循环已取消")
        except Exception as e:
            logger.error(f"[Cleanup] 清理循环异常: {e}", exc_info=True)
    
    async def cleanup(self):
        """执行一次完整的清理任务"""
        logger.info("[Cleanup] 开始执行清理任务...")
        
        try:
            # 1. 清理旧日志文件
            log_stats = await self._cleanup_old_logs()
            
            # 2. 清理孤儿图片
            if self.orphan_images_enabled:
                image_stats = await self._cleanup_orphan_images()
            else:
                image_stats = {'deleted': 0, 'size_freed': 0}
            
            logger.info(
                f"[Cleanup] 清理完成 - "
                f"日志: 删除 {log_stats['deleted']} 个文件 ({log_stats['size_freed']:.2f} MB), "
                f"图片: 删除 {image_stats['deleted']} 个文件 ({image_stats['size_freed']:.2f} MB)"
            )
            
            return {
                'success': True,
                'logs': log_stats,
                'images': image_stats
            }
        except Exception as e:
            logger.error(f"[Cleanup] 清理任务失败: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _cleanup_old_logs(self) -> dict:
        """清理旧日志文件
        
        Returns:
            {'deleted': int, 'size_freed': float}
        """
        if not self.logs_dir.exists():
            logger.debug(f"[Cleanup] 日志目录不存在: {self.logs_dir}")
            return {'deleted': 0, 'size_freed': 0}
        
        cutoff_date = datetime.now() - timedelta(days=self.log_retention_days)
        deleted_count = 0
        size_freed = 0
        
        try:
            for log_file in self.logs_dir.glob('*.log'):
                # 获取文件修改时间
                mtime = datetime.fromtimestamp(log_file.stat().st_mtime)
                
                if mtime < cutoff_date:
                    file_size = log_file.stat().st_size
                    log_file.unlink()
                    deleted_count += 1
                    size_freed += file_size
                    logger.debug(f"[Cleanup] 删除旧日志: {log_file.name} (修改于 {mtime.strftime('%Y-%m-%d')})")
            
            size_freed_mb = size_freed / (1024 * 1024)
            if deleted_count > 0:
                logger.info(f"[Cleanup] 清理旧日志: 删除 {deleted_count} 个文件，释放 {size_freed_mb:.2f} MB")
            
            return {'deleted': deleted_count, 'size_freed': size_freed_mb}
        except Exception as e:
            logger.error(f"[Cleanup] 清理日志文件失败: {e}", exc_info=True)
            return {'deleted': 0, 'size_freed': 0}
    
    async def _cleanup_orphan_images(self) -> dict:
        """清理孤儿图片文件（未被任何记录引用的图片）
        
        Returns:
            {'deleted': int, 'size_freed': float}
        """
        if not self.images_dir.exists():
            logger.debug(f"[Cleanup] 图片目录不存在: {self.images_dir}")
            return {'deleted': 0, 'size_freed': 0}
        
        try:
            # 1. 获取所有记录中引用的图片URL
            referenced_images = self._get_referenced_images()
            logger.debug(f"[Cleanup] 数据库中引用的图片数量: {len(referenced_images)}")
            
            # 2. 扫描图片目录
            deleted_count = 0
            size_freed = 0
            
            for image_file in self.images_dir.glob('*'):
                if not image_file.is_file():
                    continue
                
                # 构造相对路径（images/xxx.png）
                relative_path = f"images/{image_file.name}"
                
                # 检查是否被引用
                if relative_path not in referenced_images and image_file.name not in referenced_images:
                    file_size = image_file.stat().st_size
                    image_file.unlink()
                    deleted_count += 1
                    size_freed += file_size
                    logger.debug(f"[Cleanup] 删除孤儿图片: {image_file.name}")
            
            size_freed_mb = size_freed / (1024 * 1024)
            if deleted_count > 0:
                logger.info(f"[Cleanup] 清理孤儿图片: 删除 {deleted_count} 个文件，释放 {size_freed_mb:.2f} MB")
            
            return {'deleted': deleted_count, 'size_freed': size_freed_mb}
        except Exception as e:
            logger.error(f"[Cleanup] 清理孤儿图片失败: {e}", exc_info=True)
            return {'deleted': 0, 'size_freed': 0}
    
    def _get_referenced_images(self) -> Set[str]:
        """从数据库中获取所有被引用的图片URL
        
        Returns:
            图片URL集合（包含相对路径和文件名两种格式）
        """
        referenced = set()
        
        if not self.db_path.exists():
            logger.warning(f"[Cleanup] 数据库文件不存在: {self.db_path}")
            return referenced
        
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=30.0)
            conn.execute('PRAGMA journal_mode=WAL')
            cursor = conn.cursor()
            cursor.execute('SELECT text, metadata FROM records')
            rows = cursor.fetchall()
            conn.close()
            
            for text, metadata_json in rows:
                # 从 metadata.blocks 中提取图片
                if metadata_json:
                    try:
                        metadata = json.loads(metadata_json)
                        blocks = metadata.get('blocks', [])
                        for block in blocks:
                            if isinstance(block, dict) and block.get('type') == 'image':
                                image_url = block.get('imageUrl')
                                if image_url:
                                    referenced.add(image_url)
                                    # 同时添加文件名（不带路径）
                                    if '/' in image_url:
                                        referenced.add(image_url.split('/')[-1])
                    except json.JSONDecodeError:
                        pass
                
                # 从 text 字段提取图片占位符
                if text:
                    pattern = r'\[IMAGE:\s*([^\]]+)\]'
                    matches = re.findall(pattern, text)
                    for match in matches:
                        referenced.add(match.strip())
                        # 同时添加文件名
                        if '/' in match:
                            referenced.add(match.split('/')[-1])
            
            return referenced
        except Exception as e:
            logger.error(f"[Cleanup] 获取引用图片列表失败: {e}", exc_info=True)
            return referenced
    
    async def manual_cleanup(self, clean_logs: bool = True, clean_images: bool = True) -> dict:
        """手动触发清理任务
        
        Args:
            clean_logs: 是否清理日志
            clean_images: 是否清理图片
        
        Returns:
            清理结果字典
        """
        logger.info(f"[Cleanup] 手动触发清理 (日志: {clean_logs}, 图片: {clean_images})")
        
        result = {
            'success': True,
            'logs': {'deleted': 0, 'size_freed': 0},
            'images': {'deleted': 0, 'size_freed': 0}
        }
        
        try:
            if clean_logs:
                result['logs'] = await self._cleanup_old_logs()
            
            if clean_images:
                result['images'] = await self._cleanup_orphan_images()
            
            return result
        except Exception as e:
            logger.error(f"[Cleanup] 手动清理失败: {e}", exc_info=True)
            result['success'] = False
            result['error'] = str(e)
            return result

