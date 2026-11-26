"""Unit tests for the candidate-pool SQL (audit 2026-11-11, M-12/M-13).

The pool query is asserted by capturing the SQL a fake connection receives:
INACTIVE applicants must be included (they are referrable under the interim
rule), REJECTED-identity applicants must stay excluded (they can never be
referred).
"""

import pytest

from app.repository import load_candidate_pool


class _FakeCursor:
    def __init__(self) -> None:
        self.sql = ""
        self.params = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, sql, params=None):
        self.sql = sql
        self.params = params

    async def fetchall(self):
        return []


class _FakeConn:
    def __init__(self) -> None:
        self.cursor_obj = _FakeCursor()

    def cursor(self, row_factory=None):
        return self.cursor_obj


@pytest.mark.asyncio
async def test_pool_includes_inactive_and_excludes_rejected_identity():
    conn = _FakeConn()
    await load_candidate_pool(conn, "job-id")
    sql = conn.cursor_obj.sql
    assert "a.status IN ('ACTIVE', 'INACTIVE')" in sql
    assert "a.identity_status <> 'REJECTED'" in sql
    assert "a.status = 'ACTIVE'" not in sql


@pytest.mark.asyncio
async def test_pool_is_city_scoped_without_branch_or_radius_restrictions():
    conn = _FakeConn()
    await load_candidate_pool(conn, "job-id")
    sql = conn.cursor_obj.sql
    assert "JOIN branches applicant_branch ON applicant_branch.id = a.branch_id" in sql
    assert "JOIN jobs j ON j.id = %s" in sql
    assert "JOIN branches job_branch ON job_branch.id = j.branch_id" in sql
    assert "upper(applicant_branch.city) = upper(job_branch.city)" in sql
    assert "ST_DWithin" not in sql
    assert "ST_Distance" not in sql
    assert "a.branch_id = j.branch_id" not in sql
    assert conn.cursor_obj.params == ("job-id",)
