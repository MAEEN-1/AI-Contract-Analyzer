from uuid import uuid4

import ai_backend.supabase_store as store
from ai_backend.supabase_store import search_contract_chunks


class FakeCursor:
    def __init__(self):
        self.query = ""
        self.args = ()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, args):
        self.query = query
        self.args = args

    def fetchall(self):
        return [(2, "Selected contract text", 0.9)]


class FakeConnection:
    def __init__(self):
        self.last_cursor = FakeCursor()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self):
        return self.last_cursor


def test_vector_query_is_filtered_to_contract(monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://unused-for-test")
    connection = FakeConnection()
    contract_id = str(uuid4())
    results = search_contract_chunks(
        contract_id,
        [0.1] * 1536,
        top_k=1,
        connect=lambda _url: connection,
    )
    assert "WHERE contract_id = %s::uuid" in connection.last_cursor.query
    assert connection.last_cursor.args[1] == contract_id
    assert results[0]["page_number"] == 2


def test_default_database_connection_has_a_bounded_timeout(monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://unused-for-test")
    calls = []
    connection = FakeConnection()

    def fake_connect(url, **options):
        calls.append((url, options))
        return connection

    monkeypatch.setattr(store.psycopg, "connect", fake_connect)
    search_contract_chunks(str(uuid4()), [0.1] * 1536, top_k=1)

    assert calls == [(
        "postgresql://unused-for-test",
        {"connect_timeout": store.DB_CONNECT_TIMEOUT_SECONDS},
    )]
