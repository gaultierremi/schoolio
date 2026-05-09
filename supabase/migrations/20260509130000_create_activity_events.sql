create table activity_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_id uuid,
  actor_type text not null check (actor_type in ('student','teacher','system')),
  target_type text,
  target_id uuid,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_events_teacher_created on activity_events (teacher_id, created_at desc);

alter table activity_events enable row level security;

create policy "teacher_select_own_events" on activity_events for select using (teacher_id = auth.uid());
create policy "service_insert_events" on activity_events for insert with check (true);
