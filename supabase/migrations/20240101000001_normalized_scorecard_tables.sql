-- Migration: Normalize scorecard data out of the JSONB blob
-- Safe: only ADDS new tables. Existing user_scorecards.data blob is untouched.
-- Run this on production via Supabase SQL editor (Dashboard > SQL Editor > New query).

-- ─── 1. Slim scorecard header (rename title → name for consistency) ──────────
ALTER TABLE user_scorecards
  ADD COLUMN IF NOT EXISTS name text GENERATED ALWAYS AS (COALESCE(title, 'Untitled')) STORED;

-- ─── 2. Columns definition per scorecard ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS scorecard_columns (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id uuid       NOT NULL REFERENCES user_scorecards(id) ON DELETE CASCADE,
  key         text        NOT NULL,              -- e.g. 'priority', 'buyer', 'prod_abc'
  label       text        NOT NULL,              -- display name
  col_type    text        NOT NULL DEFAULT 'text', -- text | status | priority | contact | date | number
  position    integer     NOT NULL DEFAULT 0,
  is_default  boolean     NOT NULL DEFAULT false, -- system columns (name, priority, etc.)
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scorecard_id, key)
);

-- ─── 3. Rows (one record per retailer per scorecard) ─────────────────────────
CREATE TABLE IF NOT EXISTS scorecard_rows (
  id           bigint      NOT NULL,              -- matches existing row.id (Date.now())
  scorecard_id uuid        NOT NULL REFERENCES user_scorecards(id) ON DELETE CASCADE,
  position     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, scorecard_id)
);

-- ─── 4. Cells (one record per row × column intersection) ─────────────────────
CREATE TABLE IF NOT EXISTS scorecard_cells (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id uuid        NOT NULL,
  row_id       bigint      NOT NULL,
  column_key   text        NOT NULL,
  value        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid        REFERENCES auth.users(id),
  UNIQUE (scorecard_id, row_id, column_key),
  FOREIGN KEY (row_id, scorecard_id) REFERENCES scorecard_rows(id, scorecard_id) ON DELETE CASCADE
);

-- ─── 5. Cell change history (append-only, never deleted) ─────────────────────
CREATE TABLE IF NOT EXISTS scorecard_cell_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id uuid        NOT NULL,
  row_id       bigint      NOT NULL,
  column_key   text        NOT NULL,
  old_value    text,
  new_value    text,
  changed_by   uuid        REFERENCES auth.users(id),
  changed_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── 6. Indexes for common query patterns ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scorecard_columns_scorecard ON scorecard_columns(scorecard_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_rows_scorecard    ON scorecard_rows(scorecard_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_cells_scorecard   ON scorecard_cells(scorecard_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_cells_row         ON scorecard_cells(scorecard_id, row_id);
CREATE INDEX IF NOT EXISTS idx_cell_history_scorecard      ON scorecard_cell_history(scorecard_id, row_id, column_key);
CREATE INDEX IF NOT EXISTS idx_cell_history_time           ON scorecard_cell_history(changed_at DESC);

-- ─── 7. RLS policies (mirror user_scorecards access pattern) ─────────────────
ALTER TABLE scorecard_columns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_rows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_cells        ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_cell_history ENABLE ROW LEVEL SECURITY;

-- Owners can read/write their own scorecard data
CREATE POLICY "owner_all_columns" ON scorecard_columns
  USING  (scorecard_id IN (SELECT id FROM user_scorecards WHERE user_id = auth.uid()))
  WITH CHECK (scorecard_id IN (SELECT id FROM user_scorecards WHERE user_id = auth.uid()));

CREATE POLICY "owner_all_rows" ON scorecard_rows
  USING  (scorecard_id IN (SELECT id FROM user_scorecards WHERE user_id = auth.uid()))
  WITH CHECK (scorecard_id IN (SELECT id FROM user_scorecards WHERE user_id = auth.uid()));

CREATE POLICY "owner_all_cells" ON scorecard_cells
  USING  (scorecard_id IN (SELECT id FROM user_scorecards WHERE user_id = auth.uid()))
  WITH CHECK (scorecard_id IN (SELECT id FROM user_scorecards WHERE user_id = auth.uid()));

CREATE POLICY "owner_read_history" ON scorecard_cell_history
  FOR SELECT USING (scorecard_id IN (SELECT id FROM user_scorecards WHERE user_id = auth.uid()));
