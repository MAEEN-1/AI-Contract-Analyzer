-- Run with a privileged connection after applying the migration.
-- These assertions fail loudly when the target schema is incompatible.

do $$
declare
  v_count bigint;
  v_def text;
begin
  select count(*) into v_count from information_schema.tables
    where table_schema = 'public' and table_name in ('contracts','analysis_results','document_chunks','chat_history');
  if v_count <> 4 then raise exception 'Expected 4 application tables, got %', v_count; end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'public.contracts'::regclass and contype = 'c' and conname like '%status%';
  if v_def is null or v_def not like '%uploaded%' or v_def not like '%processing%' or v_def not like '%completed%' or v_def not like '%failed%' then
    raise exception 'contracts.status check constraint is missing or incomplete';
  end if;

  if not exists (select 1 from pg_attribute where attrelid = 'public.document_chunks'::regclass and attname = 'embedding') then
    raise exception 'document_chunks.embedding is missing';
  end if;

  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'document_chunks_embedding_hnsw_idx') then
    raise exception 'HNSW vector index is missing';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contracts' and policyname = 'contracts_select_own') then
    raise exception 'contracts owner SELECT policy is missing';
  end if;

  if not exists (select 1 from storage.buckets where id = 'contract-pdfs' and public = false and 'application/pdf' = any(allowed_mime_types)) then
    raise exception 'contract-pdfs bucket is not private or does not allow application/pdf';
  end if;

  if not exists (select 1 from storage.buckets where id = 'contract-pdfs' and file_size_limit = 52428800) then
    raise exception 'contract-pdfs bucket is missing its 50 MB file size limit (003)';
  end if;

  -- 002: anon has no table access; authenticated is read-only (RLS filters rows).
  select count(*) into v_count
  from unnest(array['public.contracts','public.analysis_results','public.document_chunks','public.chat_history']) t
  cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p
  where has_table_privilege('anon', t, p)
     or (p <> 'SELECT' and has_table_privilege('authenticated', t, p))
     or (p = 'SELECT' and not has_table_privilege('authenticated', t, p));
  if v_count <> 0 then
    raise exception 'Table privileges for anon/authenticated are wider or narrower than migration 002 expects (% mismatches)', v_count;
  end if;
end $$;

-- Behavioral checks to run with two authenticated JWT contexts:
-- User A must see only A's contracts, analyses, chunks, and chats.
-- User A must see zero rows belonging to User B.
-- Anonymous role must see zero protected rows.
-- Authenticated INSERT/UPDATE/DELETE must fail (no write policies).
-- Deleting a contract must delete dependent analyses, chunks, and chats.
-- Updating contracts/analysis_results must change updated_at.
select 'schema verification passed' as result;
