import pytest

from ai_backend import production_pipeline


def test_process_contract_runs_analysis_before_indexing(monkeypatch):
    calls = []
    pages = [{"page_number": 1, "text": "Monthly fee: USD 500"}]
    chunks = [{"page_number": 1, "chunk_text": "Monthly fee: USD 500"}]
    analysis = {"summary": "A service agreement", "suggested_filename": "service_agreement.pdf"}

    monkeypatch.setattr(production_pipeline, "download_contract_pdf", lambda _id: calls.append("download") or b"%PDF-")
    monkeypatch.setattr(production_pipeline, "extract_pdf_pages", lambda _bytes: calls.append("extract") or pages)
    monkeypatch.setattr(production_pipeline, "analyze_contract", lambda _pages: calls.append("analyze") or analysis)
    monkeypatch.setattr(production_pipeline, "chunk_pages", lambda _pages: calls.append("chunk") or chunks)
    monkeypatch.setattr(production_pipeline, "embed_chunks", lambda _chunks: calls.append("embed") or chunks)
    monkeypatch.setattr(production_pipeline, "replace_contract_chunks", lambda _id, _chunks: calls.append("store") or 1)

    result = production_pipeline.process_contract("contract-id")

    assert calls == ["download", "extract", "analyze", "chunk", "embed", "store"]
    assert result == {"analysis": analysis, "chunk_count": 1}


def test_analysis_failure_does_not_replace_existing_chunks(monkeypatch):
    calls = []
    monkeypatch.setattr(production_pipeline, "download_contract_pdf", lambda _id: b"%PDF-")
    monkeypatch.setattr(production_pipeline, "extract_pdf_pages", lambda _bytes: [{"page_number": 1, "text": "Text"}])

    def fail_analysis(_pages):
        raise ValueError("Analysis failed")

    monkeypatch.setattr(production_pipeline, "analyze_contract", fail_analysis)
    monkeypatch.setattr(production_pipeline, "replace_contract_chunks", lambda *_args: calls.append("store"))

    with pytest.raises(ValueError, match="Analysis failed"):
        production_pipeline.process_contract("contract-id")
    assert calls == []


def test_chat_uses_stored_chunks_without_reprocessing(monkeypatch):
    calls = []
    question_vector = [0.1] * 1536
    passages = [{"page_number": 3, "chunk_text": "USD 500 per month"}]
    response = {"answer": "USD 500 per month", "sources": [{"page": 3, "text": passages[0]["chunk_text"]}]}

    monkeypatch.setattr(production_pipeline, "embed_question", lambda question: calls.append(("embed", question)) or question_vector)
    monkeypatch.setattr(production_pipeline, "search_contract_chunks", lambda contract_id, vector, top_k: calls.append(("search", contract_id, vector, top_k)) or passages)
    monkeypatch.setattr(production_pipeline, "answer_question", lambda question, chunks: calls.append(("answer", question, chunks)) or response)
    monkeypatch.setattr(production_pipeline, "download_contract_pdf", lambda _id: pytest.fail("Chat must not download the PDF"))

    result = production_pipeline.chat_with_contract("contract-id", "What is the fee?")

    assert result == response
    assert calls == [
        ("embed", "What is the fee?"),
        ("search", "contract-id", question_vector, 5),
        ("answer", "What is the fee?", passages),
    ]
