from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from supabase_auth.errors import AuthApiError

import services.F_auth_service as auth_service

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
