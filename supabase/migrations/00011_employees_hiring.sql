-- Add hiring/onboarding columns to employees (used by hiring pipeline)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'draft';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS wallet_address TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS wallet_private_key_enc TEXT;
