-- Raise the contract PDF cap from 20 MB (set in 002) to 50 MB, per Faisal.
-- Applied to MAEEN as "pdf_limit_50mb". The table privileges from 002 stay as they are.
update storage.buckets
set file_size_limit = 52428800
where id = 'contract-pdfs';
