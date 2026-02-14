-- Accounting periods and period close checks
CREATE TABLE IF NOT EXISTS accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL,
  year INT NOT NULL,
  month INT,
  quarter INT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  reopened_by UUID,
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT,
  final_balances JSONB,
  multichain_data_hex TEXT,
  multichain_txid TEXT,
  polygon_txhash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, year, month, period_type)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_org_status ON accounting_periods(org_id, status);

CREATE TABLE IF NOT EXISTS period_close_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  waived_by UUID,
  waived_at TIMESTAMPTZ,
  waived_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_period_close_checks_period ON period_close_checks(period_id);
