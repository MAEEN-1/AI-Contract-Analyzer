import math


def cosine_similarity(first: list[float], second: list[float]) -> float:
    if not first or len(first) != len(second):
        raise ValueError("Vectors must be non-empty and have matching dimensions")
    if not all(math.isfinite(value) for value in first + second):
        raise ValueError("Vectors must contain only finite values")
    left = math.sqrt(sum(value * value for value in first))
    right = math.sqrt(sum(value * value for value in second))
    if left == 0 or right == 0:
        raise ValueError("Vectors must have non-zero lengths")
    return sum(a * b for a, b in zip(first, second)) / (left * right)


def retrieve_chunks(
    question_embedding: list[float],
    embedded_chunks: list[dict],
    top_k: int = 3,
) -> list[dict]:
    if top_k < 1:
        raise ValueError("top_k must be greater than zero")
    results = []
    # Only pass chunks from the selected contract to this local search.
    for chunk in embedded_chunks:
        score = cosine_similarity(question_embedding, chunk["embedding"])
        results.append({
            "page_number": chunk["page_number"],
            "chunk_text": chunk["chunk_text"],
            "score": score,
        })
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:top_k]
