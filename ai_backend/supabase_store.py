import math
import os
from uuid import UUID

import psycopg
from supabase import create_client


BUCKET = "contract-pdfs"
DIMENSION = 1536
MAX_PDF_BYTES = 50 * 1024 * 1024
DB_CONNECT_TIMEOUT_SECONDS = 10


def _contract_id(value: str) -> str:
    return str(UUID(str(value)))


def _client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return create_client(url, key)


def _database_url() -> str:
    url = os.getenv("SUPABASE_DB_URL")
    if not url:
        raise ValueError("SUPABASE_DB_URL is required for pgvector operations")
    return url


def _connect_database(connect=None):
    # A broken pooler or unreachable network must not hold an analysis job
    # indefinitely. Keep injected test connections compatible with the
    # existing one-argument factory interface.
    if connect is not None:
        return connect(_database_url())
    return psycopg.connect(_database_url(), connect_timeout=DB_CONNECT_TIMEOUT_SECONDS)


def _vector_literal(vector: list[float]) -> str:
    if len(vector) != DIMENSION or not all(math.isfinite(value) for value in vector):
        raise ValueError("Embedding must contain 1536 finite values")
    return "[" + ",".join(str(value) for value in vector) + "]"


def download_contract_pdf(contract_id: str, client=None) -> bytes:
    contract_id = _contract_id(contract_id)
    client = client or _client()
    response = (
        client.table("contracts")
        .select("storage_path,user_id")
        .eq("id", contract_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise LookupError("Contract not found")
    row = response.data[0]
    path = row["storage_path"]
    pieces = path.split("/")
    if len(pieces) != 3 or pieces[0] != row["user_id"] or pieces[1] != contract_id:
        raise ValueError("Contract storage path does not match its metadata")
    data = client.storage.from_(BUCKET).download(path)
    if not isinstance(data, bytes) or not data[:1024].lstrip().startswith(b"%PDF-"):
        raise ValueError("Storage did not return a valid PDF")
    if len(data) > MAX_PDF_BYTES:
        raise ValueError("PDF exceeds the 50 MB AI processing limit")
    return data


def replace_contract_chunks(contract_id: str, chunks: list[dict], connect=None) -> int:
    contract_id = _contract_id(contract_id)
    if not chunks:
        raise ValueError("Cannot index a contract without chunks")
    rows = []
    for chunk in chunks:
        text = chunk["chunk_text"].strip()
        page = chunk["page_number"]
        if not text or not isinstance(page, int) or page < 1:
            raise ValueError("Each chunk needs text and a positive page number")
        rows.append((contract_id, text, page, _vector_literal(chunk["embedding"])))

    # Delete and insert in one transaction so failed reprocessing rolls back.
    with _connect_database(connect) as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM public.document_chunks WHERE contract_id = %s::uuid", (contract_id,))
            cursor.executemany(
                "INSERT INTO public.document_chunks "
                "(contract_id, chunk_text, page_number, embedding) "
                "VALUES (%s::uuid, %s, %s, %s::extensions.vector)",
                rows,
            )
    return len(rows)


def search_contract_chunks(
    contract_id: str,
    question_embedding: list[float],
    top_k: int = 5,
    connect=None,
) -> list[dict]:
    contract_id = _contract_id(contract_id)
    if not 1 <= top_k <= 20:
        raise ValueError("top_k must be between 1 and 20")
    vector = _vector_literal(question_embedding)
    with _connect_database(connect) as connection:
        with connection.cursor() as cursor:
            # The contract filter is mandatory for every vector search.
            cursor.execute(
                "SELECT page_number, chunk_text, "
                "1 - (embedding <=> %s::extensions.vector) AS score "
                "FROM public.document_chunks "
                "WHERE contract_id = %s::uuid AND embedding IS NOT NULL "
                "ORDER BY embedding <=> %s::extensions.vector LIMIT %s",
                (vector, contract_id, vector, top_k),
            )
            return [
                {"page_number": page, "chunk_text": text, "score": score}
                for page, text, score in cursor.fetchall()
            ]
