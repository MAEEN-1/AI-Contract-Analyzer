from ai_backend.analysis import analyze_contract
from ai_backend.chunking import chunk_pages
from ai_backend.embeddings import embed_chunks, embed_question
from ai_backend.pdf_processing import extract_pdf_pages
from ai_backend.rag import answer_question
from ai_backend.supabase_store import (
    download_contract_pdf,
    replace_contract_chunks,
    search_contract_chunks,
)


def process_contract(contract_id: str) -> dict:
    # The General Backend verifies ownership before calling this operation.
    pdf_bytes = download_contract_pdf(contract_id)
    pages = extract_pdf_pages(pdf_bytes)
    if not pages:
        raise ValueError("The PDF contains no extractable text; scanned PDFs require OCR")

    # Complete analysis first, then prepare searchable chunks.
    analysis = analyze_contract(pages)
    chunks = chunk_pages(pages)
    if not chunks:
        raise ValueError("The PDF produced no text chunks")
    embedded_chunks = embed_chunks(chunks)
    chunk_count = replace_contract_chunks(contract_id, embedded_chunks)

    # The General Backend owns analysis_results and processing status writes.
    return {"analysis": analysis, "chunk_count": chunk_count}


def chat_with_contract(contract_id: str, question: str) -> dict:
    question_embedding = embed_question(question)
    passages = search_contract_chunks(contract_id, question_embedding, top_k=5)
    return answer_question(question, passages)
