-- Hardening on top of 001_initial_schema.sql. Applied to MAEEN as "harden_privileges_and_pdf_limit".
-- No DROP/TRUNCATE operations are used and no data is touched.

-- Supabase grants anon and authenticated every table privilege by default, including
-- TRUNCATE, which RLS does not cover. The frontend never talks to PostgreSQL directly and
-- the backends write with the service role, so:
--   anon          -> no access at all
--   authenticated -> SELECT only (RLS still limits it to the user's own rows)
revoke all on table
  public.contracts,
  public.analysis_results,
  public.document_chunks,
  public.chat_history
from anon, authenticated;

grant select on table
  public.contracts,
  public.analysis_results,
  public.document_chunks,
  public.chat_history
to authenticated;

-- Cap contract PDFs at 20 MB (the bucket previously fell back to the 50 MB global default).
update storage.buckets
set file_size_limit = 20971520
where id = 'contract-pdfs';
