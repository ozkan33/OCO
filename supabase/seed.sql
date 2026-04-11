-- Local development seed data
-- Runs automatically when you do: npx supabase db reset
-- This gives you safe test data that mirrors production structure.

-- Create a test user in auth.users (local only)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'dev@test.local',
  crypt('devpassword', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Dev User","role":"ADMIN"}'
) ON CONFLICT DO NOTHING;

-- Seed one scorecard with columns and rows
INSERT INTO user_scorecards (id, user_id, title, data, is_draft, last_modified)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Test Scorecard - Pepsi',
  '{
    "columns": [
      {"key":"name","name":"Retailer Name","isDefault":true},
      {"key":"priority","name":"Priority","isDefault":true},
      {"key":"buyer","name":"Buyer","isDefault":true},
      {"key":"store_count","name":"Store Count","isDefault":true},
      {"key":"cmg","name":"3B Contact","isDefault":true},
      {"key":"prod_pepsi_max","name":"Pepsi Max","isDefault":false},
      {"key":"prod_mountain_dew","name":"Mountain Dew","isDefault":false}
    ],
    "rows": [
      {"id":1700000001,"name":"Kwik Trip","priority":"High","buyer":"John Smith","store_count":800,"cmg":"Volkan","prod_pepsi_max":"Authorized","prod_mountain_dew":"Pending"},
      {"id":1700000002,"name":"Casey'\''s General Store","priority":"Medium","buyer":"Jane Doe","store_count":400,"cmg":"Troy","prod_pepsi_max":"Not Carried","prod_mountain_dew":"Authorized"},
      {"id":1700000003,"name":"Holiday Stationstores","priority":"High","buyer":"Bob Lee","store_count":500,"cmg":"Volkan","prod_pepsi_max":"Pending","prod_mountain_dew":"Not Carried"}
    ]
  }',
  false,
  now()
) ON CONFLICT DO NOTHING;
