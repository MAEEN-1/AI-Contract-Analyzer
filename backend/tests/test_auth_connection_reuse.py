from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

import httpx
import pytest
from supabase_auth import SyncGoTrueClient
from supabase_auth.errors import AuthApiError
from types import SimpleNamespace

from services import F_auth_service as service


def test_verification_reuses_transport_without_sharing_user_credentials(monkeypatch):
    seen = []
    users = {"token-a": str(UUID(int=1)), "token-b": str(UUID(int=2))}

    def handle(request):
        token = request.headers["authorization"].removeprefix("Bearer ")
        seen.append(token)
        if token not in users:
            return httpx.Response(401, json={"message": "Invalid token"})
        return httpx.Response(200, json={
            "id": users[token], "aud": "authenticated", "app_metadata": {},
            "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z",
        })

    transport = httpx.Client(transport=httpx.MockTransport(handle))
    auth = SyncGoTrueClient(url="https://auth.example.invalid", http_client=transport)
    created = []

    def factory():
        created.append(True)
        return SimpleNamespace(auth=auth)

    monkeypatch.setattr(service, "get_supabase_client", factory)
    service._verification_client.cache_clear()
    try:
        assert service.get_user_from_token("token-a").id == users["token-a"]
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(service.get_user_from_token, ["token-a", "token-b"]))
        assert [user.id for user in results] == list(users.values())
        with pytest.raises(AuthApiError):
            service.get_user_from_token("expired-token")
        assert service.get_user_from_token("token-b").id == users["token-b"]
        assert len(created) == 1
        assert len(seen) == 5  # Every request was verified, including repeated tokens.
        assert not transport.is_closed
        assert auth.get_session() is None
    finally:
        auth.close()
        service._verification_client.cache_clear()
