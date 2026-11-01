# General Backend — Handoff

State as of 2026-10-11. Yasser continues the backend. The frontend in `frontend/` is connected to every endpoint below; how each page uses them is in [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md#الربط-بالباك-اند).

## What exists

- FastAPI app in `backend/` with authentication (Supabase Auth, project **MAEEN**, `qtgxldycxaghkvgsxbet`) and contract upload, list, view and delete.
- The MAEEN Assistant: a chat assistant on OpenAI for signed-in users (see [MAEEN Assistant](#maeen-assistant)).
- Contract analysis and questions about a contract, through the AI Backend package in `ai_backend/` (see [AI Backend integration](#ai-backend-integration)).
- Database schema, RLS, private PDF bucket and pgvector are applied on MAEEN. See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

Setup and run steps are in the root [README](../README.md#general-backend-fastapi). Environment variables are listed in `backend/.env.example`.

## Endpoints

All bodies are JSON, except the contract upload, which is `multipart/form-data`. Validation errors return `422` with `{"detail": [{"loc", "msg", "type"}]}`; every other error returns `{"detail": "<message>"}`.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| `GET` | `/` | — | `200 {"message": "AI Contract Analyzer API"}` | — |
| `POST` | `/api/auth/register` | `{"first_name", "last_name", "email", "password"}` (names 1–50 characters, saved in the Supabase user's `user_metadata`) | `200 {"message", "account_status"}`: `"new"`, or `"not_activated"` when the email already has an account that is not activated (Supabase sends it a new code) | `409` the email already has an activated account, `422` weak password (minimum 8 characters, with at least one letter and one digit), `400`/`403`/`429` rejected by Supabase, `502`, `503` |
| `POST` | `/api/auth/login` | `{"email", "password"}` | `200 {"access_token", "token_type", "expires_in"}` | `401` wrong credentials, `403` email not confirmed, `429`, `502`, `503` |
| `POST` | `/api/auth/verify` | `{"email", "code"}` (the 6–10 digit code from the activation email) | `200 {"access_token", "token_type", "expires_in"}`: the account is activated and signed in | `400` wrong or expired code, `422`, `429` (5 attempts per email per 10 minutes, `Retry-After`), `502`, `503` |
| `POST` | `/api/auth/resend` | `{"email"}` | `200 {"message": ...}` (same reply whether or not the email has an account waiting) | `429` asked again too soon, `502`, `503` |
| `GET` | `/api/auth/me` | header `Authorization: Bearer <access_token>` | `200 {"id", "email", "first_name", "last_name", "ai_consent_at"}` (names are `null` for accounts created before names were added; `ai_consent_at` is `null` until the user agrees to AI processing) | `401` missing/invalid/expired token, `502`, `503` |
| `DELETE` | `/api/auth/me` | header `Authorization: Bearer <access_token>` | `204`: the user's PDFs are removed from Storage, then the Supabase user is deleted; contracts, analysis results, chunks and chat history go with it (`ON DELETE CASCADE`). Already-deleted users also get `204` | `401`, `502` deletion failed (the user is kept, so it can be retried), `503` |
| `POST` | `/api/auth/ai-consent` | header only | `200 {"ai_consent_at"}`: saves the time the user agreed to send contract text, inquiries and assistant messages to OpenAI, in `user_metadata.ai_consent_at` | `401`, `502`, `503` |
| `DELETE` | `/api/auth/ai-consent` | header only | `200 {"ai_consent_at": null}`: withdraws it | `401`, `502`, `503` |
| `POST` | `/api/contracts` | form field `file` (the PDF) | `201` contract | `400` empty file, `413` over 50 MB, `415` not a PDF, `401`, `502`, `503` |
| `GET` | `/api/contracts` | — | `200 [contract, ...]`, the user's own, newest first | `401`, `502`, `503` |
| `GET` | `/api/contracts/{id}` | — | `200` contract | `404` not found or not the user's, `422` id is not a UUID, `401`, `502`, `503` |
| `DELETE` | `/api/contracts/{id}` | — | `204`, no body; the PDF, analyses, chunks and chat go with it | `404`, `422`, `401`, `502`, `503` |
| `POST` | `/api/assistant/chat` | `{"messages": [{"role", "content"}, ...]}` | `200 {"reply"}` | `422` invalid conversation, `429` over 20 questions in 10 minutes (with `Retry-After`), `403` no AI consent, `401`, `502`, `503` |
| `POST` | `/api/assistant/chat/stream` | same as `/api/assistant/chat` | `200` server-sent events: `{"delta"}` parts, then `{"done": true}` or `{"error"}` | same as `/api/assistant/chat` (`403` no AI consent), before the first part |
| `POST` | `/api/contracts/{id}/analyze` | — | `202 {"status": "processing"}`; the analysis runs in the background | `404`, `409` already analyzing, `422`, `429` over 10 analyses an hour, `403` no AI consent, `401`, `502`, `503` |
| `GET` | `/api/contracts/{id}/analysis` | — | `200 {"analysis", "created_at"}` | `404` contract or analysis not found, `422`, `401`, `502`, `503` |
| `POST` | `/api/contracts/{id}/chat` | `{"question"}` | `200 {"answer", "sources": [{"page", "text"}]}` | `409` analysis not complete, `404`, `422`, `429` (shared with the assistant), `403` no AI consent, `401`, `502`, `503` |
| `GET` | `/api/contracts/{id}/chat` | — | `200 [{"question", "answer", "sources", "created_at"}, ...]`, oldest first, up to 50 | `404`, `422`, `401`, `502`, `503` |

All `/api/contracts` endpoints need `Authorization: Bearer <access_token>`. A contract is:

```json
{"id": "uuid", "file_name": "عقد الإيجار.pdf", "status": "uploaded", "created_at": "...", "updated_at": "..."}
```

`status` is one of `uploaded`, `processing`, `completed`, `failed`. `file_name` is the name the user uploaded. The upload checks the file's content, not its extension, so a renamed non-PDF gets `415`.

Example from the browser:

```js
const form = new FormData();
form.append("file", fileInput.files[0]);
await fetch(`${API}/api/contracts`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` }, // no Content-Type: the browser sets it
  body: form,
});
```

## AI Backend integration

The AI Backend team's package (`ai_backend/`, from the `Ai-backend` branch by AFZ0X and I-Bhan) does the AI work. Its README leaves ownership checks, contract status, `analysis_results` and `chat_history` to the General Backend; `services/F_ai_service.py` does those and calls the package's functions directly (`process_contract`, `chat_with_contract`), so its token-protected `/internal/ai` router is not needed in the same process.

- Code: `routers/F_ai.py`, `services/F_ai_service.py`, `models/F_ai_data.py`, tests in `tests/test_ai_integration.py` (the package itself is tested in `ai_backend/tests`).
- **AI consent (Apple guideline 5.1.2(i)):** `analyze`, contract `chat` POST and both assistant endpoints use `require_ai_consent` (`dependencies/F_auth.py`), which answers `403 "AI processing consent is required"` until `user_metadata.ai_consent_at` is set. Reading saved analyses and chat history needs no consent.
- **Analysis:** `POST /api/contracts/{id}/analyze` checks the contract is the user's and not already processing, sets `status` to `processing`, replies `202`, then runs `process_contract` in the background. On success it replaces the contract's row in `analysis_results` and sets `completed`; on any failure it sets `failed` and logs the cause under `maeen.ai`. The frontend starts it right after an upload, and the contract page offers it for `uploaded` and `failed` contracts.
- **Analysis result:** the `analysis` object is the AI Backend's `ContractAnalysis`: `summary`, `parties`, `obligations`, `payment_terms`, `termination`, `renewal`, `important_clauses`, `risks` (each with `pages`), and `suggested_filename`. Its text is in Arabic.
- **Questions:** `POST /api/contracts/{id}/chat` works only when the analysis is `completed` (otherwise `409`). It calls `chat_with_contract`, saves the question, answer and sources in `chat_history`, and returns them. If saving fails, the answer is still returned and the error is logged.
- **Limits:** 10 analyses per user per hour (each makes several paid OpenAI requests); contract questions share the assistant's 20 per 10 minutes.
- **Settings** (`backend/.env`): `OPENAI_API_KEY`, `CHAT_MODEL`, `EMBEDDING_MODEL` (`text-embedding-3-small`, 1536 dimensions), and `SUPABASE_DB_URL` (the direct Postgres connection string, needed for pgvector). The service_role key is reused from `SUPABASE_KEY` as the package's `SUPABASE_SERVICE_ROLE_KEY`. When a setting is missing, these endpoints answer `503` without calling OpenAI.
- **Known limits:** the analysis runs inside the API process, so a restart during an analysis leaves the contract in `processing`; it can be started again once the status is fixed (or after a future "stuck job" check). Scanned PDFs without a text layer fail (no OCR yet, see `ai_backend/README.md`).

## MAEEN Assistant

The round button in the corner of every signed-in page opens a chat with the MAEEN Assistant. It explains how MAEEN works and answers general questions about contracts. When the user chooses one of their analyzed contracts in the window, the question goes to `POST /api/contracts/{id}/chat` instead and the answer shows its sources.

- Code: `routers/F_assistant.py`, `services/F_assistant_service.py`, `models/F_assistant_data.py`, tests in `tests/test_assistant.py`.
- Settings in `backend/.env`: `OPENAI_API_KEY` and `CHAT_MODEL`, the same names the AI Backend uses. If either is empty, the endpoint answers `503` and never calls OpenAI. The cheapest current model is `gpt-6-luna`; for reasoning models, `CHAT_REASONING_EFFORT=low` keeps replies fast.
- Request: `messages` is the conversation, oldest first, 1 to 20 messages. `role` is `user` or `assistant`, and the last message must be from the user. A user message is at most 2,000 characters; an assistant message at most 8,000.
- Only the latest 12 messages go to OpenAI, through the Responses API with `store=False` (OpenAI does not keep the conversation) and a hashed `safety_identifier` (never the real user id). Replies are capped at 4,000 output tokens, which includes a reasoning model's thinking.
- The assistant's instructions are `INSTRUCTIONS` in `services/F_assistant_service.py`: it replies in the user's language, in formal Arabic or English, stays on MAEEN and contracts, says it cannot see the user's contracts, gives general information rather than legal advice, and never invents legal citations.
- Limit: 20 questions per user per 10 minutes, kept in memory. It resets when the server restarts and is per process; move it to a shared store if the backend runs on several processes.
- Errors: OpenAI unreachable, overloaded, or rejecting the key or model gives `503`; any other OpenAI failure or an empty reply gives `502`. The cause is logged under `maeen.assistant`, without the conversation text.
- Streaming: the frontend uses `POST /api/assistant/chat/stream`, which sends the same request to OpenAI with `stream=True` and passes the reply on as it is written. Each event is a `data: {...}` line followed by a blank line. The endpoint waits for the first words before answering, so the errors above still come back as a status. A failure after that ends the stream with `{"error"}` instead of `{"done": true}`. The two endpoints share the 20-question limit.

## Auth flow for the frontend

1. `register` → Supabase emails a numeric code (email confirmation is on).
2. `verify` with that code → the account is activated and the reply is already a session, so the user does not sign in again. `resend` sends a new code. `login` on an account that is not activated yet answers `403`.
3. `login` → keep `access_token`.
4. Send `Authorization: Bearer <access_token>` on every protected call. On `401`, send the user back to login.
5. Protect new endpoints with `Depends(get_current_user)` from `backend/dependencies/F_auth.py`; it returns the Supabase user (`user.id` is the `auth.users.id` used as `user_id` in every table).

The code arrives only if the Supabase **Confirm signup** email template shows `{{ .Token }}`. The template is kept in `supabase/templates/confirm-signup.html`: paste it into Supabase → Authentication → Emails → Confirm signup, with the subject `{{ .Token }} | MAEEN verification code | رمز التحقق`. Supabase lets you edit the template only after a custom SMTP sender is set (Authentication → Emails → SMTP Settings). Without one, the built-in sender delivers only to the project's team members and allows 2 emails per hour. Sending over SMTP can take a few seconds, so the backend waits up to 30 seconds for Supabase (`REQUEST_TIMEOUT_SECONDS` in `backend/services/F_supabase_client.py`). If the backend gives up too early, Supabase drops the new account.

## Database rules for new endpoints

- The frontend talks only to this backend, never to Supabase directly.
- Writes to `contracts`, `analysis_results` and `chat_history` need the **service_role** key (`SUPABASE_KEY`): `anon` has no table access and `authenticated` is read-only.
- Because service_role bypasses RLS, every query must filter by the current `user.id` in code.
- PDFs go to bucket `contract-pdfs` at `{user_id}/{contract_id}/contract.pdf`, PDF only, max 50 MB; the same path is stored in `contracts.storage_path`. The object name is fixed because Storage keys reject Arabic letters and some symbols; the user's original name is kept in `contracts.file_name`. Code that needs the PDF should read `contracts.storage_path` rather than build the path.
- Contract code lives in `routers/Y_contracts.py` and `services/Y_contract_service.py`.
- Schema changes go in a new file `supabase/migrations/00N_<name>.sql`, applied once to MAEEN. Do not re-run `001`, `002` or `003`; the next one is `004`.

## Open items

1. **Session length.** `login` returns no `refresh_token`, so users are signed out when `access_token` expires (`expires_in`, about 1 hour by default). Add a refresh endpoint if longer sessions are needed.
2. **Leaked password protection** is off: Supabase offers it only on the Pro plan (Authentication → Providers → Email). It is the only Security Advisor warning. Minimum password length was raised from 6 to 8 instead. Captcha is off on purpose: turning it on makes Supabase reject every sign-up and login until the frontend sends an hCaptcha token through the backend.
3. **Embedding size.** `document_chunks.embedding` is `vector(1536)`; confirm the real model and dimension with the AI Backend before inserting embeddings.
4. **Rate limiting.** Supabase rate-limits Auth per client IP, and every request comes from the backend's IP. Under real traffic, consider rate limiting in the backend itself.
5. **Tests.** `backend/tests/` covers the contract endpoints against a fake Supabase, the assistant against a fake OpenAI client, and the AI Backend integration against a fake `ai_backend`, so it never touches MAEEN or OpenAI. Run it with `cd backend && python -m pip install -r requirements-dev.txt && python -m pytest`. The AI package's own tests run from the repository root with `python -m pytest ai_backend/tests`. The auth endpoints have no tests yet.
