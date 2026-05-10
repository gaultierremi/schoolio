-- ============================================================================
-- Enable RLS on the `courses` table.
--
-- WHY: 20260505090000_create_courses.sql:54 explicitly DISABLED RLS on this
-- table. With RLS off, any anon-key client could SELECT/INSERT/UPDATE/DELETE
-- ALL teachers' courses bypassing PostgREST. The PDFs themselves are gated
-- by storage policies, but the metadata (titles, organisation_tags, hash,
-- pdf_storage_path) was wide open. Confirmed in audit on 2026-05-10.
--
-- BLOCKER for B2B école: a school RFP that includes RGPD + data-isolation
-- requirements cannot pass with this open.
--
-- HOW: re-enable RLS, then add policies that match the existing access
-- patterns:
--   - teacher manages (CRUD) their own courses (matched on teacher_id).
--   - student reads (SELECT only) courses linked to active assignments
--     in their classes.
--   - service-role bypasses RLS as usual; all API routes that touch
--     `courses` already use the admin client, so no application code change
--     is needed by this migration.
-- ============================================================================

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teacher_manages_own_courses"
  ON courses FOR ALL
  USING (teacher_id = auth.uid());

CREATE POLICY "student_reads_assigned_courses"
  ON courses FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM assignments a
        JOIN class_memberships cm ON cm.class_id = a.class_id
       WHERE a.resource_id = courses.id
         AND a.archived_at IS NULL
         AND cm.student_user_id = auth.uid()
         AND cm.status = 'active'
    )
  );
