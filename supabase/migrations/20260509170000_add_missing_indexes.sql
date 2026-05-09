CREATE INDEX IF NOT EXISTS idx_assignments_due_date
  ON assignments(due_date);

CREATE INDEX IF NOT EXISTS idx_assignment_completions_student_status
  ON assignment_completions(student_user_id, status);
