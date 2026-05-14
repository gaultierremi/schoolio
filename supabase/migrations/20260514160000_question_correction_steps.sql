-- Side Sprint Prof A.4 — Correction pas-à-pas (colonne gauche du mockup
-- dashboard-eleve-session). À côté du tuteur (A.3, panel d'indices), la
-- correction décompose le bon raisonnement en étapes numérotées, avec
-- annotations sur l'étape spécifique où l'élève s'est typiquement trompé.
--
-- Stockage : JSONB sur teacher_questions (vs nouvelle table) car :
--   - Le contenu est étroitement couplé à une question (1-1)
--   - L'ordre des étapes est implicite par l'array
--   - Pour une dizaine d'étapes max par question, JSONB est plus performant
--     qu'une jointure
--
-- Shape attendu :
--   [
--     { "title": "Convertis le volume en litres",
--       "detail": "V = 250 mL = 0,25 L",
--       "annotation": null },
--     { "title": "Calcule les moles avec n = c × V",
--       "detail": "n = 0,5 × 0,25 = 0,125 mol",
--       "annotation": "Ici tu as oublié de convertir mL → L" },
--     ...
--   ]
--
-- 0-IA-runtime (spec MVP ligne 263) : ces étapes sont pré-baked au moment
-- de la génération de la question OU rédigées par le prof. Pas d'appel
-- Claude au moment où l'élève consulte la correction.

BEGIN;

ALTER TABLE public.teacher_questions
  ADD COLUMN IF NOT EXISTS correction_steps JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Contrainte légère : array JSON max 20 étapes (sinon le PDF original est
-- probablement à re-segmenter, et l'UI ne tient pas).
ALTER TABLE public.teacher_questions
  ADD CONSTRAINT teacher_questions_correction_steps_array_size
  CHECK (jsonb_typeof(correction_steps) = 'array' AND jsonb_array_length(correction_steps) <= 20);

COMMENT ON COLUMN public.teacher_questions.correction_steps IS
  'Array JSONB d''étapes de correction : [{title, detail?, annotation?}]. '
  'Pré-baked, 0-IA-runtime. Fallback côté UI : si vide, render explanation.';

COMMIT;
