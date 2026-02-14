-- Add anomaly flags and needs_review to expenses (optional - used by AI anomaly detection)

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS flags JSONB DEFAULT NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;
