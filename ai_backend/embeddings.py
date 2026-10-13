import math
import os

from langchain_openai import OpenAIEmbeddings


def embed_chunks(chunks: list[dict]) -> list[dict]:
    if not chunks:
        return []

    texts = [chunk["chunk_text"].strip() for chunk in chunks]

    if any(not text for text in texts):
        raise ValueError("Chunks must contain non-empty text")

    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError("OPENAI_API_KEY is missing")

    model_name = os.getenv("EMBEDDING_MODEL") or "text-embedding-3-small"

    # Keep vectors compatible with the database's 1536 dimensions.
    dimension = int(os.getenv("EMBEDDING_DIMENSION") or "1536")

    if dimension != 1536:
        raise ValueError("EMBEDDING_DIMENSION must be 1536")

    model = OpenAIEmbeddings(model=model_name)
    vectors = model.embed_documents(texts)

    if len(vectors) != len(chunks):
        raise ValueError("The embedding count does not match the chunk count")

    embedded_chunks = []

    for chunk, vector in zip(chunks, vectors):
        if len(vector) != dimension:
            raise ValueError(
                f"Expected {dimension} embedding dimensions, got {len(vector)}"
            )

        if not all(math.isfinite(value) for value in vector):
            raise ValueError("The embedding contains non-finite values")

        embedded_chunks.append({
            **chunk,
            "embedding": vector,
        })

    return embedded_chunks


def embed_question(question: str) -> list[float]:
    question = question.strip()
    if not question:
        raise ValueError("The question must not be empty")
    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError("OPENAI_API_KEY is missing")
    dimension = int(os.getenv("EMBEDDING_DIMENSION") or "1536")
    if dimension != 1536:
        raise ValueError("EMBEDDING_DIMENSION must be 1536")

    # Questions and chunks must use the same model for comparable vectors.
    model_name = os.getenv("EMBEDDING_MODEL") or "text-embedding-3-small"
    vector = OpenAIEmbeddings(model=model_name).embed_query(question)
    if len(vector) != dimension:
        raise ValueError(f"Expected {dimension} embedding dimensions, got {len(vector)}")
    if not all(math.isfinite(value) for value in vector):
        raise ValueError("The question embedding contains non-finite values")
    return vector
