"""
会员体系API接口

提供设备管理、会员信息、消费统计、激活码等相关接口
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
        logger.info("[会员API] 服务初始化完成")
    except Exception as e:
        logger.error(f"[会员API] 服务初始化失败: {e}", exc_info=True)
        raise


# ==================== 请求/响应模型 ====================

class DeviceRegisterRequest(BaseModel):
    """设备注册请求"""
    device_id: str = Field(..., description="设备ID")
    machine_id: str = Field(..., description="机器ID")
    platform: str = Field(..., description="平台(darwin/win32/linux)")


class MembershipInfoResponse(BaseModel):
    """会员信息响应"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ActivateRequest(BaseModel):
    """激活请求"""
    device_id: str = Field(..., description="设备ID")
    activation_code: str = Field(..., description="激活码")


class ActivateResponse(BaseModel):
    """激活响应"""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class QuotaCheckRequest(BaseModel):
    """额度检查请求"""
    device_id: str = Field(..., description="设备ID")
    type: str = Field(..., description="消费类型(asr/llm)")
    estimated_amount: int = Field(..., description="预估消费量")
    model_source: Optional[str] = Field(default='vendor', description="模型来源(vendor/user)")


class ConsumptionHistoryRequest(BaseModel):
    """消费历史查询请求"""
    device_id: str = Field(..., description="设备ID")
    year: int = Field(..., description="年份")
    month: Optional[int] = Field(default=None, description="月份")
    type: Optional[str] = Field(default=None, description="消费类型")
    limit: int = Field(default=100, description="限制条数")
    offset: int = Field(default=0, description="偏移量")


# ==================== API端点 ====================

@router.post("/device/register")
async def register_device(request: DeviceRegisterRequest):
    """注册设备并自动开通免费会员"""
    if not membership_service:
        raise HTTPException(status_code=503, detail="会员服务未初始化")
    
    try:
        result = membership_service.register_device(
            device_id=request.device_id,
            machine_id=request.machine_id,
            platform=request.platform
        )
        
        return {
            "success": True,
            "data": result,
            "message": "欢迎使用MindVoice！已自动开通免费永久权限" if result['is_new'] else "欢迎回来！"
        }
    except Exception as e:
        logger.error(f"[API] 注册设备失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/device/{device_id}/info")
async def get_device_info(device_id: str):
    """获取设备信息"""
    if not membership_service:
        raise HTTPException(status_code=503, detail="会员服务未初始化")
    
    try:
        # 这里可以添加获取设备详细信息的逻辑
        return {
            "success": True,
            "device_id": device_id
        }
    except Exception as e:
        logger.error(f"[API] 获取设备信息失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/membership/{device_id}", response_model=MembershipInfoResponse)
async def get_membership(device_id: str):
    """获取会员信息"""
    if not membership_service:
        raise HTTPException(status_code=503, detail="会员服务未初始化")
    
    try:
        membership = membership_service.get_membership(device_id)
        
        if not membership:
            return MembershipInfoResponse(
                success=False,
                error="会员信息不存在"
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


@router.post("/membership/activate", response_model=ActivateResponse)
async def activate_membership(request: ActivateRequest):
    """激活会员"""
    if not membership_service or not activation_service:
        raise HTTPException(status_code=503, detail="会员服务未初始化")
    
    try:
        # 1. 验证激活码
        validation = activation_service.validate_code(request.activation_code)
        
        if not validation['valid']:
            return ActivateResponse(
                success=False,
                message=validation['error'],
                error=validation['error']
            )
        
        # 2. 激活会员
        membership = membership_service.activate_membership(
            device_id=request.device_id,
            tier=validation['tier'],
            months=validation['months']
        )
        
        # 3. 标记激活码为已使用
        activation_service.mark_as_used(request.activation_code)
        
        # 4. 返回结果
        tier_name = membership_service.get_tier_name(validation['tier'])
        message = f"✅ 激活成功！{tier_name}，有效期{validation['months']}个月"
        
        return ActivateResponse(
            success=True,
            message=message,
            data=membership
        )
        
    except Exception as e:
        logger.error(f"[API] 激活会员失败: {e}", exc_info=True)
        return ActivateResponse(
            success=False,
            message=f"激活失败: {str(e)}",
            error=str(e)
        )


@router.post("/quota/check")
async def check_quota(request: QuotaCheckRequest):
    """检查额度是否充足"""
    if not membership_service:
        raise HTTPException(status_code=503, detail="会员服务未初始化")
    
    try:
        result = membership_service.check_quota(
            device_id=request.device_id,
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


@router.get("/consumption/{device_id}/current")
async def get_current_consumption(device_id: str):
    """获取当前月度消费"""
    if not membership_service:
        raise HTTPException(status_code=503, detail="会员服务未初始化")
    
    try:
        consumption = membership_service.get_current_consumption(device_id)
        
        return {
            "success": True,
            "data": consumption
        }
    except Exception as e:
        logger.error(f"[API] 获取当前消费失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/consumption/history")
async def get_consumption_history(request: ConsumptionHistoryRequest):
    """获取消费历史"""
    if not consumption_service:
        raise HTTPException(status_code=503, detail="消费服务未初始化")
    
    try:
        records = consumption_service.get_consumption_history(
            device_id=request.device_id,
            year=request.year,
            month=request.month,
            consumption_type=request.type,
            limit=request.limit,
            offset=request.offset
        )
        
        return {
            "success": True,
            "data": {
                "records": records,
                "total": len(records),
                "year": request.year,
                "month": request.month
            }
        }
    except Exception as e:
        logger.error(f"[API] 获取消费历史失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/activation/validate")
async def validate_activation_code(code: str):
    """验证激活码（不激活，仅验证）"""
    if not activation_service:
        raise HTTPException(status_code=503, detail="激活服务未初始化")
    
    try:
        result = activation_service.validate_code(code)
        
        return {
            "success": True,
            "data": result
        }
    except Exception as e:
        logger.error(f"[API] 验证激活码失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

