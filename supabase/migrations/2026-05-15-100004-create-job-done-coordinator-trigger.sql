-- 2026-05-15-100004-create-job-done-coordinator-trigger.sql
-- "Le dernier qui finit marque done" : trigger atomique cote DB.
-- Pas de race condition entre pipelines paralleles A et B.
-- Si pipeline B disabled (image_batches_total IS NULL), done des que A finit.

create or replace function check_job_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW.text_chapters_total is not null
     and NEW.text_chapters_completed = NEW.text_chapters_total
     and (NEW.image_batches_total is null
          or NEW.image_batches_completed = NEW.image_batches_total)
     and NEW.status not in ('done', 'failed')
  then
    NEW.status := 'done';
    NEW.phase := 'done';
    NEW.completed_at := now();
  end if;
  return NEW;
end;
$$;

create trigger trg_job_auto_done
  before update on public.question_generation_jobs
  for each row execute function check_job_completion();
