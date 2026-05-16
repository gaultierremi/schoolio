-- 2026-05-15-200000-add-is-active-to-teacher-questions.sql
-- Sprint 2A : toggle is_active dans ValidatedCard.
-- PR #76 (curation: is_active slider) a ajoute is_active au SELECT du hook
-- et a la route /api/curation/[id]/toggle-active SANS migration DB ->
-- SELECT fail silently avec 'column does not exist', page /accueil/curation
-- restait vide pour tous les profs.
--
-- Fix urgent applique manuellement via Management API (2026-05-15 23:59 UTC),
-- committe ici a posteriori pour versionning.

alter table public.teacher_questions
  add column is_active boolean not null default true;

comment on column public.teacher_questions.is_active is
  'Toggle prof Sprint 2A : question visible dans quiz eleves. Default true (active).';
