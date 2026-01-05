"""
激活码服务模块

功能：
- 激活码生成
- 激活码验证
- 黑名单管理
"""

import re
import json
import secrets
from pathlib import Path
from typing import Optional, Dict, Any
from src.core.config import Config
from src.core.logger import get_logger

logger = get_logger("ActivationService")


class ActivationService:
    """激活码服务"""
    
    # 激活码格式: TIER-MONTHS-XXXX-XXXX
    CODE_PATTERN = re.compile(r'^([A-Z]+)-(\d+)-([A-Z0-9]{4})-([A-Z0-9]{4})$')
    
    # 会员等级映射
    TIER_MAP = {
        'FREE': 'free',
        'VIP': 'vip',
        'PRO': 'pro',
        'PROPLUS': 'pro_plus'
    }
    
    TIER_REVERSE_MAP = {v: k for k, v in TIER_MAP.items()}
    
    def __init__(self, config: Config):
        """初始化激活码服务
        
        Args:
            config: 配置对象
        """
        self.config = config
        
        # 黑名单文件路径
        data_dir = Path(config.get('storage.data_dir')).expanduser()
        self.blacklist_path = data_dir / 'blacklist.json'
        
        # 加载黑名单
        self.blacklist = self._load_blacklist()
        
        logger.info(f"[激活码服务] 初始化完成，黑名单: {len(self.blacklist)} 条")
    
    def _load_blacklist(self) -> set:
        """加载黑名单"""
        if not self.blacklist_path.exists():
            return set()
        
        try:
            with open(self.blacklist_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return set(data.get('codes', []))
        except Exception as e:
            logger.error(f"[激活码服务] 加载黑名单失败: {e}")
            return set()
    
    def _save_blacklist(self) -> None:
        """保存黑名单"""
        try:
            # 确保目录存在
            self.blacklist_path.parent.mkdir(parents=True, exist_ok=True)
            
            data = {
                'codes': list(self.blacklist),
                'updated_at': int(self.config._get_timestamp())
            }
            
            with open(self.blacklist_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
        except Exception as e:
            logger.error(f"[激活码服务] 保存黑名单失败: {e}")
    
    def generate_code(self, tier: str, months: int) -> str:
        """生成激活码
        
        Args:
            tier: 会员等级（free/vip/pro/pro_plus）
            months: 订阅月数
        
        Returns:
            激活码字符串
        """
        # 会员等级代码
        tier_code = self.TIER_REVERSE_MAP.get(tier)
        if not tier_code:
            raise ValueError(f"无效的会员等级: {tier}")
        
        # 验证月数
        if not (1 <= months <= 120):
            raise ValueError(f"无效的订阅月数: {months}，必须在1-120之间")
        
        # 生成8位随机校验码（大写字母+数字）
        chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        checksum = ''.join(secrets.choice(chars) for _ in range(8))
        
        # 组装激活码: TIER-MONTHS-XXXX-XXXX
        code = f"{tier_code}-{months}-{checksum[:4]}-{checksum[4:]}"
        
        logger.info(f"[激活码服务] 生成激活码: {code}")
        
        return code
    
    def validate_code(self, code: str) -> Dict[str, Any]:
        """验证激活码
        
        Args:
            code: 激活码
        
        Returns:
            验证结果字典
            {
                'valid': bool,
                'tier': str,
                'months': int,
                'error': str
            }
        """
        # 格式验证
        if not self.CODE_PATTERN.match(code):
            return {
                'valid': False,
                'error': '激活码格式不正确，正确格式: TIER-MONTHS-XXXX-XXXX'
            }
        
        # 解析内容
        match = self.CODE_PATTERN.match(code)
        tier_code, months_str, _, _ = match.groups()
        
        # 验证会员等级
        tier = self.TIER_MAP.get(tier_code)
        if not tier:
            return {
                'valid': False,
                'error': f'无效的会员等级: {tier_code}'
            }
        
        # 验证月数
        try:
            months = int(months_str)
            if not (1 <= months <= 120):
                return {
                    'valid': False,
                    'error': f'无效的订阅周期: {months}个月'
                }
        except ValueError:
            return {
                'valid': False,
                'error': '订阅周期必须是数字'
            }
        
        # 检查黑名单
        if code in self.blacklist:
            return {
                'valid': False,
                'error': '激活码已被使用或已失效'
            }
        
        # 验证通过
        return {
            'valid': True,
            'tier': tier,
            'months': months
        }
    
    def mark_as_used(self, code: str) -> None:
        """标记激活码为已使用
        
        Args:
            code: 激活码
        """
        self.blacklist.add(code)
        self._save_blacklist()
        logger.info(f"[激活码服务] 激活码已标记为已使用: {code}")
    
    def is_code_used(self, code: str) -> bool:
        """检查激活码是否已使用
        
        Args:
            code: 激活码
        
        Returns:
            是否已使用
        """
        return code in self.blacklist


def generate_activation_codes(tier: str, months: int, count: int) -> list[str]:
    """批量生成激活码（工具函数）
    
    Args:
        tier: 会员等级
        months: 订阅月数
        count: 生成数量
    
    Returns:
        激活码列表
    """
    from src.core.config import Config
    
    config = Config()
    service = ActivationService(config)
    
    codes = []
    for _ in range(count):
        code = service.generate_code(tier, months)
        codes.append(code)
    
    return codes

