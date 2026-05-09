-- Remove timeline_master from user_profiles (legacy duels feature was dropped).
UPDATE user_profiles SET featured_badge = NULL WHERE featured_badge = 'timeline_master';

UPDATE user_profiles
  SET unlocked_badges = (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(unlocked_badges) elem
    WHERE elem != '"timeline_master"'::jsonb
  )
WHERE unlocked_badges @> '["timeline_master"]'::jsonb;
