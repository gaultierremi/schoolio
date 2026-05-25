-- Audit hard review 2026-05-25 P1 — RGPD compliance
-- CLAUDE.md regle #11 : FK avec ON DELETE explicite (jamais NO ACTION).
--
-- 5 FK manquaient leur clause ON DELETE -> bloqueraient la suppression
-- d un user au moment de l exercer le droit RGPD a l effacement.
--
-- Strategie : ON DELETE SET NULL (anonymise au lieu de cascader la suppression).
-- - Conforme CLAUDE.md regle #23 never-DELETE : on garde les donnees historiques
--   (assignments, exercises, attendance records, random picks restent en DB
--   pour la lecture/audit, juste sans plus d attribution a l ancien user).
-- - RLS policies existantes filtrent sur ces colonnes (e.g. assigned_by = auth.uid())
--   -> apres SET NULL le row devient inaccessible pour tout user vivant, ce qui
--   anonymise correctement.
--
-- Pre-requis : les colonnes NOT NULL doivent etre rendues NULLable.
-- Pas de risque sur les donnees existantes : aucun row n est modifie ici.
--
-- Idempotence : DROP CONSTRAINT IF EXISTS + ADD permet replays sans erreur.

BEGIN;

-- 1. assignments.assigned_by (NOT NULL -> NULL + SET NULL on delete)
ALTER TABLE public.assignments ALTER COLUMN assigned_by DROP NOT NULL;
ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_assigned_by_fkey;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assignments.assigned_by IS
  'Auteur du devoir. SET NULL apres suppression user (RGPD) ; les assignments restent (never-DELETE).';

-- 2. exercises.teacher_id (NOT NULL -> NULL + SET NULL on delete)
ALTER TABLE public.exercises ALTER COLUMN teacher_id DROP NOT NULL;
ALTER TABLE public.exercises DROP CONSTRAINT IF EXISTS exercises_teacher_id_fkey;
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.exercises.teacher_id IS
  'Prof auteur. SET NULL apres suppression user (RGPD) ; exercices restent en DB.';

-- 3. exercises.validated_by (deja NULL OK, juste ajouter ON DELETE SET NULL)
ALTER TABLE public.exercises DROP CONSTRAINT IF EXISTS exercises_validated_by_fkey;
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_validated_by_fkey
  FOREIGN KEY (validated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. class_attendance_records.recorded_by (NOT NULL -> NULL + SET NULL on delete)
ALTER TABLE public.class_attendance_records ALTER COLUMN recorded_by DROP NOT NULL;
ALTER TABLE public.class_attendance_records DROP CONSTRAINT IF EXISTS class_attendance_records_recorded_by_fkey;
ALTER TABLE public.class_attendance_records
  ADD CONSTRAINT class_attendance_records_recorded_by_fkey
  FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.class_attendance_records.recorded_by IS
  'Prof qui a enregistre la presence. SET NULL apres suppression user (RGPD).';

-- 5. student_random_picks.picked_by (NOT NULL -> NULL + SET NULL on delete)
ALTER TABLE public.student_random_picks ALTER COLUMN picked_by DROP NOT NULL;
ALTER TABLE public.student_random_picks DROP CONSTRAINT IF EXISTS student_random_picks_picked_by_fkey;
ALTER TABLE public.student_random_picks
  ADD CONSTRAINT student_random_picks_picked_by_fkey
  FOREIGN KEY (picked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.student_random_picks.picked_by IS
  'Prof qui a tire au sort. SET NULL apres suppression user (RGPD).';

COMMIT;
