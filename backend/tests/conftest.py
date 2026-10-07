"""Shared test setup. Tests never reach Supabase: a fake in-memory client stands in."""

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import services.Y_contract_service as contract_service  # noqa: E402
from dependencies.F_auth import get_current_user  # noqa: E402
from main import app  # noqa: E402

USER_A = "11111111-1111-1111-1111-111111111111"
USER_B = "22222222-2222-2222-2222-222222222222"


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.action = "select"
        self.columns = None
        self.payload = None
        self.filters = []
        self.order_by = None
        self.max_rows = None

    def select(self, columns):
        self.columns = columns.split(",")
        return self

    def insert(self, payload):
        self.action = "insert"
        self.payload = payload
        return self

    def delete(self):
        self.action = "delete"
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def order(self, column, desc=False):
        self.order_by = (column, desc)
        return self

    def limit(self, count):
        self.max_rows = count
        return self

    def _matches(self, row):
        return all(row.get(column) == value for column, value in self.filters)

    def execute(self):
        self.db.queries.append(self)

        if self.db.fail_next_query:
            error = self.db.fail_next_query
            self.db.fail_next_query = None
            raise error

        rows = self.db.tables.setdefault(self.table, [])

        if self.action == "insert":
            row = {
                **self.payload,
                "created_at": f"2026-10-07T12:00:{len(rows):02d}+00:00",
                "updated_at": f"2026-10-07T12:00:{len(rows):02d}+00:00",
            }
            rows.append(row)
            return FakeResponse([dict(row)])

        if self.action == "delete":
            removed = [row for row in rows if self._matches(row)]
            self.db.tables[self.table] = [row for row in rows if not self._matches(row)]
            return FakeResponse(removed)

        found = [row for row in rows if self._matches(row)]
        if self.order_by:
            column, desc = self.order_by
            found.sort(key=lambda row: row[column], reverse=desc)
        if self.max_rows is not None:
            found = found[: self.max_rows]

        return FakeResponse([
            {column: row[column] for column in self.columns} for row in found
        ])


class FakeBucket:
    def __init__(self, db):
        self.db = db

    def upload(self, path, data, options):
        if self.db.fail_upload:
            raise self.db.fail_upload
        self.db.files[path] = bytes(data)
        return SimpleNamespace(path=path)

    def remove(self, paths):
        for path in paths:
            self.db.files.pop(path, None)
        return []


class FakeSupabase:
    def __init__(self):
        self.tables = {}
        self.files = {}
        self.queries = []
        self.fail_next_query = None
        self.fail_upload = None
        self.storage = SimpleNamespace(from_=lambda bucket: FakeBucket(self))

    def table(self, name):
        return FakeQuery(self, name)

    def add_contract(self, user_id, contract_id, file_name="old.pdf", created_at=None):
        path = f"{user_id}/{contract_id}/contract.pdf"
        stamp = created_at or "2026-10-01T00:00:00+00:00"
        self.tables.setdefault("contracts", []).append({
            "id": contract_id,
            "user_id": user_id,
            "file_name": file_name,
            "storage_path": path,
            "status": "uploaded",
            "created_at": stamp,
            "updated_at": stamp,
        })
        self.files[path] = b"%PDF-1.7 old"
        return path


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeSupabase()
    monkeypatch.setattr(contract_service, "_data_client", lambda: db)
    return db


@pytest.fixture
def signed_in_as():
    def sign_in(user_id):
        app.dependency_overrides[get_current_user] = (
            lambda: SimpleNamespace(id=user_id, email="user@example.com")
        )

    yield sign_in
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)
