-- Seed demo groups for Discover Groups feature
-- Uses INSERT ... ON CONFLICT DO NOTHING so safe to run multiple times

INSERT INTO groups (id, name, description, city, visibility, admin_id, created_at)
VALUES
  (
    'bb35c502-b5c9-4b23-8379-b81c2066c654',
    'BS3 Padel Players',
    'Bristol BS3 padel community. All levels welcome. We play at Ashton Gate and Redcliffe courts.',
    'Bristol',
    'open',
    '80a9cb54-cec2-45a4-a67f-aea27f5f7d36',
    NOW()
  ),
  (
    'cc46d613-c6da-5c34-9480-c92d3177d765',
    'Bristol Padel Club',
    'Competitive padel players in Bristol. League and social play.',
    'Bristol',
    'open',
    '80a9cb54-cec2-45a4-a67f-aea27f5f7d36',
    NOW() - interval '2 days'
  ),
  (
    'dd57e724-d7eb-6d45-a591-da3e4288e876',
    'Dublin Padel Community',
    'Padel players across Dublin. Beginners and experienced welcome.',
    'Dublin',
    'open',
    '80a9cb54-cec2-45a4-a67f-aea27f5f7d36',
    NOW() - interval '5 days'
  ),
  (
    'ee68f835-e8fc-7e56-b6a2-eb4f5399f987',
    'London Padel Network',
    'Connecting padel players across London. Weekly social sessions.',
    'London',
    'open',
    '80a9cb54-cec2-45a4-a67f-aea27f5f7d36',
    NOW() - interval '7 days'
  ),
  (
    'ff79a946-f9ad-8f67-c7b3-fc5064aa0a98',
    'Manchester Padel Squad',
    'Padel players in Manchester and Salford. All levels, great vibes.',
    'Manchester',
    'open',
    '80a9cb54-cec2-45a4-a67f-aea27f5f7d36',
    NOW() - interval '10 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Add Christian as admin member of BS3
INSERT INTO group_members (group_id, user_id, role, status)
VALUES (
  'bb35c502-b5c9-4b23-8379-b81c2066c654',
  '80a9cb54-cec2-45a4-a67f-aea27f5f7d36',
  'admin',
  'approved'
)
ON CONFLICT (group_id, user_id) DO NOTHING;
