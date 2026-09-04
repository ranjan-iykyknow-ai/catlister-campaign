import asyncio
from typing import Any


class CampaignSendError(RuntimeError):
    pass


class FakeCampaignSender:
    """Deterministic stand-in for a remote message provider."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail_contact_ids: set[str] = set()
        self.active_calls = 0
        self.max_active_calls = 0

    async def send(self, *, contact_id: str, email: str, message: str) -> str:
        self.active_calls += 1
        self.max_active_calls = max(self.max_active_calls, self.active_calls)
        self.calls.append({"contact_id": contact_id, "email": email, "message": message})
        try:
            delay = {
                "contact_1": 0.04,
                "contact_2": 0.01,
                "contact_3": 0.03,
                "contact_4": 0.02,
            }.get(contact_id, 0.01)
            await asyncio.sleep(delay)
            if contact_id in self.fail_contact_ids:
                raise CampaignSendError(f"Message provider rejected {contact_id}")
            return f"message_{contact_id}"
        finally:
            self.active_calls -= 1

    def reset(self) -> None:
        self.calls = []
        self.fail_contact_ids = set()
        self.active_calls = 0
        self.max_active_calls = 0
