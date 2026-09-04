import httpx
import pytest

from app.email_provider import ProviderSettings, ResendSender, provider_settings
from app.v1.campaigns.sender import CampaignSendError


async def test_resend_adapter_sends_plain_text_with_idempotency_key() -> None:
    observed = {}

    def handle(request: httpx.Request) -> httpx.Response:
        observed["authorization"] = request.headers["Authorization"]
        observed["idempotency"] = request.headers["Idempotency-Key"]
        observed["payload"] = request.read().decode()
        return httpx.Response(200, json={"id": "resend-message-1"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        message_id = await ResendSender(client).send(
            outcome_id="outcome-1",
            email="owner@example.com",
            subject="Hello Riya",
            message="Hi Riya",
            settings=ProviderSettings(
                provider="resend",
                from_address="Campaign Dispatcher <onboarding@resend.dev>",
                rate=1,
                api_key="test-key",
                demo_recipient="owner@example.com",
            ),
        )

    assert message_id == "resend-message-1"
    assert observed["authorization"] == "Bearer test-key"
    assert observed["idempotency"] == "outcome-outcome-1"
    assert '"text":"Hi Riya"' in observed["payload"]


async def test_shared_sender_rejects_other_recipients_before_network_call() -> None:
    called = False

    def handle(_request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json={"id": "unexpected"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(CampaignSendError, match="Resend account email"):
            await ResendSender(client).send(
                outcome_id="outcome-2",
                email="someone-else@example.com",
                subject="Hello",
                message="Hi",
                settings=ProviderSettings(
                    provider="resend",
                    from_address="Campaign Dispatcher <onboarding@resend.dev>",
                    rate=1,
                    api_key="test-key",
                    demo_recipient="owner@example.com",
                ),
            )

    assert called is False


async def test_verified_domain_is_not_restricted_by_stale_demo_recipient() -> None:
    def handle(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"id": "resend-message-2"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        message_id = await ResendSender(client).send(
            outcome_id="outcome-3",
            email="recipient@example.com",
            subject="Hello",
            message="Hi",
            settings=ProviderSettings(
                provider="resend",
                from_address="Catlister <campaigns@mail.ranjan.ai>",
                rate=1,
                api_key="test-key",
                demo_recipient="owner@example.com",
            ),
        )

    assert message_id == "resend-message-2"


def test_verified_domain_configuration_ignores_demo_recipient(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "Catlister <campaigns@mail.ranjan.ai>")
    monkeypatch.setenv("RESEND_DEMO_RECIPIENT", "owner@example.com")

    assert provider_settings().demo_recipient is None
