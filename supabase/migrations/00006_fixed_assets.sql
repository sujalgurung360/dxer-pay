-- Fixed assets table (for convert-to-asset from expenses)
CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  purchase_date DATE NOT NULL,
  cost DECIMAL(15,2) NOT NULL,
  useful_life_years INT NOT NULL,
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_org_id ON fixed_assets(org_id);
