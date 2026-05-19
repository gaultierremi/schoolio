-- Sprint 6 hot-fix hard review B2 — Durcir RLS hint_evaluations avec tenant check.
--
-- Issue : les policies INSERT/UPDATE de la table hint_evaluations
-- (migration 20260520100000) n'enforcent que `user_id = auth.uid()` mais
-- pas le `school_id` en WITH CHECK. Un client Postgrest direct pourrait
-- INSERT une ligne avec un school_id arbitraire (l'API admin sécurise déjà
-- mais c'est défense en profondeur, conforme CLAUDE.md règle #8).
--
-- Fix : DROP + CREATE policies avec tenant check explicite.

BEGIN;

DROP POLICY IF EXISTS "hint_evaluations_student_insert_own" ON public.hint_evaluations;
DROP POLICY IF EXISTS "hint_evaluations_student_update_own" ON public.hint_evaluations;

CREATE POLICY "hint_evaluations_student_insert_own"
  ON public.hint_evaluations FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND school_id = public.current_user_school_id()
  );

CREATE POLICY "hint_evaluations_student_update_own"
  ON public.hint_evaluations FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND school_id = public.current_user_school_id()
  );

COMMIT;
