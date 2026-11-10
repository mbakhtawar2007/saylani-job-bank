from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import router


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    app.state.settings = SimpleNamespace(internal_api_token="a" * 40)
    app.state.pool = object()
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/internal/matches/runs", {"job_id": "job-1"}),
        ("GET", "/internal/matches/jobs/job-1", None),
    ],
)
def test_internal_routes_reject_missing_and_invalid_credentials(client, method, path, body):
    for headers in ({}, {"Authorization": "Bearer wrong"}):
        response = client.request(method, path, json=body, headers=headers)
        assert response.status_code == 401


@pytest.mark.parametrize("token", [None, "too-short"])
def test_missing_secret_fails_closed(client, token):
    client.app.state.settings.internal_api_token = token
    response = client.get("/internal/matches/jobs/job-1", headers={"Authorization": "Bearer x"})
    assert response.status_code == 503


def test_valid_token_reaches_matching_logic(client, monkeypatch):
    async def run_job_match(pool, job_id, trigger):
        assert job_id == "job-1"
        assert trigger == "MANUAL"
        return SimpleNamespace(
            status="COMPLETED", model_dump=lambda **kwargs: {"status": "COMPLETED"}
        )

    monkeypatch.setattr("app.api.run_job_match", run_job_match)
    response = client.post(
        "/internal/matches/runs",
        headers={"Authorization": f"Bearer {'a' * 40}"},
        json={"job_id": "job-1"},
    )
    assert response.status_code == 200
    assert response.json() == {"status": "COMPLETED"}
