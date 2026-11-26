import pytest
from pydantic import ValidationError

from app.config import Settings


def test_database_url_rejects_owner_role():
    with pytest.raises(ValidationError, match="must not use a database owner role"):
        Settings(
            _env_file=None,
            database_url="postgresql://jobbank:secret@localhost/jobbank",
        )


def test_database_url_accepts_runtime_role():
    settings = Settings(
        _env_file=None,
        database_url="postgresql://app_rw:secret@localhost/jobbank",
    )
    assert settings.database_url.startswith("postgresql://app_rw:")
