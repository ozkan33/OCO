-- Extend client_logos to cover two surfaces on the landing page:
--   kind='brand'    → "Our Brand Partners" marquee (existing data)
--   kind='retailer' → "Retailer and Distributor Partners" marquee
--
-- Also add website_url so the admin can set the link the logo points to on the
-- landing page (previously hardcoded in src/app/page.tsx).

ALTER TABLE client_logos
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'brand',
  ADD COLUMN IF NOT EXISTS website_url TEXT;

ALTER TABLE client_logos
  DROP CONSTRAINT IF EXISTS client_logos_kind_check;

ALTER TABLE client_logos
  ADD CONSTRAINT client_logos_kind_check
  CHECK (kind IN ('brand', 'retailer'));

CREATE INDEX IF NOT EXISTS client_logos_kind_sort_idx
  ON client_logos (kind, sort_order);

-- Seed retailer rows using the static favicons already shipped in /public.
-- Idempotent via ON CONFLICT on (kind, label) — creates a uniqueness guard so
-- re-runs and the admin UI both avoid duplicates. A plain composite unique
-- (rather than an expression index) lets the admin's bulk-upsert call
-- reference it by column names.
ALTER TABLE client_logos
  DROP CONSTRAINT IF EXISTS client_logos_kind_label_unique;

ALTER TABLE client_logos
  ADD CONSTRAINT client_logos_kind_label_unique UNIQUE (kind, label);

INSERT INTO client_logos (label, image_url, website_url, kind, sort_order)
VALUES
  ('Cub Foods', '/favicons/cub-com.png', 'https://www.cub.com/', 'retailer', 0),
  ('UNFI', '/favicons/unfi-com.png', 'https://www.unfi.com/', 'retailer', 1),
  ('Festival Foods', '/favicons/festfoods-com.png', 'https://www.festfoods.com/', 'retailer', 2),
  ('Coborn''s', '/favicons/coborns-com.png', 'https://coborns.com/', 'retailer', 3),
  ('Lunds & Byerlys', '/favicons/lundsandbyerlys-com.png', 'https://www.lundsandbyerlys.com/', 'retailer', 4),
  ('Lucky Seven', '/favicons/luckysevengeneralstores-com.png', 'https://luckysevengeneralstores.com/', 'retailer', 5),
  ('Von Hanson''s', '/favicons/vonhansons-com.png', 'https://vonhansons.com/', 'retailer', 6),
  ('Lipari', '/favicons/liparifoods-com.png', 'https://liparifoods.com/', 'retailer', 7),
  ('SpartanNash', '/favicons/spartannash-com.png', 'https://www.spartannash.com/', 'retailer', 8),
  ('Fortune Fish', '', 'https://www.fortunefishco.net/', 'retailer', 9),
  ('US Foods', '/favicons/usfoods-com.png', 'https://www.usfoods.com/', 'retailer', 10),
  ('Royal', '', NULL, 'retailer', 11),
  ('Ronmar', '/favicons/ronmarfoods-com.png', 'https://www.ronmarfoods.com/', 'retailer', 12),
  ('Bill''s Superette', '/favicons/billssuperette-com.png', 'https://www.billssuperette.com/', 'retailer', 13),
  ('Cash Wise', '/favicons/cashwise-com.png', 'https://cashwise.com/', 'retailer', 14),
  ('Fresh Thyme', '/favicons/ww2-freshthyme-com.png', 'https://ww2.freshthyme.com/', 'retailer', 15),
  ('CPW', '/favicons/cpw-coop.png', 'https://www.cpw.coop/', 'retailer', 16),
  ('Brown''s', '/favicons/brownsicecream-com.png', 'https://brownsicecream.com/', 'retailer', 17),
  ('Do It Best', '/favicons/doitbest-com.png', 'https://www.doitbest.com/', 'retailer', 18),
  ('Hugo''s', '/favicons/gohugos-com.png', 'https://www.gohugos.com/', 'retailer', 19),
  ('Piggly Wiggly', '/favicons/shopthepig-com.png', 'https://www.shopthepig.com/', 'retailer', 20),
  ('Woodman''s', '/favicons/woodmans-food-com.png', 'https://www.woodmans-food.com/', 'retailer', 21),
  ('Kowalski''s', '/favicons/kowalskis-com.png', 'https://www.kowalskis.com/', 'retailer', 22),
  ('Knowlan''s', '', 'https://www.knowlansfreshfoods.com/', 'retailer', 23),
  ('Leevers Foods', '/favicons/leeversfoods-com.png', 'https://www.leeversfoods.com/', 'retailer', 24),
  ('Hornbacher''s', '/favicons/hornbachers-com.png', 'https://hornbachers.com/', 'retailer', 25),
  ('Jerry''s', '/favicons/jerrysfoods-com.png', 'https://www.jerrysfoods.com/', 'retailer', 26),
  ('Nilssen''s', '/favicons/nilssensfoods-com.png', 'https://www.nilssensfoods.com/', 'retailer', 27),
  ('Dick''s Fresh Market', '/favicons/dicksfreshmarket-com.png', 'https://www.dicksfreshmarket.com/', 'retailer', 28),
  ('Lueken''s', '/favicons/luekens-com.png', 'https://www.luekens.com/', 'retailer', 29),
  ('Lakewinds', '/favicons/lakewinds-coop.png', 'https://www.lakewinds.coop/', 'retailer', 30),
  ('Mackenthun''s', '/favicons/mackenthuns-com.png', 'https://mackenthuns.com/', 'retailer', 31),
  ('Hy-Vee', '/favicons/hy-vee-com.png', 'https://www.hy-vee.com/', 'retailer', 32),
  ('Seward Co-op', '/favicons/seward-coop.png', 'https://seward.coop/', 'retailer', 33),
  ('Wedge', '/favicons/wedge-coop.png', 'https://wedge.coop/', 'retailer', 34)
ON CONFLICT (kind, label) DO NOTHING;
