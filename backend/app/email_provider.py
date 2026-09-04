"""Email-provider configuration and the small Resend HTTP adapter."""

import asyncio
import os
from dataclasses import dataclass
from email.utils import parseaddr

import httpx
from pydantic import TypeAdapter

from app.errors import AppError
from app.v1.campaigns.model import ContactCreate
from app.v1.campaigns.sender import CampaignSendError

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM_ADDRESS = "Campaign Dispatcher <onboarding@resend.dev>"


class UnknownSubmission(Exception):
    """The request may have reached Resend, so automatically retrying is unsafe."""


@dataclass(frozen=True)
class ProviderSettings:
    provider: str
    from_address: str | None
    rate: float
    api_key: str | None = None
    demo_recipient: str | None = None


def provider_name() -> str:
    configured = os.getenv("EMAIL_PROVIDER")
    if configured:
        return configured.strip().lower()
    return "resend" if os.getenv("RESEND_API_KEY") else "fake"


def provider_settings(*, validate: bool = True) -> ProviderSettings:
    provider = provider_name()
    if provider not in {"fake", "resend"}:
        raise AppError(503, "sender_configuration", "EMAIL_PROVIDER must be fake or resend.")
    try:
        rate = float(os.getenv("SEND_RATE_PER_SECOND", "1"))
        if not 0 < rate <= 5:
            raise ValueError
    except ValueError:
        raise AppError(503, "sender_configuration", "Send rate must be greater than zero and at most five.") from None

    if provider == "fake":
        return ProviderSettings(provider="fake", from_address=None, rate=rate)

    api_key = os.getenv("RESEND_API_KEY")
    from_address = os.getenv("RESEND_FROM_EMAIL", DEFAULT_FROM_ADDRESS)
    demo_recipient = os.getenv("RESEND_DEMO_RECIPIENT")
    sender_email = parseaddr(from_address)[1].strip().casefold()
    uses_shared_sender = sender_email == "onboarding@resend.dev"
    if validate and not api_key:
        raise AppError(503, "sender_configuration", "Set RESEND_API_KEY on the server.")
    if validate:
        try:
            TypeAdapter(ContactCreate).validate_python({"first_name": "Sender", "email": sender_email})
        except ValueError:
            raise AppError(
                503, "sender_configuration", "RESEND_FROM_EMAIL must contain a valid email address."
            ) from None
        if uses_shared_sender and not demo_recipient:
            raise AppError(
                503,
                "sender_configuration",
                "Set RESEND_DEMO_RECIPIENT to the email address on your Resend account.",
            )
    return ProviderSettings(
        provider="resend",
        from_address=from_address,
        rate=rate,
        api_key=api_key,
        # The recipient allowlist exists only for Resend's shared test sender.
        # A verified custom domain may deliver to any valid campaign contact.
        demo_recipient=demo_recipient.strip().casefold() if uses_shared_sender and demo_recipient else None,
    )


class ResendSender:
    def __init__(self, client: httpx.AsyncClient | None = None):
        self.client = client

    async def send(
        self,
        *,
        outcome_id: str,
        email: str,
        subject: str,
        message: str,
        settings: ProviderSettings,
    ) -> str:
        sender_email = parseaddr(settings.from_address or "")[1].strip().casefold()
        if (
            sender_email == "onboarding@resend.dev"
            and settings.demo_recipient
            and email.casefold() != settings.demo_recipient
        ):
            raise CampaignSendError(
                "The shared onboarding@resend.dev sender can only deliver to the configured Resend account email."
            )

        payload = {"from": settings.from_address, "to": [email], "subject": subject, "text": message}
        headers = {"Authorization": f"Bearer {settings.api_key}", "Idempotency-Key": f"outcome-{outcome_id}"}

        owns_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=httpx.Timeout(15, connect=5))
        try:
            response = await client.post(RESEND_API_URL, json=payload, headers=headers)
            if response.status_code == 429:
                try:
                    wait_seconds = min(float(response.headers.get("Retry-After", "1")), 10)
                except ValueError:
                    wait_seconds = 1
                await asyncio.sleep(max(wait_seconds, 0))
                response = await client.post(RESEND_API_URL, json=payload, headers=headers)
            if response.status_code >= 500:
                raise UnknownSubmission("Resend acceptance could not be confirmed. The message was not retried.")
            if response.status_code >= 400:
                try:
                    provider_message = response.json().get("message")
                except (ValueError, AttributeError):
                    provider_message = None
                raise CampaignSendError(provider_message or "Resend rejected the email.")
            message_id = response.json().get("id")
            if not message_id:
                raise UnknownSubmission("Resend returned no message ID; acceptance could not be confirmed.")
            return str(message_id)
        except (httpx.TimeoutException, httpx.NetworkError):
            raise UnknownSubmission("Resend acceptance could not be confirmed. The message was not retried.") from None
        finally:
            if owns_client:
                await client.aclose()
