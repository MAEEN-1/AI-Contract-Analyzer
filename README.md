# AI-Contract-Analyzer
AI-powered platform for contract analysis and RAG-based contract Q&amp;A.

## General Backend (FastAPI)

The backend lives in `backend/` and currently provides authentication on top of Supabase Auth. Endpoints, the auth flow for the frontend, and open items are in [docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md).

Run it locally (Python 3.10+, tested on 3.14):

```bash
cd backend
python -m pip install -r requirements.txt
cp .env.example .env   # then fill in the values
python -m uvicorn main:app --reload
```

The API is then on `http://127.0.0.1:8000`, with interactive docs at `/docs`.

## Supabase Database — MAEEN

The project uses Supabase as the database, authentication, private PDF storage, and vector-search infrastructure for the AI Contract Analyzer.

The database implementation has been applied and verified in the existing Supabase project:

```text
Project name: MAEEN
Project ID: qtgxldycxaghkvgsxbet
Region: ap-northeast-1
Status: ACTIVE_HEALTHY
```

The frontend must not connect directly to PostgreSQL, private Storage operations, OpenAI, or the AI Backend. The intended architecture is:

```text
Frontend
    |
    v
General Backend
    |
    +------> Supabase PostgreSQL
    |
    +------> AI Backend
                |
                +------> Supabase Storage
                +------> pgvector
                +------> OpenAI
```

### Database tables

The Supabase schema contains these application tables:

```text
contracts
analysis_results
document_chunks
chat_history
```

Their ownership is divided as follows:

```text
General Backend
    contracts
    analysis_results
    chat_history

AI Backend
    document_chunks
    embeddings
```

`contracts.user_id` references `auth.users(id)`. Analysis results and document chunks reference their contract with `ON DELETE CASCADE`. `chat_history` uses a composite relationship from `(contract_id, user_id)` to `(contracts.id, contracts.user_id)` so a user cannot associate chat history with another user's contract.

### Contract storage

Uploaded PDF files are stored in a private Supabase Storage bucket:

```text
Bucket: contract-pdfs
Public: false
Allowed MIME type: application/pdf
Max file size: 50 MB
```

The documented object path is:

```text
{user_id}/{contract_id}/{file_name}
```

The same path must be stored in `contracts.storage_path`. Original PDFs remain stored after AI processing. Storage upload, retrieval, and deletion must be performed by trusted backend services. The service-role key must never be exposed to frontend code.

### Row Level Security

RLS is enabled on all four application tables. Authenticated users can read only their own records:

- Contracts are filtered by `contracts.user_id = auth.uid()`.
- Analysis results are filtered through the owning contract.
- Document chunks are filtered through the owning contract.
- Chat history is filtered by `chat_history.user_id = auth.uid()`.

No authenticated `INSERT`, `UPDATE`, or `DELETE` policies are provided. General Backend and AI Backend server operations use trusted server-side credentials. Anonymous users cannot read protected application rows.

### Vector search

The database enables `pgvector` and currently defines:

```text
Column: document_chunks.embedding
Type: extensions.vector(1536)
Distance metric: cosine distance
Index: HNSW
Operator class: extensions.vector_cosine_ops
m: 16
ef_construction: 64
```

The `1536` dimension is a provisional compatibility assumption because the AI Backend repository and its embedding configuration were not available during database implementation. It is compatible with commonly used models such as OpenAI `text-embedding-3-small`. Before production ingestion, confirm the exact AI Backend model and output dimension. If the actual dimension differs, update the vector column and index in a new migration before inserting embeddings.

### Timestamps and indexes

The database automatically updates `updated_at` for:

```text
contracts
analysis_results
```

The migration also creates indexes for user filtering, contract status filtering, contract relationships, chronological chat retrieval, composite chat ownership, and HNSW vector retrieval.

### Database files

The database layer is kept separate from frontend and application logic. The relevant files are:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_harden_privileges_and_pdf_limit.sql
supabase/migrations/003_pdf_limit_50mb.sql
supabase/tests/verify_schema.sql
scripts/verify-migration.sh
docs/DATABASE_SCHEMA.md
docs/MAEEN_SUPABASE_IMPLEMENTATION_PROMPT.md
docs/MAEEN_DATABASE_REVIEW_REPORT.md
```

The migration creates the schema, constraints, indexes, triggers, RLS policies, pgvector index, and private Storage bucket. The verification SQL checks the schema-level requirements. The migration verification script performs static checks and can run live verification when `DATABASE_URL` and `psql` are available.

### Verification status

The following behaviors were tested in MAEEN using temporary Seed Data inside a transaction:

- User A can read User A's contract, analysis, chunks, and chat history.
- User A cannot read User B's contract, analysis, chunks, or chat history.
- Authenticated direct `INSERT` is rejected by RLS.
- Authenticated direct `UPDATE` affects zero rows.
- Authenticated direct `DELETE` affects zero rows.
- Deleting a contract cascades to analysis results, document chunks, and chat history.
- The test transaction was rolled back.
- No test users or test records remain in MAEEN.

Migration `002` (2026-10-07) removed all table access from `anon`, made `authenticated` read-only (RLS still filters rows) and set a PDF size cap; migration `003` set that cap to 50 MB. `supabase/tests/verify_schema.sql` checks both.

The Supabase Security Advisor reports no database lints. Its one remaining warning is an Auth setting: leaked password protection is off because it requires the Supabase Pro plan. Minimum password length is 8.

### Integration notes

The current frontend repository contains UI code and mock API behavior, but no complete General Backend or AI Backend implementation was available for direct contract comparison. Before production integration, confirm the following with the backend teams:

1. The exact embedding model and vector dimension.
2. The exact Storage bucket and object path used by General Backend.
3. The contract and response schemas used by General Backend.
4. The chunk insertion payload used by AI Backend.
5. The analysis JSON and chat source payloads returned by AI Backend.

Do not rebuild the database or modify application logic when integrating this layer. Apply the Supabase migration through the project's normal migration workflow and keep the service-role credentials server-side only.

## Database repository

The standalone database repository is available at:

https://github.com/AFZ0X/ai-contract-analyzer-database
