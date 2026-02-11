-- ============================================================
-- Migration: Universal Blockchain Anchoring
-- ============================================================
-- Add multichain/polygon anchoring columns to ALL entity tables.
-- Every meaningful business action becomes a signed blockchain event.
-- ============================================================

-- organization_members: role assignments, invites
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS multichain_data_hex TEXT,
  ADD COLUMN IF NOT EXISTS multichain_txid TEXT,
  ADD COLUMN IF NOT EXISTS polygon_txhash TEXT;

-- customers: customer creation/updates
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS multichain_data_hex TEXT,
  ADD COLUMN IF NOT EXISTS multichain_txid TEXT,
  ADD COLUMN IF NOT EXISTS polygon_txhash TEXT;

-- employees: hiring, updates, terminations
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS multichain_data_hex TEXT,
  ADD COLUMN IF NOT EXISTS multichain_txid TEXT,
  ADD COLUMN IF NOT EXISTS polygon_txhash TEXT;

-- production_events: individual production events
ALTER TABLE public.production_events
  ADD COLUMN IF NOT EXISTS multichain_data_hex TEXT,
  ADD COLUMN IF NOT EXISTS multichain_txid TEXT,
  ADD COLUMN IF NOT EXISTS polygon_txhash TEXT;

-- invoice_line_items: line-level anchoring (optional, grouped with invoice)
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS multichain_data_hex TEXT,
  ADD COLUMN IF NOT EXISTS multichain_txid TEXT,
  ADD COLUMN IF NOT EXISTS polygon_txhash TEXT;

-- payroll_entries: individual payroll entries
ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS multichain_data_hex TEXT,
  ADD COLUMN IF NOT EXISTS multichain_txid TEXT,
  ADD COLUMN IF NOT EXISTS polygon_txhash TEXT;

-- audit_log: anchor the audit log itself (meta-integrity)
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS multichain_data_hex TEXT,
  ADD COLUMN IF NOT EXISTS multichain_txid TEXT,
  ADD COLUMN IF NOT EXISTS polygon_txhash TEXT;
