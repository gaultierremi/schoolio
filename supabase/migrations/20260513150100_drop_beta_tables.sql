-- Sprint 0 — Drop beta whitelist tables (out of MVP scope per spec §2.2)
-- Replaced by school-based tenanting + Google OAuth (Sprint 5).

BEGIN;

DROP TABLE IF EXISTS public.beta_access_requests CASCADE;
DROP TABLE IF EXISTS public.beta_whitelist CASCADE;

COMMIT;
