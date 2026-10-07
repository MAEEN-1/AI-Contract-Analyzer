# General Backend — Handoff

State as of 2026-10-07. Yasser continues the backend; Mahmoud connects the frontend.

## What exists

- FastAPI app in `backend/` with authentication (Supabase Auth, project **MAEEN**, `qtgxldycxaghkvgsxbet`) and contract upload, list, view and delete.
- Database schema, RLS, private PDF bucket and pgvector are applied on MAEEN. See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).
- No analysis or chat endpoints yet.

Setup and run steps are in the root [README](../README.md#general-backend-fastapi). Environment variables are listed in `backend/.env.example`.

## Endpoints

All bodies are JSON, except the contract upload, which is `multipart/form-data`. Validation errors return `422` with `{"detail": [{"loc", "msg", "type"}]}`; every other error returns `{"detail": "<message>"}`.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| `GET` | `/` | — | `200 {"message": "AI Contract Analyzer API"}` | — |
| `POST` | `/api/auth/register` | `{"email", "password"}` | `200 {"message": ...}` (same reply whether or not the email already exists) | `422` weak password (minimum 8 characters), `400`/`403`/`429` rejected by Supabase, `502`, `503` |
| `POST` | `/api/auth/login` | `{"email", "password"}` | `200 {"access_token", "token_type", "expires_in"}` | `401` wrong credentials, `403` email not confirmed, `429`, `502`, `503` |
| `GET` | `/api/auth/me` | header `Authorization: Bearer <access_token>` | `200 {"id", "email"}` | `401` missing/invalid/expired token, `502`, `503` |
| `POST` | `/api/contracts` | form field `file` (the PDF) | `201` contract | `400` empty file, `413` over 50 MB, `415` not a PDF, `401`, `502`, `503` |
| `GET` | `/api/contracts` | — | `200 [contract, ...]`, the user's own, newest first | `401`, `502`, `503` |
| `GET` | `/api/contracts/{id}` | — | `200` contract | `404` not found or not the user's, `422` id is not a UUID, `401`, `502`, `503` |
| `DELETE` | `/api/contracts/{id}` | — | `204`, no body; the PDF, analyses, chunks and chat go with it | `404`, `422`, `401`, `502`, `503` |

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

## Auth flow for the frontend

1. `register` → the user confirms the email from Supabase's message (email confirmation is on).
2. `login` → keep `access_token`.
3. Send `Authorization: Bearer <access_token>` on every protected call. On `401`, send the user back to login.
4. Protect new endpoints with `Depends(get_current_user)` from `backend/dependencies/F_auth.py`; it returns the Supabase user (`user.id` is the `auth.users.id` used as `user_id` in every table).

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
5. **Tests.** `backend/tests/` covers the contract endpoints against a fake Supabase, so it never touches MAEEN. Run it with `cd backend && python -m pip install -r requirements-dev.txt && python -m pytest`. The auth endpoints have no tests yet.
