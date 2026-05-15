-- 2026-05-15-100001-add-image-url-to-content-snippets.sql
-- Pipeline B : permet d'attacher une image au snippet (pour tuteur socratique).

alter table public.content_snippets
  add column image_url text,
  add column image_hash text;
