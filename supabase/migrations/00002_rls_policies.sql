-- ============================================================
-- DXER Row Level Security Policies
-- ============================================================
-- Principle: Users can only access rows belonging to
-- organizations they are members of.
-- ============================================================

-- Helper function: get org IDs for current user
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT org_id FROM organization_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user has role in org
CREATE OR REPLACE FUNCTION user_has_role(target_org_id UUID, required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = target_org_id
      AND user_id = auth.uid()
      AND CASE required_role
        WHEN 'viewer' THEN role IN ('viewer','accountant','admin','owner')
        WHEN 'accountant' THEN role IN ('accountant','admin','owner')
        WHEN 'admin' THEN role IN ('admin','owner')
        WHEN 'owner' THEN role = 'owner'
        ELSE false
      END
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Enable RLS on all tables ────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE dxer_anchor_jobs ENABLE ROW LEVEL SECURITY;

-- ─── PROFILES ────────────────────────────────────
CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY profiles_update ON profiles
  FOR UPDATE USING (user_id = auth.uid());

-- Allow reading profiles of org-mates
CREATE POLICY profiles_select_orgmate ON profiles
  FOR SELECT USING (
    user_id IN (
      SELECT om.user_id FROM organization_members om
      WHERE om.org_id IN (SELECT get_user_org_ids())
    )
  );

-- ─── ORGANIZATIONS ───────────────────────────────
CREATE POLICY orgs_select ON organizations
  FOR SELECT USING (id IN (SELECT get_user_org_ids()));

CREATE POLICY orgs_insert ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY orgs_update ON organizations
  FOR UPDATE USING (user_has_role(id, 'admin'));

-- ─── ORGANIZATION MEMBERS ────────────────────────
CREATE POLICY org_members_select ON organization_members
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY org_members_insert ON organization_members
  FOR INSERT WITH CHECK (user_has_role(org_id, 'admin'));

CREATE POLICY org_members_update ON organization_members
  FOR UPDATE USING (user_has_role(org_id, 'admin'));

CREATE POLICY org_members_delete ON organization_members
  FOR DELETE USING (user_has_role(org_id, 'admin'));

-- ─── Macro for standard org-scoped tables ────────
-- Pattern: SELECT if member, INSERT/UPDATE if accountant+

-- CUSTOMERS
CREATE POLICY customers_select ON customers
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY customers_insert ON customers
  FOR INSERT WITH CHECK (user_has_role(org_id, 'accountant'));
CREATE POLICY customers_update ON customers
  FOR UPDATE USING (user_has_role(org_id, 'accountant'));

-- EMPLOYEES
CREATE POLICY employees_select ON employees
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY employees_insert ON employees
  FOR INSERT WITH CHECK (user_has_role(org_id, 'admin'));
CREATE POLICY employees_update ON employees
  FOR UPDATE USING (user_has_role(org_id, 'admin'));

-- EXPENSES
CREATE POLICY expenses_select ON expenses
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY expenses_insert ON expenses
  FOR INSERT WITH CHECK (user_has_role(org_id, 'viewer'));
CREATE POLICY expenses_update ON expenses
  FOR UPDATE USING (user_has_role(org_id, 'accountant'));

-- INVOICES
CREATE POLICY invoices_select ON invoices
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY invoices_insert ON invoices
  FOR INSERT WITH CHECK (user_has_role(org_id, 'accountant'));
CREATE POLICY invoices_update ON invoices
  FOR UPDATE USING (user_has_role(org_id, 'accountant'));

-- INVOICE LINE ITEMS (access through invoice org)
CREATE POLICY line_items_select ON invoice_line_items
  FOR SELECT USING (
    invoice_id IN (SELECT id FROM invoices WHERE org_id IN (SELECT get_user_org_ids()))
  );
CREATE POLICY line_items_insert ON invoice_line_items
  FOR INSERT WITH CHECK (
    invoice_id IN (SELECT id FROM invoices WHERE org_id IN (SELECT get_user_org_ids()))
  );

-- PAYROLLS
CREATE POLICY payrolls_select ON payrolls
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY payrolls_insert ON payrolls
  FOR INSERT WITH CHECK (user_has_role(org_id, 'admin'));
CREATE POLICY payrolls_update ON payrolls
  FOR UPDATE USING (user_has_role(org_id, 'admin'));

-- PAYROLL ENTRIES
CREATE POLICY payroll_entries_select ON payroll_entries
  FOR SELECT USING (
    payroll_id IN (SELECT id FROM payrolls WHERE org_id IN (SELECT get_user_org_ids()))
  );
CREATE POLICY payroll_entries_insert ON payroll_entries
  FOR INSERT WITH CHECK (
    payroll_id IN (SELECT id FROM payrolls WHERE org_id IN (SELECT get_user_org_ids()))
  );

-- PRODUCTION BATCHES
CREATE POLICY batches_select ON production_batches
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY batches_insert ON production_batches
  FOR INSERT WITH CHECK (user_has_role(org_id, 'accountant'));
CREATE POLICY batches_update ON production_batches
  FOR UPDATE USING (user_has_role(org_id, 'accountant'));

-- PRODUCTION EVENTS
CREATE POLICY prod_events_select ON production_events
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY prod_events_insert ON production_events
  FOR INSERT WITH CHECK (user_has_role(org_id, 'accountant'));

-- DEVICE IDENTITIES
CREATE POLICY devices_select ON device_identities
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY devices_insert ON device_identities
  FOR INSERT WITH CHECK (user_has_role(org_id, 'admin'));
CREATE POLICY devices_update ON device_identities
  FOR UPDATE USING (user_has_role(org_id, 'admin'));

-- CONTENT ADDRESSES
CREATE POLICY content_addr_select ON content_addresses
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY content_addr_insert ON content_addresses
  FOR INSERT WITH CHECK (user_has_role(org_id, 'accountant'));

-- AUDIT LOG (read-only for members, insert via service role)
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
-- Insert is done via service role (bypasses RLS), no user-facing insert policy

-- ANCHOR JOBS
CREATE POLICY anchor_jobs_select ON dxer_anchor_jobs
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
CREATE POLICY anchor_jobs_insert ON dxer_anchor_jobs
  FOR INSERT WITH CHECK (user_has_role(org_id, 'admin'));

-- ─── STORAGE POLICIES ────────────────────────────
-- (Applied via Supabase Dashboard or supabase CLI)
-- Receipts bucket: org-scoped paths like {org_id}/{filename}
-- INSERT: authenticated users who are members of the org (path prefix)
-- SELECT: members of the org
-- DELETE: admin+ of the org
