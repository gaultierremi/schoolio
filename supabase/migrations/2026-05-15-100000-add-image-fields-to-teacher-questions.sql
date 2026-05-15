-- 2026-05-15-100000-add-image-fields-to-teacher-questions.sql
-- Pipeline B (PDF images) : ajout colonnes image-aware sur teacher_questions.
-- Expand-contract migration : on ajoute des colonnes nullable, anciennes
-- intactes. Code écrit dans les deux jusqu'au déploiement N+2 (drop des anciennes).

alter table public.teacher_questions
  add column image_url text,
  add column image_hash text,
  add column image_page_number int,
  add column image_description_md text,
  add column image_confidence numeric(3,2),
  add column vision_type text,
  add column formula_latex text,
  add column formula_mathml text,
  add column molecule_smiles text,
  add column geo_topojson_path text,
  add column needs_review boolean not null default false;

comment on column public.teacher_questions.vision_type is
  'Un des 71 types definis dans lib/pdf/image-types.ts (IMAGE_TYPES).';

comment on column public.teacher_questions.needs_review is
  'Set true quand image_confidence < 0.8 lors de la generation. Prof valide avant publication.';

create index idx_teacher_questions_needs_review
  on public.teacher_questions (teacher_id, needs_review)
  where needs_review = true;
