ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS student_onboarding_dismissed_at TIMESTAMPTZ;
