-- ============================================================================
-- Add CHECK constraint on class_attendance_records.period.
--
-- WHY: Audit finding [DB] class_attendance_records.period sans CHECK >= 0.
-- Prevent absurd values (negative or too high) for school periods.
-- Reference: board admin tag audit-2026-05-10.
--
-- HOW: Adds a CHECK constraint 'period_valid_range' ensuring 0 <= period <= 24.
-- A similar constraint was added in 20260511040000 as 'class_attendance_records_period_range';
-- we rename it here to follow the requested naming convention.
-- ============================================================================

-- Pre-migration verification:
-- SELECT COUNT(*) FROM class_attendance_records WHERE period < 0 OR period > 24;
-- Expected result: 0.

ALTER TABLE class_attendance_records
  DROP CONSTRAINT IF EXISTS class_attendance_records_period_range,
  DROP CONSTRAINT IF EXISTS period_valid_range;

ALTER TABLE class_attendance_records
  ADD CONSTRAINT period_valid_range
  CHECK (period >= 0 AND period <= 24);
