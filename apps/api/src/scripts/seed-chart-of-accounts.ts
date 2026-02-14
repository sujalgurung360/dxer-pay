/**
 * Seed default chart of accounts for an organization.
 * Run: npx tsx src/scripts/seed-chart-of-accounts.ts <orgId>
 */

import { prisma } from '../lib/prisma.js';

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Bank: Operating', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset' },
  { code: '1200', name: 'Prepaid Expenses', type: 'asset' },
  { code: '1300', name: 'Inventory', type: 'asset' },
  { code: '1800', name: 'Fixed Assets: Equipment', type: 'asset' },
  { code: '1850', name: 'Accumulated Depreciation', type: 'asset' },
  { code: '2000', name: 'Accounts Payable', type: 'liability' },
  { code: '2100', name: 'Payroll Liabilities', type: 'liability' },
  { code: '2200', name: 'Credit Card', type: 'liability' },
  { code: '3000', name: 'Owner Equity', type: 'equity' },
  { code: '3100', name: 'Retained Earnings', type: 'equity' },
  { code: '4000', name: 'Revenue: Products', type: 'revenue' },
  { code: '4010', name: 'Revenue: Subscriptions', type: 'revenue' },
  { code: '4020', name: 'Other Income', type: 'revenue' },
  { code: '5000', name: 'COGS: Materials', type: 'cogs' },
  { code: '5010', name: 'COGS: Production', type: 'cogs' },
  { code: '6000', name: 'Payroll: Wages', type: 'expense' },
  { code: '6010', name: 'Payroll: Taxes & Benefits', type: 'expense' },
  { code: '6100', name: 'Rent', type: 'expense' },
  { code: '6200', name: 'Software & SaaS', type: 'expense' },
  { code: '6300', name: 'Marketing & Advertising', type: 'expense' },
  { code: '6310', name: 'Meals & Entertainment', type: 'expense' },
  { code: '6400', name: 'Office Supplies', type: 'expense' },
  { code: '6500', name: 'Travel', type: 'expense' },
  { code: '6700', name: 'Utilities', type: 'expense' },
  { code: '6800', name: 'Legal & Professional Fees', type: 'expense' },
  { code: '6900', name: 'Repairs & Maintenance', type: 'expense' },
  { code: '6999', name: 'Miscellaneous Expenses', type: 'expense' },
];

export async function seedChartOfAccounts(orgId: string) {
  for (const account of DEFAULT_ACCOUNTS) {
    await (prisma as any).chart_of_accounts?.upsert({
      where: {
        org_id_account_code: { org_id: orgId, account_code: account.code },
      },
      create: {
        org_id: orgId,
        account_code: account.code,
        account_name: account.name,
        account_type: account.type,
        is_active: true,
      },
      update: { account_name: account.name, account_type: account.type },
    });
  }
  console.log(`Seeded ${DEFAULT_ACCOUNTS.length} accounts for org ${orgId}`);
}

const orgId = process.argv[2];
if (!orgId) {
  console.error('Usage: npx tsx src/scripts/seed-chart-of-accounts.ts <orgId>');
  process.exit(1);
}

seedChartOfAccounts(orgId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
