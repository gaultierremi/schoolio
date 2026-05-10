-- ============================================================================
-- Add CHECK constraints that the application layer was enforcing alone.
--
-- WHY: API routes already cap these values, but if a service-role client
-- ever writes a malformed value (e.g. via a buggy script or a bypass of the
-- API), the database would happily accept it. Belt-and-braces: encode the
-- invariant where it cannot be skipped.
-- ============================================================================

-- assignment_completions.score is numeric(5,2) so the column allows up to
-- 999.99. The /api/student/assignments/[id]/finish-quiz handler caps to
-- [0, 100] but a future trust-the-client cheat could write 999. Pin it.
ALTER TABLE assignment_completions
  ADD CONSTRAINT assignment_completions_score_range
  CHECK (score IS NULL OR (score >= 0 AND score <= 100));

-- class_attendance_records.period was unbounded INT.
-- Schools have at most ~12 periods per day; allow up to 24 for flexibility
-- (extended schedules, special events, etc.).
ALTER TABLE class_attendance_records
  ADD CONSTRAINT class_attendance_records_period_range
  CHECK (period >= 0 AND period <= 24);
