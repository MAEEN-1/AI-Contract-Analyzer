import sys
from pathlib import Path

from dotenv import load_dotenv

from ai_backend.analysis import analyze_contract
from ai_backend.chunking import chunk_pages
from ai_backend.embeddings import embed_chunks, embed_question
from ai_backend.file_naming import save_named_pdf
from ai_backend.pdf_processing import extract_pdf_pages
from ai_backend.rag import answer_question
from ai_backend.retrieval import retrieve_chunks


def main() -> None:
    ai_dir = Path(__file__).resolve().parent
    load_dotenv(ai_dir / ".env")
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ai_dir / "Data" / "maeen_sample_contract.pdf"
    if not pdf_path.is_file():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    pages = extract_pdf_pages(str(pdf_path))
    if not pages:
        raise ValueError("The PDF contains no extractable text")

    # Finish analysis before building the local RAG index.
    analysis = analyze_contract(pages)
    print("Analysis:", analysis)
    named_copy = save_named_pdf(pdf_path, analysis["suggested_filename"], ai_dir / "Data" / "processed")
    print("Saved local PDF copy:", named_copy)

    chunks = chunk_pages(pages)
    if not chunks:
        raise ValueError("The PDF produced no text chunks")
    embedded_chunks = embed_chunks(chunks)
    print(f"Pages: {len(pages)} | Chunks: {len(embedded_chunks)}")

    question = "What is the monthly service fee?"
    question_embedding = embed_question(question)
    passages = retrieve_chunks(question_embedding, embedded_chunks, top_k=3)
    response = answer_question(question, passages)

    print("Question:", question)
    print("Answer:", response["answer"])
    for source in response["sources"]:
        print(f"Page {source['page']}: {source['text']}")


if __name__ == "__main__":
    main()
