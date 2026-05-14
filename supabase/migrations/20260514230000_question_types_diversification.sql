-- Side Sprint Prof — Diversification types questions selon spec MVP
--
-- Aujourd'hui teacher_questions.type accepte 'mcq'|'truefalse' uniquement.
-- Spec MVP §3 prescrit : QCM, numeric, short_text exact, short_text fuzzy,
-- multi-step structuré.
--
-- Cette migration étend le CHECK type + ajoute les colonnes nécessaires
-- pour grader chaque type côté serveur sans relancer Claude.
--
-- Champs ajoutés (NULL si le type ne les utilise pas) :
--   expected_numeric_answer  NUMERIC   — pour type='numeric'
--   numeric_tolerance        NUMERIC   — pour type='numeric' (±, defaut 0.01)
--   expected_text_answers    TEXT[]    — pour type='short_text', accepte plusieurs réponses
--   numeric_unit             TEXT      — pour type='numeric' (e.g. 'g', 'mol/L')
--
-- multi-step : sera modélisé via la table existante `exercise_steps` + une
-- entrée parent dans `exercises`. Pas dans cette migration (deferred Sprint
-- 3 du spec).
--
-- Index : on garde simple, pas d'index dédié — les colonnes sont scoped à un
-- type spécifique, les requêtes vont déjà filtrer par type/course.

BEGIN;

-- 1. Étendre le CHECK constraint sur type
-- Le constraint existant est probablement dans la table de base — on le
-- droppe défensivement puis re-crée avec les nouvelles valeurs.
-- Drop par nom connu (Supabase auto-nomme avec _check suffix sur les CHECK columns)
ALTER TABLE public.teacher_questions DROP CONSTRAINT IF EXISTS teacher_questions_type_check;

ALTER TABLE public.teacher_questions
  ADD CONSTRAINT teacher_questions_type_check
  CHECK (type IN ('mcq', 'truefalse', 'numeric', 'short_text', 'multi_step'));

-- 2. Colonnes pour grading typé
ALTER TABLE public.teacher_questions
  ADD COLUMN IF NOT EXISTS expected_numeric_answer NUMERIC,
  ADD COLUMN IF NOT EXISTS numeric_tolerance       NUMERIC,
  ADD COLUMN IF NOT EXISTS numeric_unit            TEXT,
  ADD COLUMN IF NOT EXISTS expected_text_answers   TEXT[];

-- 3. Constraints de cohérence par type
-- Ne pas enforcer trop strictement (data legacy peut violer). On documente
-- via comment mais on n'ajoute pas de CHECK croisé (trop risqué pour migration).
COMMENT ON COLUMN public.teacher_questions.expected_numeric_answer IS
  'Réponse attendue pour type=''numeric''. NULL pour autres types. Le grading server-side compare student_answer avec tolérance.';
COMMENT ON COLUMN public.teacher_questions.numeric_tolerance IS
  'Tolérance ± pour le grading numeric. Si NULL, defaut 0.01 absolu. Si > 0, comparé en valeur absolue.';
COMMENT ON COLUMN public.teacher_questions.numeric_unit IS
  'Unité attendue (e.g. "g", "mol/L", "kg/m³"). Affichée à l''élève. NULL si sans unité.';
COMMENT ON COLUMN public.teacher_questions.expected_text_answers IS
  'Array de réponses acceptables pour type=''short_text''. Match exact après normalize (lowercase, trim, strip accents). NULL pour autres types.';

COMMIT;
