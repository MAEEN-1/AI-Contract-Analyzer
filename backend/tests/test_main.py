import importlib

from fastapi.testclient import TestClient

import main


def load_app(monkeypatch, environment):
    monkeypatch.setenv("MAEEN_ENV", environment)
    return TestClient(importlib.reload(main).app)


def test_docs_are_hidden_in_production(monkeypatch):
    client = load_app(monkeypatch, "production")

    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404
    # The API itself still answers.
    assert client.get("/api/auth/me").status_code == 401


def test_docs_stay_available_in_development(monkeypatch):
    client = load_app(monkeypatch, "")

    assert client.get("/docs").status_code == 200
