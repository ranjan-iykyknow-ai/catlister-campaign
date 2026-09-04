import os
import tempfile
from pathlib import Path

import pytest

TEST_DIRECTORY = Path(tempfile.mkdtemp(prefix="campaign-dispatch-tests-"))
os.environ["DATABASE_PATH"] = str(TEST_DIRECTORY / "test.db")
os.environ["EMAIL_PROVIDER"] = "fake"

from app.db import reset_database
from app.v1.campaigns.service import campaign_service


@pytest.fixture(autouse=True)
def reset_test_state() -> None:
    reset_database()
    campaign_service.sender.reset()
    campaign_service.next_send_at = 0
    yield
    campaign_service.sender.reset()
