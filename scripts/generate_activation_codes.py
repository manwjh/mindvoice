#!/usr/bin/env python3
"""
激活码批量生成工具

用法：
    python scripts/generate_activation_codes.py --tier vip --months 3 --count 100 --output codes.csv

参数：
    --tier: 会员等级 (free/vip/pro/pro_plus)
    --months: 订阅月数 (1-120)
    --count: 生成数量
    --output: 输出文件路径 (CSV格式)
"""

import argparse
import csv
import sys
from pathlib import Path
from datetime import datetime

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.services.activation_service import ActivationService
from src.core.config import Config
from src.core.logger import get_logger

logger = get_logger("ActivationCodeGenerator")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='批量生成激活码')
    parser.add_argument('--tier', required=True, choices=['free', 'vip', 'pro', 'pro_plus'],
                        help='会员等级')
    parser.add_argument('--months', type=int, required=True,
                        help='订阅月数 (1-120)')
    parser.add_argument('--count', type=int, required=True,
                        help='生成数量')
    parser.add_argument('--output', required=True,
                        help='输出文件路径 (CSV格式)')
    
    args = parser.parse_args()
    
    # 验证参数
    if not (1 <= args.months <= 120):
        logger.error(f"订阅月数必须在1-120之间: {args.months}")
        sys.exit(1)
    
    if args.count <= 0:
        logger.error(f"生成数量必须大于0: {args.count}")
        sys.exit(1)
    
    # 初始化服务
    config = Config()
    service = ActivationService(config)
    
    logger.info(f"[生成] 开始生成激活码...")
    logger.info(f"[生成] 等级: {args.tier}, 月数: {args.months}, 数量: {args.count}")
    
    # 生成激活码
    codes = []
    for i in range(args.count):
        code = service.generate_code(args.tier, args.months)
        codes.append(code)
        
        if (i + 1) % 100 == 0:
            logger.info(f"[生成] 进度: {i + 1}/{args.count}")
    
    # 写入CSV文件
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        
        # 写入表头
        writer.writerow(['激活码', '等级', '月数', '生成时间', '状态'])
        
        # 写入数据
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        for code in codes:
            writer.writerow([code, args.tier, args.months, timestamp, '未使用'])
    
    logger.info(f"[生成] ✅ 已生成 {args.count} 个激活码")
    logger.info(f"[生成] 📄 文件保存到: {output_path.absolute()}")
    
    # 打印示例
    logger.info(f"[生成] 示例激活码:")
    for i, code in enumerate(codes[:5]):
        logger.info(f"  {i + 1}. {code}")
    
    if len(codes) > 5:
        logger.info(f"  ... ({len(codes) - 5} more)")


if __name__ == '__main__':
    main()

