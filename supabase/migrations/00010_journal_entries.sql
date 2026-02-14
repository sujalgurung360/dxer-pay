-- Persistent journal entries: chart of accounts, journal entries, journal entry lines

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  parent_account_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  multichain_data_hex TEXT,
  multichain_txid TEXT,
  polygon_txhash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, account_code)
);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_org ON chart_of_accounts(org_id, is_active);

-- Journal Entries (header)
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  reference_type TEXT,
  reference_id UUID,
  status TEXT DEFAULT 'posted',
  created_by UUID,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  multichain_data_hex TEXT,
  multichain_txid TEXT,
  polygon_txhash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, entry_number)
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date ON journal_entries(org_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(org_id, status);

-- Journal Entry Lines (debits/credits)
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID REFERENCES chart_of_accounts(id),
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  debit_amount DECIMAL(15,2) DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount DECIMAL(15,2) DEFAULT 0 CHECK (credit_amount >= 0),
  line_number INT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0)
  )
);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_journal ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON journal_entry_lines(account_code);
