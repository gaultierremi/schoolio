-- Side Sprint Prof — Année académique + audit log changements classes
--
-- Pose les rails pour des stats direction fiables 6-12 mois plus tard :
--   1. Ancrage temporel par cohorte (academic_year YYYY/YYYY)
--   2. Audit log immutable des changements de classes (renommage, archive,
--      changement de cohorte parente, etc.) pour ne JAMAIS perdre
--      l'historique côté analyse longitudinale.
--
-- Convention : année académique FWB démarre 1er août. Une classe créée
-- entre 1er août YYYY et 31 juillet YYYY+1 appartient à academic_year
-- 'YYYY/YYYY+1'. Logique applicative dans lib/dates.ts.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. classes.academic_year (NULL toléré pour future flexibilité,
--    rempli systématiquement à la création par l'app)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS academic_year TEXT
  CHECK (academic_year IS NULL OR academic_year ~ '^\d{4}/\d{4}$');

-- Backfill : déduit l'année académique du created_at des classes existantes.
-- Si created_at en août-décembre (mois >= 8), année = "YYYY/YYYY+1".
-- Si created_at en janvier-juillet (mois <= 7), année = "YYYY-1/YYYY".
UPDATE public.classes
SET academic_year = CASE
  WHEN EXTRACT(MONTH FROM created_at) >= 8
    THEN EXTRACT(YEAR FROM created_at)::INT::TEXT || '/' || (EXTRACT(YEAR FROM created_at)::INT + 1)::TEXT
  ELSE (EXTRACT(YEAR FROM created_at)::INT - 1)::TEXT || '/' || EXTRACT(YEAR FROM created_at)::INT::TEXT
END
WHERE academic_year IS NULL;

CREATE INDEX IF NOT EXISTS idx_classes_academic_year
  ON public.classes(academic_year);

COMMENT ON COLUMN public.classes.academic_year IS
  'Année académique FWB au format YYYY/YYYY (ex: 2025/2026). Démarrage 1er août. Auto-rempli à la création (cf. lib/dates.ts). Immuable conceptuellement — capturé dans class_audit_log si modifié.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. class_audit_log — historique immutable des changements de classes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.class_audit_log (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID         NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  changed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  changed_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  field       TEXT         NOT NULL CHECK (length(field) BETWEEN 1 AND 50),
  old_value   TEXT,
  new_value   TEXT
);

CREATE INDEX IF NOT EXISTS idx_class_audit_log_class
  ON public.class_audit_log(class_id, changed_at DESC);

-- Trigger function : capture les changements des champs sensibles. Skipping
-- updated_at qui change à chaque update (bruit). NEW/OLD IS DISTINCT FROM
-- gère bien les NULL ↔ valeur.
CREATE OR REPLACE FUNCTION public.log_class_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.class_audit_log(class_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'name', OLD.name, NEW.name);
  END IF;
  IF NEW.level IS DISTINCT FROM OLD.level THEN
    INSERT INTO public.class_audit_log(class_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'level', OLD.level, NEW.level);
  END IF;
  IF NEW.subject IS DISTINCT FROM OLD.subject THEN
    INSERT INTO public.class_audit_log(class_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'subject', OLD.subject, NEW.subject);
  END IF;
  IF NEW.parent_class_id IS DISTINCT FROM OLD.parent_class_id THEN
    INSERT INTO public.class_audit_log(class_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'parent_class_id', OLD.parent_class_id::TEXT, NEW.parent_class_id::TEXT);
  END IF;
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    INSERT INTO public.class_audit_log(class_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'archived_at', OLD.archived_at::TEXT, NEW.archived_at::TEXT);
  END IF;
  IF NEW.academic_year IS DISTINCT FROM OLD.academic_year THEN
    INSERT INTO public.class_audit_log(class_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'academic_year', OLD.academic_year, NEW.academic_year);
  END IF;
  IF NEW.invitation_expires_at IS DISTINCT FROM OLD.invitation_expires_at THEN
    INSERT INTO public.class_audit_log(class_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'invitation_expires_at', OLD.invitation_expires_at::TEXT, NEW.invitation_expires_at::TEXT);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER classes_audit_changes
  AFTER UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.log_class_change();

-- RLS : prof lit l'historique de ses propres classes. Pas d'écriture
-- explicite (seul le trigger SECURITY DEFINER peut insérer, en bypassant RLS).
ALTER TABLE public.class_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class_audit_log_teacher_read"
  ON public.class_audit_log FOR SELECT TO authenticated
  USING (class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid()));

CREATE POLICY "class_audit_log_no_user_insert"
  ON public.class_audit_log FOR INSERT TO authenticated
  WITH CHECK (FALSE);

CREATE POLICY "class_audit_log_no_user_update"
  ON public.class_audit_log FOR UPDATE TO authenticated
  USING (FALSE);

CREATE POLICY "class_audit_log_no_user_delete"
  ON public.class_audit_log FOR DELETE TO authenticated
  USING (FALSE);

COMMIT;
