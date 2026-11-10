from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.api as api_module
from app.api import router

TOKEN = "a" * 40


@pytest.fixture
def client(monkeypatch):
    # Merge (2026-11-10): the kept implementation gates /internal routes
    # on get_settings().api_token (MATCHING_API_TOKEN, env-based), not on
    # app.state.settings.internal_api_token, which Rafeh's version used.
    # Patch get_settings so the gate reads the test token.
    monkeypatch.setattr(api_module, "get_settings", lambda: SimpleNamespace(api_token=TOKEN))
    app = FastAPI()
    app.include_router(router)
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
def test_missing_secret_fails_closed(client, token, monkeypatch):
    monkeypatch.setattr(api_module, "get_settings", lambda: SimpleNamespace(api_token=token))
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
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"job_id": "job-1"},
    )
    assert response.status_code == 200
    assert response.json() == {"status": "COMPLETED"}
