import pytest
from httpx import ASGITransport, AsyncClient

from app.db import create_connection
from app.main import app
from app.v1.campaigns.sender import CampaignSendError
from app.v1.campaigns.service import campaign_service


async def test_healthcheck() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/healthcheck")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_database_helper_opens_sqlite_with_foreign_keys_enabled() -> None:
    with create_connection() as connection:
        foreign_keys_enabled = connection.execute("PRAGMA foreign_keys").fetchone()[0]

    assert foreign_keys_enabled == 1


async def test_fake_sender_is_deterministic() -> None:
    message_id = await campaign_service.sender.send(
        contact_id="contact_1",
        email="maya@example.com",
        message="Hi Maya",
    )

    assert message_id == "message_contact_1"
    assert campaign_service.sender.calls == [
        {
            "contact_id": "contact_1",
            "email": "maya@example.com",
            "message": "Hi Maya",
        }
    ]


async def test_fake_sender_supports_predictable_failures() -> None:
    campaign_service.sender.fail_contact_ids.add("contact_3")

    with pytest.raises(CampaignSendError, match="rejected contact_3"):
        await campaign_service.sender.send(
            contact_id="contact_3",
            email="sam@example.com",
            message="Hi Sam",
        )
