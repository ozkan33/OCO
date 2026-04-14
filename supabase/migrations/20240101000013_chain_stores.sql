-- Chain stores: master list of chain→store mappings imported from customer list Excel
CREATE TABLE IF NOT EXISTS chain_stores (
  id BIGSERIAL PRIMARY KEY,
  chain_name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zipcode TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by chain name (case-insensitive)
CREATE INDEX idx_chain_stores_chain_name ON chain_stores (LOWER(chain_name));

-- Index for fast lookup by store name (for market visit matching)
CREATE INDEX idx_chain_stores_store_name ON chain_stores (LOWER(store_name));

-- RLS
ALTER TABLE chain_stores ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read chain_stores"
  ON chain_stores FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update/delete (handled via supabaseAdmin in API)
