-- Anomaly detection stats (optional, for monitoring)
CREATE TABLE IF NOT EXISTS anomaly_detection_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_expenses INT DEFAULT 0,
  flagged_count INT DEFAULT 0,
  flag_types JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, date)
);

CREATE INDEX IF NOT EXISTS idx_anomaly_detection_stats_org_id ON anomaly_detection_stats(org_id);
