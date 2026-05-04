-- Ajoute les préférences de son et les champs de suivi de série aux profils utilisateur :
-- sound_enabled indique si les effets sonores sont activés.
-- streak_freezes_used compte le nombre de gels de série utilisés sur la période courante.
-- streak_freezes_reset_at indique quand le compteur de gels de série doit être réinitialisé.
-- last_streak_check garde la date du dernier contrôle de série.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS streak_freezes_used INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS streak_freezes_reset_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_streak_check TIMESTAMP WITH TIME ZONE;
