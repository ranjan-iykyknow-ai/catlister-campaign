from fastapi import APIRouter

from app.v1.api import v1_api_router

api_router = APIRouter()


@api_router.get("/healthcheck", include_in_schema=False)
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


api_router.include_router(v1_api_router, prefix="/v1")
