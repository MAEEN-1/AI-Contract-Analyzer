import httpx

import routers.Y_contracts as contracts_router
from services.Y_contract_service import clean_file_name

from conftest import USER_A, USER_B

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF"
CONTRACT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
CONTRACT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


def upload(client, content=PDF, name="عقد الإيجار.pdf"):
    return client.post(
        "/api/contracts",
        files={"file": (name, content, "application/pdf")},
    )


# ---------- upload ----------

def test_upload_saves_file_and_row_for_current_user(client, fake_db, signed_in_as):
    signed_in_as(USER_A)

    response = upload(client)

    assert response.status_code == 201
    body = response.json()
    assert body["file_name"] == "عقد الإيجار.pdf"
    assert body["status"] == "uploaded"
    assert "storage_path" not in body

    row = fake_db.tables["contracts"][0]
    assert row["user_id"] == USER_A
    assert row["id"] == body["id"]
    assert row["storage_path"] == f"{USER_A}/{body['id']}/contract.pdf"
    assert fake_db.files[row["storage_path"]] == PDF


def test_upload_rejects_non_pdf_content(client, fake_db, signed_in_as):
    signed_in_as(USER_A)

    response = upload(client, content=b"PK\x03\x04 not a pdf", name="fake.pdf")

    assert response.status_code == 415
    assert fake_db.files == {}
    assert fake_db.tables == {}


def test_upload_rejects_empty_file(client, fake_db, signed_in_as):
    signed_in_as(USER_A)

    response = upload(client, content=b"")

    assert response.status_code == 400
    assert fake_db.files == {}


def test_upload_rejects_file_over_limit(client, fake_db, signed_in_as, monkeypatch):
    monkeypatch.setattr(contracts_router, "MAX_PDF_BYTES", 10)
    monkeypatch.setattr(contracts_router, "MULTIPART_OVERHEAD_BYTES", 10_000)
    signed_in_as(USER_A)

    response = upload(client, content=b"%PDF-" + b"x" * 20)

    assert response.status_code == 413
    assert fake_db.files == {}


def test_upload_removes_file_when_row_insert_fails(client, fake_db, signed_in_as):
    signed_in_as(USER_A)
    fake_db.fail_next_query = RuntimeError("insert rejected")

    response = upload(client)

    assert response.status_code == 502
    assert fake_db.files == {}
    assert fake_db.tables.get("contracts", []) == []


def test_upload_returns_503_when_storage_unreachable(client, fake_db, signed_in_as):
    signed_in_as(USER_A)
    fake_db.fail_upload = httpx.ConnectError("down")

    response = upload(client)

    assert response.status_code == 503
    assert fake_db.tables == {}


def test_upload_requires_token(client, fake_db):
    response = upload(client)

    assert response.status_code == 401
    assert fake_db.files == {}


# ---------- list and get ----------

def test_list_returns_only_own_contracts_newest_first(client, fake_db, signed_in_as):
    fake_db.add_contract(USER_A, CONTRACT_A, "first.pdf", "2026-10-01T00:00:00+00:00")
    fake_db.add_contract(USER_B, CONTRACT_B, "other user.pdf")
    newer = "cccccccc-cccc-cccc-cccc-cccccccccccc"
    fake_db.add_contract(USER_A, newer, "second.pdf", "2026-10-05T00:00:00+00:00")
    signed_in_as(USER_A)

    response = client.get("/api/contracts")

    assert response.status_code == 200
    assert [item["file_name"] for item in response.json()] == ["second.pdf", "first.pdf"]
    assert all("storage_path" not in item for item in response.json())


def test_every_query_filters_by_user(client, fake_db, signed_in_as):
    fake_db.add_contract(USER_A, CONTRACT_A)
    signed_in_as(USER_A)

    client.get("/api/contracts")
    client.get(f"/api/contracts/{CONTRACT_A}")
    client.delete(f"/api/contracts/{CONTRACT_A}")

    for query in fake_db.queries:
        if query.action != "insert":
            assert ("user_id", USER_A) in query.filters


def test_get_own_contract(client, fake_db, signed_in_as):
    fake_db.add_contract(USER_A, CONTRACT_A, "mine.pdf")
    signed_in_as(USER_A)

    response = client.get(f"/api/contracts/{CONTRACT_A}")

    assert response.status_code == 200
    assert response.json()["file_name"] == "mine.pdf"


def test_get_other_users_contract_is_404(client, fake_db, signed_in_as):
    fake_db.add_contract(USER_B, CONTRACT_B)
    signed_in_as(USER_A)

    response = client.get(f"/api/contracts/{CONTRACT_B}")

    assert response.status_code == 404


def test_get_with_invalid_id_is_422(client, fake_db, signed_in_as):
    signed_in_as(USER_A)

    response = client.get("/api/contracts/not-a-uuid")

    assert response.status_code == 422


# ---------- delete ----------

def test_delete_own_contract_removes_file_and_row(client, fake_db, signed_in_as):
    path = fake_db.add_contract(USER_A, CONTRACT_A)
    signed_in_as(USER_A)

    response = client.delete(f"/api/contracts/{CONTRACT_A}")

    assert response.status_code == 204
    assert path not in fake_db.files
    assert fake_db.tables["contracts"] == []


def test_delete_other_users_contract_is_404_and_untouched(client, fake_db, signed_in_as):
    path = fake_db.add_contract(USER_B, CONTRACT_B)
    signed_in_as(USER_A)

    response = client.delete(f"/api/contracts/{CONTRACT_B}")

    assert response.status_code == 404
    assert path in fake_db.files
    assert len(fake_db.tables["contracts"]) == 1


# ---------- file names ----------

def test_clean_file_name():
    assert clean_file_name("../../etc/passwd.pdf") == "passwd.pdf"
    assert clean_file_name("C:\\Users\\me\\عقد.pdf") == "عقد.pdf"
    assert clean_file_name("bad\x00name.pdf") == "badname.pdf"
    assert clean_file_name("   ") == "contract.pdf"
    assert clean_file_name(None) == "contract.pdf"
    assert len(clean_file_name("a" * 400 + ".pdf")) == 255
