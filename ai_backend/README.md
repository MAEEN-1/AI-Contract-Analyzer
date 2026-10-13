# MAEEN AI Backend

This package extracts contract text, analyzes it, indexes page-linked chunks, and answers questions from those chunks. It is called by the General Backend; the frontend must not call it directly.

## Entry points

| File | Purpose |
| --- | --- |
| `pipeline.py` | Local experiment using `Data/maeen_sample_contract.pdf`. Calls OpenAI and writes a named copy to `Data/processed/` each run. |
| `production_pipeline.py` | Importable production functions. Running this file directly does not start processing. |
| `router.py` | Token-protected internal FastAPI routes. The General Backend must mount the router and verify contract ownership before calling it. |

`process_contract(contract_id)` runs sequentially: download the private PDF, extract pages, analyze the whole document, split pages into chunks, embed chunks, and replace that contract's stored chunks. It returns `{"analysis": ..., "chunk_count": ...}`. `chat_with_contract(contract_id, question)` searches only that contract's chunks and returns `{"answer": ..., "sources": [{"page": ..., "text": ...}]}`.

The General Backend owns authentication, uploads, contract status, `analysis_results`, and `chat_history`. The AI package owns `document_chunks` and embeddings. The suggested filename is returned in the analysis; production processing does not rename the PDF in Storage.

## Local setup

From the repository root, install `ai_backend/requirements.txt`, copy `ai_backend/.env.example` to `ai_backend/.env`, and fill in the server-side credentials. Never commit `.env`. Set `EMBEDDING_MODEL` to a model producing 1536 dimensions, such as `text-embedding-3-small`, and set `CHAT_MODEL` to the chosen chat model.

```powershell
python -m pip install -r ai_backend/requirements.txt
python -m ai_backend.pipeline
python -m pytest ai_backend/tests -q
```

The local pipeline uses the fictional sample contract and makes paid OpenAI requests. It does not write to Supabase. A different local PDF may be passed as an argument to `python -m ai_backend.pipeline <pdf-path>`.

For production calls, the General Backend must load its environment variables before importing or calling the AI functions. Required values are listed in `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are server-only secrets.

## Current limits

- Scanned PDFs without extractable text require OCR, which is not implemented.
- Long-document analysis sends sections to the model in order and can require several paid requests.
- The AI result is returned to the caller; status and analysis persistence are not performed in this package.
- Use a real contract and questions with known answers to evaluate extraction, citations, and abstention before release.
