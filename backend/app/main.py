from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import api_router
from app.auth import SESSION_COOKIE, app_password, valid_session
from app.db import initialize_database
from app.errors import AppError, error_content
from app.v1.campaigns.service import campaign_service


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    initialize_database()
    campaign_service.reconcile_interrupted()
    yield


app = FastAPI(title="Campaign Dispatch Interview API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)


@app.middleware("http")
async def protect_demo_api(request: Request, call_next):
    path = request.url.path
    is_auth_route = path == "/v1/auth/session"
    if (
        app_password()
        and path.startswith("/v1/")
        and not is_auth_route
        and not valid_session(request.cookies.get(SESSION_COOKIE))
    ):
        return JSONResponse(
            status_code=401,
            content=error_content("authentication_required", "Sign in to use this demo."),
        )
    if path.startswith("/v1/") and request.method not in {"GET", "HEAD", "OPTIONS"} and not is_auth_route:
        origin = request.headers.get("origin")
        allowed_hosts = {request.headers.get("host"), "localhost:5173", "127.0.0.1:5173"}
        if origin and urlsplit(origin).netloc not in allowed_hosts:
            return JSONResponse(
                status_code=403,
                content=error_content("origin_rejected", "Cross-origin changes are blocked."),
            )
    return await call_next(request)


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, error: AppError) -> JSONResponse:
    return JSONResponse(status_code=error.status, content=error_content(error.code, error.message, error.details))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, error: RequestValidationError) -> JSONResponse:
    details = [
        {"field": ".".join(map(str, item["loc"])), "message": item["msg"]}
        for item in error.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=error_content("validation", "Check the supplied fields.", details),
    )


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
