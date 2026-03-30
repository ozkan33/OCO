-- Migration: Automatic history recording via Postgres trigger
-- Every time a cell value changes, the old value is written to scorecard_cell_history.
-- This is invisible to the application — history is captured at the DB level.

CREATE OR REPLACE FUNCTION record_cell_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only record if value actually changed
  IF OLD.value IS DISTINCT FROM NEW.value THEN
    INSERT INTO scorecard_cell_history
      (scorecard_id, row_id, column_key, old_value, new_value, changed_by, changed_at)
    VALUES
      (NEW.scorecard_id, NEW.row_id, NEW.column_key, OLD.value, NEW.value, NEW.updated_by, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cell_history ON scorecard_cells;

CREATE TRIGGER trg_cell_history
  AFTER UPDATE ON scorecard_cells
  FOR EACH ROW EXECUTE FUNCTION record_cell_change();

-- Also record initial INSERT so we have a full audit trail from row creation
CREATE OR REPLACE FUNCTION record_cell_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.value IS NOT NULL AND NEW.value != '' THEN
    INSERT INTO scorecard_cell_history
      (scorecard_id, row_id, column_key, old_value, new_value, changed_by, changed_at)
    VALUES
      (NEW.scorecard_id, NEW.row_id, NEW.column_key, NULL, NEW.value, NEW.updated_by, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cell_insert_history ON scorecard_cells;

CREATE TRIGGER trg_cell_insert_history
  AFTER INSERT ON scorecard_cells
  FOR EACH ROW EXECUTE FUNCTION record_cell_insert();
