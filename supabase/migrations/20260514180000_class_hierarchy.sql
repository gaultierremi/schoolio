-- Side Sprint Prof — Hiérarchie classes : cohorte (4ème D) + sous-classes matière (4D Maths)
--
-- Modèle 2 niveaux :
--   - Cohorte : parent_class_id IS NULL, regroupe les élèves d'une année/section
--               (ex: "4ème D"). Subject généralement NULL (mais autorisé pour
--               compat avec les classes existantes mono-matière).
--   - Sous-classe matière : parent_class_id IS NOT NULL, branche d'une cohorte
--                            (ex: "4D Maths"). Subject obligatoire conceptuellement
--                            mais pas enforced DB (l'app la valide).
--
-- Membership = option 2 explicite : pas de cascade auto, l'élève rejoint
-- chaque sous-classe via son propre invite_code. La cohorte peut elle aussi
-- avoir des memberships directs (homeroom).
--
-- Anti-loop : un parent ne peut pas être lui-même enfant (enforce profondeur
-- max 1 via app — pas de constraint trigger récursif pour la simplicité).
-- Le CHECK parent_class_id != id bloque le self-parent évident.

BEGIN;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS parent_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_no_self_parent
  CHECK (parent_class_id IS NULL OR parent_class_id != id);

CREATE INDEX IF NOT EXISTS idx_classes_parent
  ON public.classes(parent_class_id) WHERE parent_class_id IS NOT NULL;

COMMENT ON COLUMN public.classes.parent_class_id IS
  'Cohorte parente. NULL = la classe est elle-même une cohorte. Sinon = sous-classe matière, parent doit être une cohorte (parent_class_id null). Profondeur max 1, enforced app-side.';

COMMIT;
