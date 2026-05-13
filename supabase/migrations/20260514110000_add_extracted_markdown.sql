-- Sprint 1 refactor — store the extracted markdown alongside the ingestion job.
-- The markdown is a strategic asset, not a throwaway intermediate :
--   - hint banks (Sprint 1.5+) need source text to ground hints in verbatim quotes
--   - tutor IA runtime (Sprint 3) references passages from this stored text
--   - quick revisions (Sprint 4) generate cards from chunks of this text
--   - source_quote provenance enforcement requires the text to compare against
--   - re-generation of theory for an already-extracted concept doesn't re-call
--     Anthropic — it reads from this column

BEGIN;

ALTER TABLE public.ingestion_jobs
  ADD COLUMN IF NOT EXISTS extracted_markdown TEXT;

-- No CHECK on length — a full FW-B syllabus markdown can run 30-100K characters.
-- TEXT in Postgres has no hard limit (capped by 1GB row size which is fine here).

COMMIT;
