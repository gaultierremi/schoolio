-- Ajoute le flag beta_tester à user_profiles.
--
-- WHY: l'accès à POST /api/beta-feedback est conditionné à beta_tester = true
-- OU email admin. Cela évite que n'importe quel utilisateur authentifié
-- puisse inonder la table beta_feedback.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS beta_tester BOOLEAN NOT NULL DEFAULT false;

-- Seed : admins + Adrien (premier beta testeur terrain, DIC Liège)
UPDATE user_profiles
SET beta_tester = true
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN (
    'gaultierremi@gmail.com',
    'alex.bourdouxhe@gmail.com',
    'christophe.lecrenier@gmail.com',
    'presti013@gmail.com',
    'Adrien.jehaes@gmail.com'
  )
);
