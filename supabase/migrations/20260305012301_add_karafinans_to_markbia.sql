
/*
  # Add Karafinans user to MarkBia brand

  ## Summary
  The user "Karafinans" had no brand memberships, so MarkBia did not appear
  in their brand switcher. This migration adds them as an active member of MarkBia.
*/

INSERT INTO brand_members (brand_id, user_id, joined_at, is_active)
SELECT 
  'c1fbe05a-a1f0-4811-af59-6aa8c79032ba',
  up.id,
  now(),
  true
FROM user_profiles up
WHERE up.username = 'Karafinans'
ON CONFLICT DO NOTHING;
