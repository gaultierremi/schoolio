-- 2026-05-15-100002-create-pdf-extracted-images.sql
-- Audit / dedup table : chaque image PNG extraite d'un PDF, classifiée par Vision.
-- Source of truth pour pipeline B avant agregation dans teacher_questions.

create table public.pdf_extracted_images (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.question_generation_jobs (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  page_number int not null check (page_number > 0),
  storage_path text not null,
  hash text not null,
  width int not null,
  height int not null,
  description_md text,
  confidence numeric(3,2),
  vision_type text,
  latex_if_formula text,
  smiles_if_molecule text,
  topojson_region_hint text,
  created_at timestamptz not null default now()
);

create unique index uniq_pdf_extracted_images_course_hash
  on public.pdf_extracted_images (course_id, hash);

create index idx_pdf_extracted_images_job
  on public.pdf_extracted_images (job_id);

alter table public.pdf_extracted_images enable row level security;

-- Service role only INSERT/UPDATE (cf CLAUDE.md regle 8)
create policy "service_role only writes"
  on public.pdf_extracted_images
  for all
  to service_role
  using (true)
  with check (true);

-- Prof lit les images de ses propres cours
create policy "teacher reads own course images"
  on public.pdf_extracted_images
  for select
  to authenticated
  using (
    course_id in (
      select id from public.courses where teacher_id = auth.uid()
    )
  );
