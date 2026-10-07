-- AI Contract Analyzer database foundation
-- Safe to run on a new Supabase project. No DROP/TRUNCATE operations are used.

create extension if not exists vector with schema extensions;

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_id_user_id_key unique (id, user_id)
);

create table if not exists public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  analysis jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  chunk_text text not null,
  page_number integer check (page_number is null or page_number > 0),
  -- Confirmed against the AI backend before production rollout. See docs/DATABASE_SCHEMA.md.
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_history (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint chat_history_contract_user_fkey
    foreign key (contract_id, user_id)
    references public.contracts (id, user_id)
    on delete cascade
);

create index if not exists contracts_user_id_idx on public.contracts (user_id);
create index if not exists contracts_user_status_idx on public.contracts (user_id, status);
create index if not exists analysis_results_contract_id_idx on public.analysis_results (contract_id);
create index if not exists document_chunks_contract_id_idx on public.document_chunks (contract_id);
create index if not exists chat_history_contract_created_at_idx on public.chat_history (contract_id, created_at desc);
create index if not exists chat_history_user_id_idx on public.chat_history (user_id);
create index if not exists chat_history_contract_user_idx on public.chat_history (contract_id, user_id);
create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contracts_set_updated_at on public.contracts;
create trigger contracts_set_updated_at
before update on public.contracts
for each row execute function public.set_updated_at();

drop trigger if exists analysis_results_set_updated_at on public.analysis_results;
create trigger analysis_results_set_updated_at
before update on public.analysis_results
for each row execute function public.set_updated_at();

alter table public.contracts enable row level security;
alter table public.analysis_results enable row level security;
alter table public.document_chunks enable row level security;
alter table public.chat_history enable row level security;

drop policy if exists contracts_select_own on public.contracts;
create policy contracts_select_own
on public.contracts for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists analysis_results_select_own on public.analysis_results;
create policy analysis_results_select_own
on public.analysis_results for select to authenticated
using (exists (
  select 1 from public.contracts c
  where c.id = analysis_results.contract_id
    and c.user_id = (select auth.uid())
));

drop policy if exists document_chunks_select_own on public.document_chunks;
create policy document_chunks_select_own
on public.document_chunks for select to authenticated
using (exists (
  select 1 from public.contracts c
  where c.id = document_chunks.contract_id
    and c.user_id = (select auth.uid())
));

drop policy if exists chat_history_select_own on public.chat_history;
create policy chat_history_select_own
on public.chat_history for select to authenticated
using (user_id = (select auth.uid()));

-- Private bucket. Backends use SUPABASE_SERVICE_ROLE_KEY for upload, retrieval and deletion.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('contract-pdfs', 'contract-pdfs', false, array['application/pdf']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  allowed_mime_types = excluded.allowed_mime_types;

-- No authenticated storage policies are granted intentionally: browser storage access is denied.
-- The service role bypasses RLS for trusted General/AI Backend operations.

comment on table public.contracts is 'PDF contract metadata; writes owned by General Backend.';
comment on table public.analysis_results is 'AI analysis JSON returned to and persisted by General Backend.';
comment on table public.document_chunks is 'Extracted chunks and optional embeddings; writes owned by AI Backend.';
comment on table public.chat_history is 'Contract chat records and source JSON; writes owned by General Backend.';
comment on column public.contracts.storage_path is 'Private contract-pdfs object path: {user_id}/{contract_id}/{file_name}.';
comment on column public.document_chunks.embedding is '1536-dimensional cosine-search vector; confirm model/dimension with AI Backend before production.';

-- Deliberately no INSERT/UPDATE/DELETE policies are created for authenticated users.
-- This prevents Frontend direct writes; trusted server credentials bypass RLS.

-- Optional retrieval helper for the AI Backend (call with service role):
-- select id, contract_id, chunk_text, page_number, 1 - (embedding <=> $1) as similarity
-- from public.document_chunks where contract_id = $2 and embedding is not null
-- order by embedding <=> $1 limit 10;
