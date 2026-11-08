import math

import pytest

from ai_backend.analysis import ContractAnalysis, TranslatedFields, analyze_contract, concise_filename, document_language, safe_filename, split_for_analysis, translate_analysis
from ai_backend.rag import RagAnswer, answer_question
from ai_backend.retrieval import cosine_similarity, retrieve_chunks
from ai_backend.supabase_store import _vector_literal


class FakeResponder:
    def __init__(self, result):
        self.result = result

    def with_structured_output(self, *_args, **_kwargs):
        return self

    def invoke(self, _messages):
        return self.result


def test_retrieval_preserves_the_matching_page():
    passages = [
        {"page_number": 1, "chunk_text": "unrelated", "embedding": [0.0, 1.0]},
        {"page_number": 3, "chunk_text": "monthly fee", "embedding": [1.0, 0.0]},
    ]
    result = retrieve_chunks([1.0, 0.0], passages, top_k=1)
    assert result[0]["page_number"] == 3
    assert result[0]["chunk_text"] == "monthly fee"
    assert math.isclose(result[0]["score"], 1.0)


def test_invalid_vectors_are_rejected():
    with pytest.raises(ValueError):
        cosine_similarity([1.0], [1.0, 2.0])
    with pytest.raises(ValueError):
        cosine_similarity([0.0, 0.0], [1.0, 0.0])


def test_rag_sources_come_from_original_passages():
    model = FakeResponder(RagAnswer(answer="500 USD monthly", supported=True, source_ids=[1]))
    passages = [{"page_number": 3, "chunk_text": "USD 500 per month"}]
    response = answer_question("What is the monthly fee?", passages, model=model)
    assert response["sources"] == [{"page": 3, "text": "USD 500 per month"}]


def test_rag_rejects_unknown_source_ids():
    model = FakeResponder(RagAnswer(answer="Claim", supported=True, source_ids=[2]))
    with pytest.raises(ValueError, match="invalid source ID"):
        answer_question("Question?", [{"page_number": 1, "chunk_text": "Text"}], model=model)


def test_missing_answer_uses_question_language():
    assert "المقاطع" in answer_question("كم السعر؟", [])["answer"]
    assert "retrieved" in answer_question("What is the price?", [])["answer"]


def test_analysis_split_preserves_page_number():
    parts = split_for_analysis([{"page_number": 4, "text": "A" * 250}], max_chars=100)
    assert len(parts) > 1
    assert all("[Page 4]" in part for part in parts)


def test_analysis_uses_document_language():
    assert document_language([{"text": "Service agreement between two parties"}]) == "en"
    assert document_language([{"text": "اتفاقية خدمات بين طرفين"}]) == "ar"


def test_translation_preserves_facts_and_original_analysis():
    source = {
        "summary": "The provider charges USD 500 per month.",
        "document_language": "en",
        "is_contract": True,
        "parties": [{"text": "Cedar Services LLC", "pages": [1]}],
        "payment_terms": {"amount": "500", "currency": "USD", "frequency": "monthly", "pages": [3]},
        "obligations": [{"text": "Send a report", "pages": [2]}],
        "suggested_filename": "cedar_service.pdf",
    }
    result = translate_analysis(source, "ar", model=FakeResponder(TranslatedFields(texts=[
        "يتقاضى المزود 500 دولار أمريكي شهريًا.", "شهريًا", "إرسال تقرير",
    ])))
    assert source["summary"] == "The provider charges USD 500 per month."
    assert result["summary"].startswith("يتقاضى")
    assert result["payment_terms"]["amount"] == "500"
    assert result["payment_terms"]["pages"] == [3]
    assert result["obligations"][0]["pages"] == [2]
    assert result["parties"] == source["parties"]
    assert result["suggested_filename"] == "cedar_service.pdf"
    assert result["display_language"] == "ar"


def test_translation_rejects_missing_fields():
    with pytest.raises(ValueError, match="every field"):
        translate_analysis({"summary": "A", "obligations": [{"text": "B", "pages": [1]}]}, "ar",
                           model=FakeResponder(TranslatedFields(texts=["أ"])))


def test_filename_rejects_paths():
    assert safe_filename("service_agreement.pdf") == "service_agreement.pdf"
    with pytest.raises(ValueError):
        safe_filename("../secret.pdf")


def test_long_suggested_filename_drops_generic_words():
    assert concise_filename("sample_service_agreement_cedar_green_valley.pdf") == "service_cedar_green_valley.pdf"


def test_invalid_suggested_filename_does_not_discard_analysis():
    result = ContractAnalysis.model_validate({
        "is_contract": True,
        "summary": "A service agreement",
        "parties": [],
        "obligations": [],
        "payment_terms": {
            "amount": None,
            "currency": None,
            "frequency": None,
            "due_terms": None,
            "late_fees": None,
            "pages": [],
        },
        "termination": {
            "grounds": None,
            "notice_period": None,
            "fees": None,
            "surviving_obligations": None,
            "pages": [],
        },
        "renewal": {
            "automatic": None,
            "conditions": None,
            "notice_deadline": None,
            "pages": [],
        },
        "important_clauses": [],
        "risks": [],
        "suggested_filename": "../unsafe.pdf",
    })

    analysis = analyze_contract(
        [{"page_number": 1, "text": "Service agreement"}],
        model=FakeResponder(result),
    )

    assert analysis["summary"] == "A service agreement"
    assert analysis["suggested_filename"] == "document.pdf"


def test_vector_dimension_and_finite_values():
    with pytest.raises(ValueError):
        _vector_literal([0.1] * 1535)
    with pytest.raises(ValueError):
        _vector_literal([float("nan")] * 1536)


def test_named_pdf_copy_preserves_original(tmp_path):
    from ai_backend.file_naming import save_named_pdf

    original = tmp_path / "original.pdf"
    original.write_bytes(b"%PDF-1.4 test bytes")
    first = save_named_pdf(
        original,
        "service_agreement.pdf",
        tmp_path / "processed",
    )
    second = save_named_pdf(
        original,
        "service_agreement.pdf",
        tmp_path / "processed",
    )

    assert first != second
    assert first.read_bytes() == original.read_bytes()
    assert original.read_bytes() == b"%PDF-1.4 test bytes"
