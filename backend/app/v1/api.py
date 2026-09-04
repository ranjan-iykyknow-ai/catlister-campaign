from fastapi import APIRouter

from app.auth import router as auth_router
from app.v1.campaigns.controller import router as campaigns_router
from app.v1.campaigns.controller import templates_router

v1_api_router = APIRouter()
v1_api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
v1_api_router.include_router(campaigns_router, prefix="/campaigns", tags=["Campaigns"])
v1_api_router.include_router(templates_router, prefix="/templates", tags=["Templates"])
