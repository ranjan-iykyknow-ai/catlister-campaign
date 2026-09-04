import io

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.v1.campaigns.service import campaign_service


def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_campaign_contact_and_template_crud() -> None:
    async with client() as api:
        template_response = await api.post(
            "/v1/templates",
            json={"name": "Welcome", "subject": "Hello {first_name}", "body": "Hi {first_name}, welcome!"},
        )
        assert template_response.status_code == 201
        template = template_response.json()

        campaign_response = await api.post(
            "/v1/campaigns",
            json={"name": "September launch", "description": "Small demo", "template_id": template["id"]},
        )
        assert campaign_response.status_code == 201
        campaign = campaign_response.json()

        contact_response = await api.post(
            f"/v1/campaigns/{campaign['id']}/contacts",
            json={"first_name": "Riya", "email": "riya@example.com"},
        )
        assert contact_response.status_code == 201
        contact = contact_response.json()

        updated = await api.patch(
            f"/v1/campaigns/{campaign['id']}/contacts/{contact['id']}",
            json={"first_name": "Ria", "opted_out": True},
        )
        assert updated.status_code == 200
        assert updated.json()["first_name"] == "Ria"
        assert updated.json()["opted_out"] is True

        detail = (await api.get(f"/v1/campaigns/{campaign['id']}")).json()
        assert detail["template"]["name"] == "Welcome"
        assert detail["contact_count"] == 1
        assert detail["eligible_count"] == 0


async def test_csv_import_is_atomic_and_enforces_campaign_limit() -> None:
    async with client() as api:
        campaign = (await api.post("/v1/campaigns", json={"name": "CSV demo"})).json()
        csv_file = io.BytesIO(b"first_name,email\nAda,ada@example.com\nGrace,grace@example.com\n")
        imported = await api.post(
            f"/v1/campaigns/{campaign['id']}/contacts/import",
            files={"file": ("contacts.csv", csv_file, "text/csv")},
        )
        assert imported.status_code == 201
        assert imported.json()["imported"] == 2

        duplicate = await api.post(
            f"/v1/campaigns/{campaign['id']}/contacts/import",
            files={"file": ("duplicates.csv", b"first_name,email\nAda,ada@example.com\n", "text/csv")},
        )
        assert duplicate.status_code == 409
        contacts = (await api.get(f"/v1/campaigns/{campaign['id']}/contacts")).json()
        assert contacts["total"] == 2


async def test_send_personalizes_and_skips_opted_out_contacts(monkeypatch) -> None:
    async def no_wait(_seconds: float) -> None:
        return None

    monkeypatch.setattr(campaign_service, "sleep", no_wait)
    async with client() as api:
        response = await api.post("/v1/campaigns/campaign_1/send")
        assert response.status_code == 202
        accepted = response.json()

        run_response = await api.get(accepted["status_url"])
        assert run_response.status_code == 200
        run = run_response.json()
        assert run["status"] == "completed"
        assert run["counts"]["sent"] == 3
        assert run["counts"]["skipped"] == 1
        assert [call["email"] for call in campaign_service.sender.calls] == [
            "maya@example.com",
            "noah@example.com",
            "sam@example.com",
        ]
        assert [call["message"] for call in campaign_service.sender.calls] == [
            "Hi Maya, I would love to learn how your team handles customer research.",
            "Hi Noah, I would love to learn how your team handles customer research.",
            "Hi Sam, I would love to learn how your team handles customer research.",
        ]


async def test_template_in_use_cannot_be_deleted() -> None:
    async with client() as api:
        response = await api.delete("/v1/templates/template_1")
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "template_in_use"


async def test_shared_password_protects_deployed_api(monkeypatch) -> None:
    monkeypatch.setenv("APP_PASSWORD", "review-only")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    async with client() as api:
        blocked = await api.get("/v1/campaigns")
        assert blocked.status_code == 401

        rejected = await api.post("/v1/auth/session", json={"password": "incorrect"})
        assert rejected.status_code == 401

        signed_in = await api.post("/v1/auth/session", json={"password": "review-only"})
        assert signed_in.status_code == 200
        assert signed_in.json()["authenticated"] is True
        assert (await api.get("/v1/campaigns")).status_code == 200
