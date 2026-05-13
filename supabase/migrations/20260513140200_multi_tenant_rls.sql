-- Sprint 0 — T6: Multi-tenant RLS policies + current_user_school_id helper.
-- Tenant scope is additive to existing per-row policies (defense-in-depth).

BEGIN;

-- Helper function: returns school_id of the currently authenticated user, or NULL.
-- SECURITY DEFINER + empty search_path forces fully-qualified table references
-- (defense against search_path manipulation attacks).
CREATE OR REPLACE FUNCTION public.current_user_school_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT school_id
  FROM public.user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_school_id() TO authenticated;

-- Tighten schools read policy: only see your own school.
DROP POLICY IF EXISTS "schools_read_authenticated_placeholder" ON public.schools;

CREATE POLICY "schools_read_own"
  ON public.schools FOR SELECT
  TO authenticated
  USING (id = public.current_user_school_id());

-- Additive tenant-scope policies on existing RLS-enabled tables.
-- school_id IS NULL is permitted in USING (legacy rows pre-backfill — T7 closes that gap).

CREATE POLICY "classes_tenant_scope"
  ON public.classes FOR ALL
  TO authenticated
  USING (school_id IS NULL OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY "courses_tenant_scope"
  ON public.courses FOR ALL
  TO authenticated
  USING (school_id IS NULL OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY "teacher_questions_tenant_scope"
  ON public.teacher_questions FOR ALL
  TO authenticated
  USING (school_id IS NULL OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY "assignments_tenant_scope"
  ON public.assignments FOR ALL
  TO authenticated
  USING (school_id IS NULL OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY "live_sessions_tenant_scope"
  ON public.live_sessions FOR ALL
  TO authenticated
  USING (school_id IS NULL OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

-- teacher_schedule_slots and teacher_organization_tags also get scoped,
-- but their existing per-row policies (if any) remain.
CREATE POLICY "teacher_schedule_slots_tenant_scope"
  ON public.teacher_schedule_slots FOR ALL
  TO authenticated
  USING (school_id IS NULL OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY "teacher_organization_tags_tenant_scope"
  ON public.teacher_organization_tags FOR ALL
  TO authenticated
  USING (school_id IS NULL OR school_id = public.current_user_school_id())
  WITH CHECK (school_id = public.current_user_school_id());

COMMIT;
