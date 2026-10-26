"""The General Backend's side of the AI Backend: ownership, status, saved results.

The AI package itself (ai_backend/) is replaced by a fake, so these tests never
call OpenAI or the database. ai_backend has its own tests in ai_backend/tests.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import openai
import pytest

import services.F_ai_service as ai_service
import services.F_assistant_service as assistant_service

from conftest import USER_A, USER_B

CONTRACT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
ANALYSIS = {"summary": "عقد إيجار سكني لمدة سنة.", "risks": [{"text": "غرامة إنهاء مبكر", "pages": [3]}]}
ANSWER = {"answer": "مدة الإشعار 30 يومًا.", "sources": [{"page": 3, "text": "يلتزم المستأجر بإشعار المؤجر قبل 30 يومًا."}]}


class FakeAi:
    def __init__(self):
        self.processed = []
        self.questions = []
        self.process_error = None
        self.chat_error = None
        self.chat_result = ANSWER

    def process_contract(self, contract_id):
        self.processed.append(contract_id)
        if self.process_error:
            raise self.process_error
        return {"analysis": ANALYSIS, "chunk_count": 4}

    def chat_with_contract(self, contract_id, question):
        self.questions.append((contract_id, question))
        if self.chat_error:
            raise self.chat_error
        return self.chat_result


@pytest.fixture
def fake_ai(monkeypatch, fake_db):
    ai = FakeAi()
    monkeypatch.setattr(ai_service, "_ai", lambda: ai)
    monkeypatch.setattr(ai_service, "_data_client", lambda: fake_db)
    for name in ai_service.REQUIRED_SETTINGS:
        monkeypatch.setenv(name, "test-value")
    assistant_service._requests_by_user.clear()
    yield ai
    assistant_service._requests_by_user.clear()


def contract_status(fake_db):
    return fake_db.tables["contracts"][0]["status"]


def set_status(fake_db, status):
    fake_db.tables["contracts"][0]["status"] = status


# ---------- analysis ----------

def test_analyze_runs_the_ai_and_saves_the_result(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)

    response = client.post(f"/api/contracts/{CONTRACT}/analyze")

    assert response.status_code == 202
    assert response.json() == {"status": "processing"}
    assert fake_ai.processed == [CONTRACT]
    assert contract_status(fake_db) == "completed"
    saved = fake_db.tables["analysis_results"]
    assert len(saved) == 1
    assert saved[0]["contract_id"] == CONTRACT
    assert saved[0]["analysis"] == ANALYSIS

    analysis = client.get(f"/api/contracts/{CONTRACT}/analysis")
    assert analysis.status_code == 200
    assert analysis.json()["analysis"] == ANALYSIS


def test_reanalysis_replaces_the_previous_result(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)

    client.post(f"/api/contracts/{CONTRACT}/analyze")
    client.post(f"/api/contracts/{CONTRACT}/analyze")

    assert len(fake_ai.processed) == 2
    assert len(fake_db.tables["analysis_results"]) == 1


def test_failed_analysis_marks_the_contract_failed(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    fake_ai.process_error = ValueError("The PDF contains no extractable text")

    response = client.post(f"/api/contracts/{CONTRACT}/analyze")

    assert response.status_code == 202
    assert contract_status(fake_db) == "failed"
    assert fake_db.tables.get("analysis_results", []) == []


def test_failed_contract_can_be_analyzed_again(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    set_status(fake_db, "failed")

    assert client.post(f"/api/contracts/{CONTRACT}/analyze").status_code == 202
    assert contract_status(fake_db) == "completed"


def test_analyze_refuses_a_contract_already_processing(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    set_status(fake_db, "processing")

    response = client.post(f"/api/contracts/{CONTRACT}/analyze")

    assert response.status_code == 409
    assert fake_ai.processed == []


def test_cannot_analyze_another_users_contract(client, fake_db, fake_ai, signed_in_as):
    fake_db.add_contract(USER_A, CONTRACT)
    signed_in_as(USER_B)

    response = client.post(f"/api/contracts/{CONTRACT}/analyze")

    assert response.status_code == 404
    assert fake_ai.processed == []
    assert contract_status(fake_db) == "uploaded"


def test_analyze_without_settings_returns_503(client, fake_db, fake_ai, signed_in_as, monkeypatch):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    monkeypatch.delenv("SUPABASE_DB_URL")

    response = client.post(f"/api/contracts/{CONTRACT}/analyze")

    assert response.status_code == 503
    assert fake_ai.processed == []
    assert contract_status(fake_db) == "uploaded"


def test_analysis_is_limited_per_user(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    for _ in range(ai_service.ANALYSIS_LIMIT):
        assert client.post(f"/api/contracts/{CONTRACT}/analyze").status_code == 202

    response = client.post(f"/api/contracts/{CONTRACT}/analyze")

    assert response.status_code == 429
    assert "Retry-After" in response.headers


def test_analysis_before_it_exists_returns_404(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)

    response = client.get(f"/api/contracts/{CONTRACT}/analysis")

    assert response.status_code == 404
    assert response.json()["detail"] == "Analysis not found"


def test_cannot_read_another_users_analysis(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    client.post(f"/api/contracts/{CONTRACT}/analyze")
    signed_in_as(USER_B)

    assert client.get(f"/api/contracts/{CONTRACT}/analysis").status_code == 404


def test_owner_can_apply_suggested_name_without_moving_the_pdf(
    client, fake_db, fake_ai, signed_in_as,
):
    signed_in_as(USER_A)
    storage_path = fake_db.add_contract(USER_A, CONTRACT, file_name="original.pdf")
    set_status(fake_db, "completed")
    fake_db.tables["analysis_results"] = [{
        "contract_id": CONTRACT,
        "analysis": {"suggested_filename": "service_agreement.pdf"},
        "created_at": "2026-10-01T00:00:00+00:00",
    }]

    endpoint = f"/api/contracts/{CONTRACT}/apply-suggested-name"
    first = client.post(endpoint)
    assert first.status_code == 200
    assert first.json()["file_name"] == "service_agreement.pdf"
    assert "storage_path" not in first.json()
    assert fake_db.tables["contracts"][0]["storage_path"] == storage_path
    assert fake_db.files[storage_path] == b"%PDF-1.7 old"
    assert client.get(f"/api/contracts/{CONTRACT}").json()["file_name"] == "service_agreement.pdf"

    # Repeated clicks are harmless and do not write another update.
    updates_before = sum(query.table == "contracts" and query.action == "update" for query in fake_db.queries)
    assert client.post(endpoint).json()["file_name"] == "service_agreement.pdf"
    assert sum(query.table == "contracts" and query.action == "update" for query in fake_db.queries) == updates_before


@pytest.mark.parametrize("suggestion", ["../unsafe.pdf", "document.pdf", "", None])
def test_suggested_name_rejects_unsafe_or_generic_values(
    client, fake_db, fake_ai, signed_in_as, suggestion,
):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT, file_name="original.pdf")
    set_status(fake_db, "completed")
    fake_db.tables["analysis_results"] = [{
        "contract_id": CONTRACT,
        "analysis": {"suggested_filename": suggestion},
        "created_at": "2026-10-01T00:00:00+00:00",
    }]

    response = client.post(f"/api/contracts/{CONTRACT}/apply-suggested-name")
    assert response.status_code == 409
    assert fake_db.tables["contracts"][0]["file_name"] == "original.pdf"


def test_suggested_name_requires_a_completed_owned_analysis(client, fake_db, fake_ai, signed_in_as):
    fake_db.add_contract(USER_A, CONTRACT)
    endpoint = f"/api/contracts/{CONTRACT}/apply-suggested-name"

    signed_in_as(USER_B)
    assert client.post(endpoint).status_code == 404
    signed_in_as(USER_A)
    assert client.post(endpoint).status_code == 409
    set_status(fake_db, "completed")
    assert client.post(endpoint).status_code == 409  # no saved analysis
    assert fake_db.tables["contracts"][0]["file_name"] == "old.pdf"


def test_suggested_name_requires_sign_in(client):
    assert client.post(f"/api/contracts/{CONTRACT}/apply-suggested-name").status_code == 401


def test_analysis_endpoints_require_sign_in(client, fake_db, fake_ai):
    assert client.post(f"/api/contracts/{CONTRACT}/analyze").status_code == 401
    assert client.get(f"/api/contracts/{CONTRACT}/analysis").status_code == 401


# ---------- questions ----------

def ask(client, question="ما مدة الإشعار؟"):
    return client.post(f"/api/contracts/{CONTRACT}/chat", json={"question": question})


def test_question_returns_answer_and_saves_history(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    set_status(fake_db, "completed")

    response = ask(client, "  ما مدة الإشعار؟  ")

    assert response.status_code == 200
    assert response.json() == ANSWER
    assert fake_ai.questions == [(CONTRACT, "ما مدة الإشعار؟")]
    saved = fake_db.tables["chat_history"][0]
    assert saved["user_id"] == USER_A
    assert saved["question"] == "ما مدة الإشعار؟"
    assert saved["sources"] == ANSWER["sources"]

    history = client.get(f"/api/contracts/{CONTRACT}/chat")
    assert history.status_code == 200
    assert history.json()[0]["answer"] == ANSWER["answer"]


def test_question_before_analysis_returns_409(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)

    response = ask(client)

    assert response.status_code == 409
    assert fake_ai.questions == []


def test_cannot_ask_about_another_users_contract(client, fake_db, fake_ai, signed_in_as):
    fake_db.add_contract(USER_A, CONTRACT)
    set_status(fake_db, "completed")
    signed_in_as(USER_B)

    assert ask(client).status_code == 404
    assert client.get(f"/api/contracts/{CONTRACT}/chat").status_code == 404
    assert fake_ai.questions == []


@pytest.mark.parametrize("question", ["", "   ", "x" * 2001])
def test_rejects_invalid_questions(client, fake_db, fake_ai, signed_in_as, question):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    set_status(fake_db, "completed")

    assert ask(client, question).status_code == 422
    assert fake_ai.questions == []


@pytest.mark.parametrize("error, expected_status", [
    (openai.APIConnectionError(request=httpx.Request("POST", "https://api.openai.com")), 503),
    (ValueError("A supported answer requires text and sources"), 502),
    (LookupError("Contract not found"), 502),
])
def test_ai_errors_map_to_clear_statuses(client, fake_db, fake_ai, signed_in_as, error, expected_status):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    set_status(fake_db, "completed")
    fake_ai.chat_error = error

    assert ask(client).status_code == expected_status
    assert fake_db.tables.get("chat_history", []) == []


def test_empty_ai_answer_returns_502(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    set_status(fake_db, "completed")
    fake_ai.chat_result = {"answer": "  ", "sources": []}

    assert ask(client).status_code == 502


def test_invalid_sources_are_dropped(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    set_status(fake_db, "completed")
    fake_ai.chat_result = {"answer": "نعم.", "sources": [{"page": 0, "text": "x"}, {"page": 2, "text": " نص "}, "bad"]}

    assert ask(client).json()["sources"] == [{"page": 2, "text": "نص"}]


def test_contract_questions_share_the_assistant_limit(client, fake_db, fake_ai, signed_in_as):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    set_status(fake_db, "completed")
    for _ in range(assistant_service.RATE_LIMIT):
        assert ask(client).status_code == 200

    assert ask(client).status_code == 429


def test_missing_ai_packages_return_503(client, fake_db, fake_ai, signed_in_as, monkeypatch):
    signed_in_as(USER_A)
    fake_db.add_contract(USER_A, CONTRACT)
    set_status(fake_db, "completed")

    def no_packages():
        raise ai_service.AiNotConfigured("AI Backend packages are not installed")

    monkeypatch.setattr(ai_service, "_ai", no_packages)

    assert ask(client).status_code == 503


def test_operator_recovery_requires_an_old_owned_processing_row(fake_db, fake_ai):
    fake_db.add_contract(USER_A, CONTRACT)
    row = fake_db.tables["contracts"][0]
    row["status"] = "processing"
    now = datetime(2026, 10, 12, tzinfo=timezone.utc)
    row["updated_at"] = (now - timedelta(minutes=30)).isoformat()

    assert not ai_service.mark_interrupted_analysis_failed(USER_A, CONTRACT, now=now)
    with pytest.raises(ai_service.ContractNotFound):
        ai_service.mark_interrupted_analysis_failed(USER_B, CONTRACT, now=now)
    assert row["status"] == "processing"

    row["updated_at"] = (now - timedelta(hours=2)).isoformat()
    assert ai_service.mark_interrupted_analysis_failed(USER_A, CONTRACT, now=now)
    assert row["status"] == "failed"
    assert not ai_service.mark_interrupted_analysis_failed(USER_A, CONTRACT, now=now)


def test_operator_recovery_checks_timestamp_at_update(fake_db, fake_ai, monkeypatch):
    fake_db.add_contract(USER_A, CONTRACT)
    row = fake_db.tables["contracts"][0]
    row["status"] = "processing"
    row["updated_at"] = "2026-10-12T11:59:00+00:00"
    original_owned_contract = ai_service._owned_contract

    def stale_read(user_id, contract_id):
        contract = original_owned_contract(user_id, contract_id)
        return {**contract, "updated_at": "2026-10-01T00:00:00+00:00"}

    monkeypatch.setattr(ai_service, "_owned_contract", stale_read)
    assert not ai_service.mark_interrupted_analysis_failed(
        USER_A, CONTRACT, now=datetime(2026, 10, 12, 12, tzinfo=timezone.utc),
    )
    assert row["status"] == "processing"
