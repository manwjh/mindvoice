"""
会员体系API接口 (v1.2.1 重构版)

核心变化：
- 所有会员相关接口使用 user_id 而不是 device_id
- 支持多设备共享会员权益

提供会员信息、消费统计、激活码等相关接口
"""

from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from src.services.membership_service import MembershipService
from src.services.activation_service import ActivationService
from src.services.consumption_service import ConsumptionService
from src.core.config import Config
from src.core.logger import get_logger

logger = get_logger("MembershipAPI")

# 创建API路由器
router = APIRouter(prefix="/api", tags=["会员体系"])

# 全局服务实例（由主应用初始化）
membership_service: Optional[MembershipService] = None
activation_service: Optional[ActivationService] = None
consumption_service: Optional[ConsumptionService] = None


def init_membership_services(config: Config):
    """初始化会员服务（由主应用调用）"""
    global membership_service, activation_service, consumption_service
    
    try:
        membership_service = MembershipService(config)
        activation_service = ActivationService(config)
        consumption_service = ConsumptionService(config)
        logger.info("[会员API] 服务初始化完成 (v1.2.1)")
    except Exception as e:
        logger.error(f"[会员API] 服务初始化失败: {e}", exc_info=True)
        raise


# ==================== 请求/响应模型 ====================

class MembershipInfoResponse(BaseModel):
    """会员信息响应"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ActivateRequest(BaseModel):
    """激活请求"""
    user_id: str = Field(..., description="用户ID")
    activation_code: str = Field(..., description="激活码")


class ActivateResponse(BaseModel):
    """激活响应"""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ValidateCodeRequest(BaseModel):
    """验证激活码请求"""
    user_id: str = Field(..., description="用户ID")
    activation_code: str = Field(..., description="激活码")


class ValidateCodeResponse(BaseModel):
    """验证激活码响应"""
    success: bool
    message: str
    is_valid: bool = False
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class QuotaCheckRequest(BaseModel):
    """额度检查请求"""
    user_id: str = Field(..., description="用户ID")
    type: str = Field(..., description="消费类型(asr/llm)")
    estimated_amount: int = Field(..., description="预估消费量")
    model_source: Optional[str] = Field(default='vendor', description="模型来源(vendor/user)")


class ConsumptionHistoryRequest(BaseModel):
    """消费历史查询请求"""
    user_id: str = Field(..., description="用户ID")
    device_id: Optional[str] = Field(default=None, description="设备ID（可选）")
    year: int = Field(..., description="年份")
    month: Optional[int] = Field(default=None, description="月份")
    type: Optional[str] = Field(default=None, description="消费类型")
    limit: int = Field(default=100, description="限制条数")
    offset: int = Field(default=0, description="偏移量")


# ==================== API端点 ====================

@router.get("/membership/{user_id}", response_model=MembershipInfoResponse)
async def get_membership(user_id: str):
    """获取用户会员信息"""
    if not membership_service:
        raise HTTPException(status_code=503, detail="会员服务未初始化")
    
    try:
        membership = membership_service.get_membership(user_id)
        
        if not membership:
            return MembershipInfoResponse(
                success=False,
                error="会员信息不存在，请先完成用户注册"
            )
        
        return MembershipInfoResponse(
            success=True,
            data=membership
        )
    except Exception as e:
        logger.error(f"[API] 获取会员信息失败: {e}", exc_info=True)
        return MembershipInfoResponse(
            success=False,
            error=str(e)
        )


@router.get("/membership/{user_id}/quota")
async def get_quota(user_id: str, device_id: Optional[str] = None):
    """获取用户额度信息（可选指定设备查看设备消费明细）"""
    if not membership_service:
        raise HTTPException(status_code=503, detail="会员服务未初始化")
    
    try:
        consumption = membership_service.get_current_consumption(user_id, device_id)
        
        return {
            "success": True,
            "data": consumption
        }
    except Exception as e:
        logger.error(f"[API] 获取额度信息失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/membership/check-quota")
async def check_quota(request: QuotaCheckRequest):
    """检查用户额度是否充足"""
    if not membership_service:
        raise HTTPException(status_code=503, detail="会员服务未初始化")
    
    try:
        result = membership_service.check_quota(
            user_id=request.user_id,
            consumption_type=request.type,
            estimated_amount=request.estimated_amount,
            model_source=request.model_source
        )
        
        return {
            "success": True,
            "data": result
        }
    except Exception as e:
        logger.error(f"[API] 检查额度失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/membership/validate-code", response_model=ValidateCodeResponse)
async def validate_activation_code(request: ValidateCodeRequest):
    """验证激活码（功能未实现）"""
    logger.info(f"[API] 激活码验证请求（功能未实现） user_id={request.user_id}")
    
    return ValidateCodeResponse(
        success=True,
        is_valid=False,
        message="激活码功能暂未实现",
        error="FEATURE_NOT_AVAILABLE"
    )


@router.post("/membership/activate", response_model=ActivateResponse)
async def activate_membership(request: ActivateRequest):
    """激活会员（功能未实现）"""
    logger.info(f"[API] 激活请求（功能未实现） user_id={request.user_id}")
    
    return ActivateResponse(
        success=False,
        message="激活码功能暂未实现",
        error="FEATURE_NOT_AVAILABLE"
    )


@router.get("/consumption/{user_id}/history")
async def get_consumption_history(
    user_id: str,
    device_id: Optional[str] = None,
    consumption_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """获取用户消费历史记录"""
    if not consumption_service:
        raise HTTPException(status_code=503, detail="消费服务未初始化")
    
    try:
        records = consumption_service.get_consumption_records(
            user_id=user_id,
            device_id=device_id,
            consumption_type=consumption_type,
            limit=limit,
            offset=offset
        )
        
        return {
            "success": True,
            "data": {
                "records": records,
                "count": len(records),
                "limit": limit,
                "offset": offset
            }
        }
    except Exception as e:
        logger.error(f"[API] 获取消费历史失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/consumption/{user_id}/monthly")
async def get_monthly_consumption(
    user_id: str,
    device_id: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None
):
    """获取用户月度消费汇总"""
    if not consumption_service:
        raise HTTPException(status_code=503, detail="消费服务未初始化")
    
    try:
        monthly_data = consumption_service.get_monthly_consumption(
            user_id=user_id,
            device_id=device_id,
            year=year,
            month=month
        )
        
        return {
            "success": True,
            "data": monthly_data
        }
    except Exception as e:
        logger.error(f"[API] 获取月度消费失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
