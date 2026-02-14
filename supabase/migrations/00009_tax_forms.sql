-- Tax forms: org/employee/payroll fields, contractors, depreciation, tax_packages

-- Organizations: EIN and address
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ein TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS zip TEXT;

-- Employees: SSN and address
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ssn TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS filing_status TEXT;

-- Payroll entries: tax withholdings
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS federal_withholding DECIMAL(10,2);
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS state_withholding DECIMAL(10,2);
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS social_security_tax DECIMAL(10,2);
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS medicare_tax DECIMAL(10,2);
ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS state_unemployment_tax DECIMAL(10,2);

-- Contractors (before expenses.contractor_id)
CREATE TABLE IF NOT EXISTS contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_name TEXT,
  ein_or_ssn TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  multichain_data_hex TEXT,
  multichain_txid TEXT,
  polygon_txhash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contractors_org_active ON contractors(org_id, is_active);

-- Expenses: contractor link
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES contractors(id);
CREATE INDEX IF NOT EXISTS idx_expenses_contractor_id ON expenses(contractor_id);

-- Fixed assets: extend for depreciation (if columns missing)
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS salvage_value DECIMAL(12,2) DEFAULT 0;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS accumulated_depreciation DECIMAL(12,2) DEFAULT 0;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS disposal_date DATE;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS disposal_proceeds DECIMAL(12,2);
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS disposal_method TEXT;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id);

-- Depreciation entries
CREATE TABLE IF NOT EXISTS depreciation_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  depreciation_amount DECIMAL(12,2) NOT NULL,
  accumulated_total DECIMAL(12,2) NOT NULL,
  multichain_data_hex TEXT,
  multichain_txid TEXT,
  polygon_txhash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS idx_depreciation_entries_period ON depreciation_entries(org_id, period_year, period_month);

-- Tax packages
CREATE TABLE IF NOT EXISTS tax_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tax_year INT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'annual',
  status TEXT NOT NULL DEFAULT 'generating',
  file_url TEXT,
  file_size_bytes BIGINT,
  generated_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  contents JSONB,
  multichain_data_hex TEXT,
  multichain_txid TEXT,
  polygon_txhash TEXT
);
CREATE INDEX IF NOT EXISTS idx_tax_packages_org ON tax_packages(org_id);
