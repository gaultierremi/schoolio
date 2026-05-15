-- 2026-05-15-100003-add-pipeline-tracking-to-jobs.sql
-- Tracking separe pipeline A (text chapters) vs pipeline B (image batches).
-- Permet UI stepper de differencier les 2 progressions.
-- Code legacy continue a ecrire dans worker_count/workers_completed (expand-contract).

alter table public.question_generation_jobs
  add column text_chapters_total int,
  add column text_chapters_completed int not null default 0,
  add column image_batches_total int,
  add column image_batches_completed int not null default 0;

comment on column public.question_generation_jobs.text_chapters_total is
  'Pipeline A : nombre total de chapitres identifies par Haiku TOC.';
comment on column public.question_generation_jobs.image_batches_total is
  'Pipeline B : nombre total de batches images. NULL = pipeline B disabled (feature flag OFF).';
