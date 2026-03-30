-- Migration: One-time data migration from JSONB blob → normalized tables
-- Safe to run multiple times (uses INSERT ... ON CONFLICT DO NOTHING).
-- Run AFTER 20240101000001 and 20240101000002 are applied.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste this file → Run
--   Takes ~1 second per 1000 rows. Check output for row counts.

DO $$
DECLARE
  sc        RECORD;
  col_rec   RECORD;
  row_rec   RECORD;
  col_pos   integer;
  row_pos   integer;
  cell_val  text;
BEGIN
  -- Iterate every scorecard that has a non-empty data blob
  FOR sc IN
    SELECT id, data
    FROM   user_scorecards
    WHERE  data IS NOT NULL
      AND  data != '{}'::jsonb
      AND  data != 'null'::jsonb
  LOOP
    -- ── Columns ──────────────────────────────────────────────────────────────
    col_pos := 0;
    FOR col_rec IN
      SELECT
        elem->>'key'  AS key,
        elem->>'name' AS label,
        (elem->>'isDefault')::boolean AS is_default
      FROM jsonb_array_elements(sc.data->'columns') AS elem
    LOOP
      INSERT INTO scorecard_columns
        (scorecard_id, key, label, col_type, position, is_default)
      VALUES (
        sc.id,
        col_rec.key,
        COALESCE(col_rec.label, col_rec.key),
        CASE
          WHEN col_rec.key = 'priority'              THEN 'priority'
          WHEN col_rec.key = 'cmg'                   THEN 'contact'
          WHEN col_rec.key = 'category_review_date'  THEN 'date'
          WHEN col_rec.key IN ('retail_price', 'store_count') THEN 'number'
          WHEN col_rec.key = 'name'                  THEN 'text'
          ELSE 'status'  -- product authorization columns
        END,
        col_pos,
        COALESCE(col_rec.is_default, false)
      )
      ON CONFLICT (scorecard_id, key) DO NOTHING;
      col_pos := col_pos + 1;
    END LOOP;

    -- ── Rows + Cells ─────────────────────────────────────────────────────────
    row_pos := 0;
    FOR row_rec IN
      SELECT elem
      FROM   jsonb_array_elements(sc.data->'rows') AS elem
      WHERE  (elem->>'isAddRow') IS DISTINCT FROM 'true'
    LOOP
      -- Insert row (id from blob, cast to bigint)
      INSERT INTO scorecard_rows (id, scorecard_id, position)
      VALUES (
        (row_rec.elem->>'id')::bigint,
        sc.id,
        row_pos
      )
      ON CONFLICT DO NOTHING;

      -- Insert one cell per column for this row
      FOR col_rec IN
        SELECT key FROM scorecard_columns WHERE scorecard_id = sc.id
      LOOP
        cell_val := row_rec.elem->>col_rec.key;
        IF cell_val IS NOT NULL AND cell_val != '' THEN
          INSERT INTO scorecard_cells
            (scorecard_id, row_id, column_key, value)
          VALUES (sc.id, (row_rec.elem->>'id')::bigint, col_rec.key, cell_val)
          ON CONFLICT (scorecard_id, row_id, column_key) DO NOTHING;
        END IF;
      END LOOP;

      row_pos := row_pos + 1;
    END LOOP;

  END LOOP;

  RAISE NOTICE 'Migration complete.';
  RAISE NOTICE 'scorecard_columns rows: %', (SELECT count(*) FROM scorecard_columns);
  RAISE NOTICE 'scorecard_rows rows:    %', (SELECT count(*) FROM scorecard_rows);
  RAISE NOTICE 'scorecard_cells rows:   %', (SELECT count(*) FROM scorecard_cells);
END;
$$;
