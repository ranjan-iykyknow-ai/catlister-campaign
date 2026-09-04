"""Optional shared-password protection for the publicly deployed demo."""

import hashlib
import hmac
import os

from fastapi import APIRouter, Request, Response

from app.errors import AppError
from app.v1.campaigns.model import LoginRequest

SESSION_COOKIE = "campaign_session"
router = APIRouter()


def app_password() -> str | None:
    return os.getenv("APP_PASSWORD")


def session_token() -> str:
    password = app_password()
    secret = os.getenv("SESSION_SECRET")
    if not password or not secret:
        return ""
    return hmac.new(secret.encode(), f"campaign-dispatch:{password}".encode(), hashlib.sha256).hexdigest()


def valid_session(value: str | None) -> bool:
    expected = session_token()
    return not app_password() or bool(value and expected and hmac.compare_digest(value, expected))


@router.get("/session")
def session_status(request: Request):
    return {
        "required": bool(app_password()),
        "authenticated": valid_session(request.cookies.get(SESSION_COOKIE)),
    }


@router.post("/session")
def login(payload: LoginRequest, response: Response):
    expected = app_password()
    if expected and not hmac.compare_digest(payload.password, expected):
        raise AppError(401, "invalid_password", "That demo password is incorrect.")
    if expected and not os.getenv("SESSION_SECRET"):
        raise AppError(503, "auth_configuration", "SESSION_SECRET is not configured on the server.")
    response.set_cookie(
        SESSION_COOKIE,
        session_token(),
        httponly=True,
        secure=bool(os.getenv("RAILWAY_ENVIRONMENT")),
        samesite="strict",
        max_age=60 * 60 * 12,
    )
    return {"required": bool(expected), "authenticated": True}


@router.delete("/session")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, samesite="strict")
    return {"required": bool(app_password()), "authenticated": False}
