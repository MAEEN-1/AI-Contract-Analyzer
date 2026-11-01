from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from supabase_auth.errors import AuthApiError

import services.F_auth_service as auth_service
from conftest import USER_A, USER_B

SIGNUP = {
    "first_name": "Sara",
    "last_name": "Ali",
    "email": "sara@example.com",
    "password": "Password123",
    "confirm_password": "Password123",
}


class FakeAuth:
    def __init__(self, result):
        self.result = result

    def sign_up(self, credentials):
        if isinstance(self.result, Exception):
            raise self.result
        return self.result

    def close(self):
        pass


@pytest.fixture
def fake_signup(monkeypatch):
    def use(result):
        client = SimpleNamespace(auth=FakeAuth(result))
        monkeypatch.setattr(auth_service, "get_supabase_client", lambda: client)

    return use


def signup_reply(identities, created_seconds_ago=0):
    code_sent_at = datetime.now(timezone.utc)
    created_at = code_sent_at - timedelta(seconds=created_seconds_ago)
    user = SimpleNamespace(
        identities=identities,
        created_at=created_at,
        confirmation_sent_at=code_sent_at,
    )
    return SimpleNamespace(user=user, session=None)


def test_new_email_is_accepted(client, fake_signup):
    fake_signup(signup_reply([{"provider": "email"}]))

    response = client.post("/api/auth/register", json=SIGNUP)

    assert response.status_code == 200
    assert response.json()["account_status"] == "new"


def test_registered_but_not_activated_email_is_reported(client, fake_signup):
    # Supabase sends a new code and returns the account it already has.
    fake_signup(signup_reply([{"provider": "email"}], created_seconds_ago=3600))

    response = client.post("/api/auth/register", json=SIGNUP)

    assert response.status_code == 200
    assert response.json()["account_status"] == "not_activated"


def test_registered_email_returns_409(client, fake_signup):
    # Supabase hides an existing confirmed account behind a user with no identities.
    fake_signup(signup_reply([]))

    response = client.post("/api/auth/register", json=SIGNUP)

    assert response.status_code == 409
    assert response.json()["detail"] == "An account with this email already exists"


def test_user_already_exists_error_returns_409(client, fake_signup):
    fake_signup(AuthApiError("User already registered", 422, "user_already_exists"))

    response = client.post("/api/auth/register", json=SIGNUP)

    assert response.status_code == 409


class FakeAdmin:
    def __init__(self, error=None):
        self.error = error
        self.deleted = []

    def delete_user(self, user_id):
        if self.error:
            raise self.error
        self.deleted.append(user_id)


@pytest.fixture
def fake_deletion(monkeypatch):
    def use(db, error=None):
        admin = FakeAdmin(error)
        db.auth = SimpleNamespace(admin=admin, close=lambda: None)
        monkeypatch.setattr(auth_service, "get_supabase_client", lambda: db)
        return admin

    return use


def test_delete_account_removes_files_then_user(client, fake_db, fake_deletion, signed_in_as):
    own_path = fake_db.add_contract(USER_A, "33333333-3333-3333-3333-333333333333")
    other_path = fake_db.add_contract(USER_B, "44444444-4444-4444-4444-444444444444")
    admin = fake_deletion(fake_db)
    signed_in_as(USER_A)

    response = client.delete("/api/auth/me")

    assert response.status_code == 204
    assert own_path not in fake_db.files
    assert other_path in fake_db.files
    assert admin.deleted == [USER_A]


def test_delete_account_without_contracts(client, fake_db, fake_deletion, signed_in_as):
    admin = fake_deletion(fake_db)
    signed_in_as(USER_A)

    response = client.delete("/api/auth/me")

    assert response.status_code == 204
    assert admin.deleted == [USER_A]


def test_delete_account_for_user_already_gone(client, fake_db, fake_deletion, signed_in_as):
    fake_deletion(fake_db, AuthApiError("User not found", 404, "user_not_found"))
    signed_in_as(USER_A)

    response = client.delete("/api/auth/me")

    assert response.status_code == 204


def test_delete_account_keeps_user_when_storage_fails(client, fake_db, fake_deletion, signed_in_as):
    fake_db.add_contract(USER_A, "33333333-3333-3333-3333-333333333333")
    fake_db.fail_next_query = RuntimeError("database error")
    admin = fake_deletion(fake_db)
    signed_in_as(USER_A)

    response = client.delete("/api/auth/me")

    assert response.status_code == 502
    assert admin.deleted == []


def test_delete_account_reports_unreachable_service(client, fake_db, fake_deletion, signed_in_as):
    fake_db.fail_next_query = httpx.ConnectError("offline")
    fake_deletion(fake_db)
    signed_in_as(USER_A)

    response = client.delete("/api/auth/me")

    assert response.status_code == 503


def test_delete_account_reports_auth_refusal(client, fake_db, fake_deletion, signed_in_as):
    fake_deletion(fake_db, AuthApiError("Not allowed", 403, "not_admin"))
    signed_in_as(USER_A)

    response = client.delete("/api/auth/me")

    assert response.status_code == 502


def test_delete_account_requires_sign_in(client):
    response = client.delete("/api/auth/me")

    assert response.status_code == 401


class FakeConsentAdmin:
    def __init__(self, error=None):
        self.error = error
        self.updates = []

    def update_user_by_id(self, user_id, attributes):
        if self.error:
            raise self.error
        self.updates.append((user_id, attributes))


@pytest.fixture
def fake_consent(monkeypatch):
    def use(error=None):
        admin = FakeConsentAdmin(error)
        client = SimpleNamespace(auth=SimpleNamespace(admin=admin, close=lambda: None))
        monkeypatch.setattr(auth_service, "get_supabase_client", lambda: client)
        return admin

    return use


def test_give_ai_consent_saves_the_time(client, fake_consent, signed_in_as):
    admin = fake_consent()
    signed_in_as(USER_A, ai_consent=False)

    response = client.post("/api/auth/ai-consent")

    assert response.status_code == 200
    consent_at = response.json()["ai_consent_at"]
    assert datetime.fromisoformat(consent_at).tzinfo is not None
    assert admin.updates == [(USER_A, {"user_metadata": {"ai_consent_at": consent_at}})]


def test_withdraw_ai_consent_clears_it(client, fake_consent, signed_in_as):
    admin = fake_consent()
    signed_in_as(USER_A)

    response = client.delete("/api/auth/ai-consent")

    assert response.status_code == 200
    assert response.json() == {"ai_consent_at": None}
    assert admin.updates == [(USER_A, {"user_metadata": {"ai_consent_at": None}})]


def test_ai_consent_reports_unreachable_service(client, fake_consent, signed_in_as):
    fake_consent(httpx.ConnectError("offline"))
    signed_in_as(USER_A, ai_consent=False)

    assert client.post("/api/auth/ai-consent").status_code == 503


def test_ai_consent_reports_auth_refusal(client, fake_consent, signed_in_as):
    fake_consent(AuthApiError("Not allowed", 403, "not_admin"))
    signed_in_as(USER_A, ai_consent=False)

    assert client.post("/api/auth/ai-consent").status_code == 502


def test_ai_consent_requires_sign_in(client):
    assert client.post("/api/auth/ai-consent").status_code == 401
    assert client.delete("/api/auth/ai-consent").status_code == 401


def test_me_reports_ai_consent(client, signed_in_as):
    signed_in_as(USER_A)

    response = client.get("/api/auth/me")

    assert response.json()["ai_consent_at"] == "2026-11-01T00:00:00+00:00"


@pytest.mark.parametrize("method, path, body", [
    ("post", "/api/contracts/33333333-3333-3333-3333-333333333333/analyze", None),
    ("post", "/api/contracts/33333333-3333-3333-3333-333333333333/chat", {"question": "What is the notice period?"}),
    ("post", "/api/assistant/chat", {"messages": [{"role": "user", "content": "Hello"}]}),
    ("post", "/api/assistant/chat/stream", {"messages": [{"role": "user", "content": "Hello"}]}),
])
def test_ai_endpoints_require_consent(client, fake_db, signed_in_as, method, path, body):
    signed_in_as(USER_A, ai_consent=False)

    response = getattr(client, method)(path, json=body)

    assert response.status_code == 403
    assert response.json()["detail"] == "AI processing consent is required"
