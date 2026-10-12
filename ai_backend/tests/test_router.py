from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_backend import router as ai_router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(ai_router.router)
    return TestClient(app)


def test_internal_routes_reject_missing_token(monkeypatch):
    monkeypatch.setenv("AI_INTERNAL_AUTH_TOKEN", "test-internal-token")
    contract_id = str(uuid4())
    client = _client()

    assert client.post(f"/internal/ai/process/{contract_id}").status_code == 401
    assert client.post(f"/internal/ai/chat/{contract_id}", json={"question": "Fee?"}).status_code == 401


def test_internal_process_passes_valid_contract_id(monkeypatch):
    monkeypatch.setenv("AI_INTERNAL_AUTH_TOKEN", "test-internal-token")
    contract_id = str(uuid4())
    calls = []
    monkeypatch.setattr(ai_router, "process_contract", lambda value: calls.append(value) or {"chunk_count": 2})

    response = _client().post(
        f"/internal/ai/process/{contract_id}",
        headers={"x-ai-internal-token": "test-internal-token"},
    )

    assert response.status_code == 200
    assert response.json() == {"chunk_count": 2}
    assert calls == [contract_id]
