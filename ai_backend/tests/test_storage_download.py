from types import SimpleNamespace
from uuid import uuid4

import pytest

from ai_backend import supabase_store


class FakeQuery:
    def __init__(self, row):
        self.row = row

    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def limit(self, _limit):
        return self

    def execute(self):
        return SimpleNamespace(data=[self.row])


class FakeStorage:
    def __init__(self, data):
        self.data = data

    def from_(self, _bucket):
        return self

    def download(self, _path):
        return self.data


class FakeClient:
    def __init__(self, row, data):
        self.row = row
        self.storage = FakeStorage(data)

    def table(self, _name):
        return FakeQuery(self.row)


def test_pdf_limit_matches_general_backend():
    assert supabase_store.MAX_PDF_BYTES == 50 * 1024 * 1024


def test_download_accepts_pdf_with_leading_whitespace():
    user_id, contract_id = str(uuid4()), str(uuid4())
    row = {"user_id": user_id, "storage_path": f"{user_id}/{contract_id}/contract.pdf"}
    data = b"\n %PDF-1.7\n"

    assert supabase_store.download_contract_pdf(contract_id, FakeClient(row, data)) == data


def test_download_rejects_path_for_another_contract():
    user_id, contract_id = str(uuid4()), str(uuid4())
    row = {"user_id": user_id, "storage_path": f"{user_id}/{uuid4()}/contract.pdf"}

    with pytest.raises(ValueError, match="does not match"):
        supabase_store.download_contract_pdf(contract_id, FakeClient(row, b"%PDF-1.7\n"))


def test_download_rejects_pdf_above_limit(monkeypatch):
    user_id, contract_id = str(uuid4()), str(uuid4())
    row = {"user_id": user_id, "storage_path": f"{user_id}/{contract_id}/contract.pdf"}
    monkeypatch.setattr(supabase_store, "MAX_PDF_BYTES", 8)

    with pytest.raises(ValueError, match="50 MB"):
        supabase_store.download_contract_pdf(contract_id, FakeClient(row, b"%PDF-1.7\n"))
