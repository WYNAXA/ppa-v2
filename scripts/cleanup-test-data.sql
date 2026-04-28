-- ─────────────────────────────────────────────────────────
-- PPA V2 Test Data Cleanup Script
-- Generated: 2026-04-28T06:34:11.795Z
-- Run in Supabase SQL editor or via psql
-- ─────────────────────────────────────────────────────────

-- 1. Achievements
DELETE FROM player_achievements
WHERE user_id IN (
  SELECT id FROM profiles WHERE email LIKE '%@padeltest.com'
);

-- 2. Match result votes
DELETE FROM match_result_votes
WHERE match_result_id IN (
  SELECT mr.id FROM match_results mr
  JOIN matches m ON mr.match_id = m.id
  WHERE m.group_id = '1701439b-69c1-4e83-8587-21c9f4683aa3'
);

-- 3. Match results
DELETE FROM match_results
WHERE match_id IN (
  SELECT id FROM matches WHERE group_id = '1701439b-69c1-4e83-8587-21c9f4683aa3'
);

-- 4. Matches
DELETE FROM matches
WHERE group_id = '1701439b-69c1-4e83-8587-21c9f4683aa3';

-- 5. League standings
DELETE FROM league_standings
WHERE league_id IN (SELECT id FROM leagues WHERE name LIKE '[TEST]%');

-- 6. League members
DELETE FROM league_members
WHERE league_id IN (SELECT id FROM leagues WHERE name LIKE '[TEST]%');

-- 7. Leagues
DELETE FROM leagues WHERE name LIKE '[TEST]%';

-- 8. Poll responses
DELETE FROM poll_responses
WHERE poll_id IN (SELECT id FROM polls WHERE title LIKE '[TEST]%');

-- 9. Polls
DELETE FROM polls WHERE title LIKE '[TEST]%';

-- 10. Event attendees
DELETE FROM event_attendees
WHERE event_id IN (SELECT id FROM events WHERE group_id = '1701439b-69c1-4e83-8587-21c9f4683aa3');

-- 11. Events
DELETE FROM events WHERE group_id = '1701439b-69c1-4e83-8587-21c9f4683aa3';

-- 12. Group members
DELETE FROM group_members WHERE group_id = '1701439b-69c1-4e83-8587-21c9f4683aa3';

-- 13. Group
DELETE FROM groups WHERE id = '1701439b-69c1-4e83-8587-21c9f4683aa3';

-- 14. Profiles
DELETE FROM profiles WHERE email LIKE '%@padeltest.com';

-- 15. Auth users (run via Supabase dashboard or admin API)
-- Test user IDs:
-- testuser1@padeltest.com: 90e0b3aa-e1a7-4847-9051-da843b422fd6
-- testuser2@padeltest.com: c702b3db-d69e-436f-9a2f-94b7d0539558
-- testuser3@padeltest.com: 72fe4327-581e-476e-970c-792c118e0a78
-- testuser4@padeltest.com: e30d103a-3259-461c-bcf4-a5165af06b13
-- testuser5@padeltest.com: e41e7ab8-d96b-4c1b-81e1-742c66a509dd
-- testuser6@padeltest.com: fff64e29-ded3-4c0a-9614-2b8ca303073f
-- testuser7@padeltest.com: f976d6ca-6f49-44ae-b9d2-4e05f03ed1b7
-- testuser8@padeltest.com: b56661c7-a1fa-4557-bf3c-5ed66612bd51
-- testuser9@padeltest.com: 6070fb9a-8725-4b67-a434-ce58062246c1
-- testuser10@padeltest.com: e71fed98-2800-45d4-98c2-c2d9e0a59bbb
-- testuser11@padeltest.com: 681560bf-1977-4ef9-8fec-07d79cd3fc83
-- testuser12@padeltest.com: 22299ce1-87c6-446d-b9fb-3198c9f9151e
-- testuser13@padeltest.com: b20565e2-ac3a-49b6-a0bd-7640e9d2264d
-- testuser14@padeltest.com: fdd04781-9b35-4476-a45d-157eb40b45c7
-- testuser15@padeltest.com: 8d90df47-d4a6-484a-b000-50dd5a1c0f47
-- testuser16@padeltest.com: 1c05c49e-654f-4926-827e-4980e64150cb
-- testuser17@padeltest.com: 3a3bcad2-c467-47d9-941d-1639756e15ac
-- testuser18@padeltest.com: ea9be48b-8cd5-4175-92db-1c198c853395
-- testuser19@padeltest.com: ffc06353-2e71-4a22-8023-09d5a750f04a
-- testuser20@padeltest.com: f5660635-3a6d-47b9-9877-0a8d4df76d00
