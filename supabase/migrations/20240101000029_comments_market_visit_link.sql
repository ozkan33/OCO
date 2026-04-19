-- Link auto-generated comments back to the market visit that produced them.
-- Previously the API updated comments by ilike-matching a text prefix, which
-- clobbered sibling comments whenever two market visits shared the same date.
-- Keep the link nullable (comments can originate from other flows) and clear
-- it on visit delete so comments stay but stop being synced.

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS market_visit_id UUID
    REFERENCES market_visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comments_market_visit_id
  ON comments (market_visit_id)
  WHERE market_visit_id IS NOT NULL;
