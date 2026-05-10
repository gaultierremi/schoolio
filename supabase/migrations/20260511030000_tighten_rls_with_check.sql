-- ============================================================================
-- Tighten WITH CHECK on policies that previously only verified student_user_id.
--
-- WHY: three tables let any authenticated user insert rows for any
-- (assignment | session | event) as long as the row carried their own user
-- id. The class-membership / session-ownership relationship was NOT enforced
-- at the RLS layer. The API routes do enforce it, but the anon-key client
-- can bypass the API and write directly via PostgREST.
--
-- Concrete attacks closed by this migration:
--   * assignment_question_answers: a student in class A can insert answers
--     against an assignment in class B, polluting that teacher's analytics
--     and the "top errors" dashboard.
--   * live_question_answers: same shape, against any live session UUID
--     the attacker can guess or scrape from the (currently anon-readable)
--     live_sessions table.
--   * activity_events: WITH CHECK (true) lets any caller spoof events with
--     arbitrary teacher_id / actor_id / event_type. Floods feeds.
--
-- The application code path is unaffected: all server routes write through
-- the service-role admin client, which bypasses RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- assignment_question_answers
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "student_manages_own_answers" ON assignment_question_answers;

CREATE POLICY "student_manages_own_answers"
  ON assignment_question_answers FOR ALL
  USING (student_user_id = auth.uid())
  WITH CHECK (
    student_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM assignments a
        JOIN class_memberships cm ON cm.class_id = a.class_id
       WHERE a.id = assignment_question_answers.assignment_id
         AND cm.student_user_id = auth.uid()
         AND cm.status = 'active'
    )
  );

-- ----------------------------------------------------------------------------
-- live_question_answers
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Students insert their own answers" ON live_question_answers;

CREATE POLICY "Students insert their own answers"
  ON live_question_answers FOR INSERT
  WITH CHECK (
    student_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM live_sessions ls
        LEFT JOIN class_memberships cm
          ON cm.class_id = ls.class_id
         AND cm.student_user_id = auth.uid()
         AND cm.status = 'active'
       WHERE ls.id = live_question_answers.live_session_id
         AND (ls.class_id IS NULL OR cm.id IS NOT NULL)
    )
  );

-- ----------------------------------------------------------------------------
-- activity_events
-- ----------------------------------------------------------------------------
-- Previous policy was WITH CHECK (true). All legitimate writes come from
-- lib/activity/log.ts using the service-role client, which bypasses RLS.
-- Set the policy to WITH CHECK (false) so non-service callers cannot insert.
DROP POLICY IF EXISTS "service_insert_events" ON activity_events;

CREATE POLICY "service_only_insert_events"
  ON activity_events FOR INSERT
  WITH CHECK (false);
