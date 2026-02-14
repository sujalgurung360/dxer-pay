import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';

/**
 * Lightweight accounting engine built on top of existing DXER entities.
 *
 * IMPORTANT:
 * - Single functional currency for now (AUD or whatever org uses consistently).
 * - Accrual is the primary basis; cash basis is approximated using status where possible.
 * - This is a COMPUTED ledger: we do not persist journal entries yet, we derive them
 *   deterministically from source events on each request.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'cogs';

export interface AccountingAccount {
  code: string;
  name: string;
  type: AccountType;
  group: string; // for reporting (e.g. 'Current Assets', 'Operating Expenses')
}

export interface JournalLine {
  date: Date;
  accountCode: string;
  debit: number;
  credit: number;
  description: string;
  sourceType: 'expense' | 'invoice' | 'payroll';
  sourceId: string;
}

export interface TrialBalanceAccountRow {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalanceResult {
  basis: 'accrual' | 'cash';
  from: string;
  to: string;
  accounts: TrialBalanceAccountRow[];
  totals: { debit: number; credit: number };
}

export interface ProfitAndLossRow {
  section: 'revenue' | 'cogs' | 'expense';
  code: string;
  name: string;
  amount: number; // positive for revenue & expenses, we handle signs in UI
}

export interface ProfitAndLossResult {
  basis: 'accrual' | 'cash';
  from: string;
  to: string;
  rows: ProfitAndLossRow[];
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netIncome: number;
  };
}

export interface GeneralLedgerEntry {
  date: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
  sourceType: 'expense' | 'invoice' | 'payroll';
  sourceId: string;
}

export interface GeneralLedgerResult {
  basis: 'accrual' | 'cash';
  from: string;
  to: string;
  accountFilter?: string;
  entries: GeneralLedgerEntry[];
}

export interface AgingBucket {
  label: string;
  fromDays: number;
  toDays: number | null;
}

export interface AgingRow {
  key: string;
  name: string;
  current: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_over_90: number;
  total: number;
}

export interface AgingResult {
  asOf: string;
  rows: AgingRow[];
  totals: AgingRow;
}

export interface BurnRateResult {
  from: string;
  to: string;
  total: number;
  days: number;
  daily: number;
  monthly: number;
}

// ───────────────────────────────────────────────────────────────────────────────
// Chart of accounts (static template for now, per-org customization later)
// ───────────────────────────────────────────────────────────────────────────────

export function getDefaultAccounts(): AccountingAccount[] {
  return [
    // Assets
    { code: '1000', name: 'Bank: Operating', type: 'asset', group: 'Current Assets' },
    { code: '1100', name: 'Accounts Receivable', type: 'asset', group: 'Current Assets' },
    { code: '1200', name: 'Prepayments', type: 'asset', group: 'Current Assets' },
    // Liabilities
    { code: '2000', name: 'Accounts Payable', type: 'liability', group: 'Current Liabilities' },
    { code: '2100', name: 'Payroll Liabilities', type: 'liability', group: 'Current Liabilities' },
    // Equity
    { code: '3000', name: 'Owner Equity', type: 'equity', group: 'Equity' },
    { code: '3100', name: 'Retained Earnings', type: 'equity', group: 'Equity' },
    // Income
    { code: '4000', name: 'Revenue: Products', type: 'income', group: 'Revenue' },
    { code: '4010', name: 'Revenue: Subscriptions', type: 'income', group: 'Revenue' },
    { code: '4020', name: 'Other Income', type: 'income', group: 'Revenue' },
    // COGS
    { code: '5000', name: 'COGS: Materials', type: 'cogs', group: 'Cost of Goods Sold' },
    { code: '5010', name: 'COGS: Production Costs', type: 'cogs', group: 'Cost of Goods Sold' },
    // Expenses
    { code: '6000', name: 'Payroll: Wages', type: 'expense', group: 'Operating Expenses' },
    { code: '6010', name: 'Payroll: Taxes & Super', type: 'expense', group: 'Operating Expenses' },
    { code: '6100', name: 'Rent', type: 'expense', group: 'Operating Expenses' },
    { code: '6200', name: 'Software', type: 'expense', group: 'Operating Expenses' },
    { code: '6300', name: 'Marketing', type: 'expense', group: 'Operating Expenses' },
    { code: '6400', name: 'Office Supplies', type: 'expense', group: 'Operating Expenses' },
    { code: '6999', name: 'Miscellaneous Expenses', type: 'expense', group: 'Operating Expenses' },
  ];
}

function findAccount(code: string): AccountingAccount {
  const account = getDefaultAccounts().find((a) => a.code === code);
  if (!account) {
    throw new Error(`Accounting account ${code} not found in default chart`);
  }
  return account;
}

// ───────────────────────────────────────────────────────────────────────────────
// Public entrypoints
// ───────────────────────────────────────────────────────────────────────────────

export async function computeTrialBalanceForOrg(params: {
  orgId: string;
  from: Date;
  to: Date;
  basis: 'accrual' | 'cash';
}): Promise<TrailBalanceResult> {
  const lines = await buildJournalLinesForOrg(params);
  const accountMap = new Map<string, TrialBalanceAccountRow>();

  for (const line of lines) {
    const acc = findAccount(line.accountCode);
    const existing = accountMap.get(line.accountCode) || {
      code: acc.code,
      name: acc.name,
      type: acc.type,
      debit: 0,
      credit: 0,
      balance: 0,
    };
    existing.debit += line.debit;
    existing.credit += line.credit;
    accountMap.set(line.accountCode, existing);
  }

  // Compute balances with standard sign convention.
  const accounts: TrialBalanceAccountRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const row of accountMap.values()) {
    const acc = findAccount(row.code);
    const net = row.debit - row.credit;
    if (acc.type === 'asset' || acc.type === 'expense' || acc.type === 'cogs') {
      row.balance = net;
    } else {
      // Liabilities, equity, income: credit-balances
      row.balance = -net;
    }
    totalDebit += row.debit;
    totalCredit += row.credit;
    accounts.push(row);
  }

  // Sort by code for stable output.
  accounts.sort((a, b) => a.code.localeCompare(b.code));

  return {
    basis: params.basis,
    from: params.from.toISOString().split('T')[0],
    to: params.to.toISOString().split('T')[0],
    accounts,
    totals: {
      debit: Number(totalDebit.toFixed(2)),
      credit: Number(totalCredit.toFixed(2)),
    },
  };
}

export async function computeProfitAndLossForOrg(params: {
  orgId: string;
  from: Date;
  to: Date;
  basis: 'accrual' | 'cash';
}): Promise<ProfitAndLossResult> {
  const lines = await buildJournalLinesForOrg(params);

  const rowsMap = new Map<string, ProfitAndLossRow>();

  for (const line of lines) {
    const acc = findAccount(line.accountCode);
    if (acc.type !== 'income' && acc.type !== 'expense' && acc.type !== 'cogs') {
      continue; // Only P&L accounts
    }

    const section: ProfitAndLossRow['section'] =
      acc.type === 'income' ? 'revenue' : acc.type === 'cogs' ? 'cogs' : 'expense';

    const existing = rowsMap.get(acc.code) || {
      section,
      code: acc.code,
      name: acc.name,
      amount: 0,
    };

    // For income accounts, credits increase revenue; for expenses/COGS, debits increase cost.
    const delta =
      acc.type === 'income'
        ? line.credit - line.debit
        : line.debit - line.credit;

    existing.amount += delta;
    rowsMap.set(acc.code, existing);
  }

  const rows = Array.from(rowsMap.values()).sort((a, b) => a.code.localeCompare(b.code));

  let revenue = 0;
  let cogs = 0;
  let expenses = 0;

  for (const row of rows) {
    if (row.section === 'revenue') revenue += row.amount;
    else if (row.section === 'cogs') cogs += row.amount;
    else expenses += row.amount;
  }

  const grossProfit = revenue - cogs;
  const netIncome = grossProfit - expenses;

  return {
    basis: params.basis,
    from: params.from.toISOString().split('T')[0],
    to: params.to.toISOString().split('T')[0],
    rows: rows.map((r) => ({ ...r, amount: Number(r.amount.toFixed(2)) })),
    totals: {
      revenue: Number(revenue.toFixed(2)),
      cogs: Number(cogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      expenses: Number(expenses.toFixed(2)),
      netIncome: Number(netIncome.toFixed(2)),
    },
  };
}

export async function computeGeneralLedgerForOrg(params: {
  orgId: string;
  from: Date;
  to: Date;
  basis: 'accrual' | 'cash';
  accountCode?: string;
}): Promise<GeneralLedgerResult> {
  const lines = await buildJournalLinesForOrg(params);
  const filtered = params.accountCode
    ? lines.filter((l) => l.accountCode === params.accountCode)
    : lines;

  const entries: GeneralLedgerEntry[] = filtered
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((l) => {
      const acc = findAccount(l.accountCode);
      return {
        date: l.date.toISOString(),
        accountCode: acc.code,
        accountName: acc.name,
        description: l.description,
        debit: Number(l.debit.toFixed(2)),
        credit: Number(l.credit.toFixed(2)),
        sourceType: l.sourceType,
        sourceId: l.sourceId,
      };
    });

  return {
    basis: params.basis,
    from: params.from.toISOString().split('T')[0],
    to: params.to.toISOString().split('T')[0],
    accountFilter: params.accountCode,
    entries,
  };
}

export async function computeArAgingForOrg(orgId: string, asOf: Date): Promise<AgingResult> {
  const today = asOf;
  const invoices = await prisma.invoices.findMany({
    where: {
      org_id: orgId,
      status: { in: ['draft', 'sent'] }, // unpaid / partially unpaid
    },
    include: { customer: true },
  });

  const bucketize = buildAgingBuckets();
  const rowsMap = new Map<string, AgingRow>();

  for (const inv of invoices) {
    const key = inv.customer_id;
    const name = inv.customer?.name || 'Unknown customer';
    const row =
      rowsMap.get(key) ||
      {
        key,
        name,
        current: 0,
        bucket_1_30: 0,
        bucket_31_60: 0,
        bucket_61_90: 0,
        bucket_over_90: 0,
        total: 0,
      };

    const amount = Number(inv.total);
    const daysPastDue = Math.max(
      0,
      Math.floor(
        (today.getTime() - inv.due_date.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    const bucket = bucketize(daysPastDue);
    row[bucket as keyof AgingRow] += amount;
    row.total += amount;
    rowsMap.set(key, row);
  }

  const rows = Array.from(rowsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const totals: AgingRow = rows.reduce(
    (acc, r) => ({
      key: 'TOTAL',
      name: 'Total',
      current: acc.current + r.current,
      bucket_1_30: acc.bucket_1_30 + r.bucket_1_30,
      bucket_31_60: acc.bucket_31_60 + r.bucket_31_60,
      bucket_61_90: acc.bucket_61_90 + r.bucket_61_90,
      bucket_over_90: acc.bucket_over_90 + r.bucket_over_90,
      total: acc.total + r.total,
    }),
    {
      key: 'TOTAL',
      name: 'Total',
      current: 0,
      bucket_1_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_over_90: 0,
      total: 0,
    },
  );

  return {
    asOf: today.toISOString().split('T')[0],
    rows,
    totals,
  };
}

export async function computeApAgingForOrg(orgId: string, asOf: Date): Promise<AgingResult> {
  const today = asOf;
  const expenses = await prisma.expenses.findMany({
    where: {
      org_id: orgId,
      status: { not: 'voided' },
    },
  });

  const bucketize = buildAgingBuckets();
  const rowsMap = new Map<string, AgingRow>();

  for (const e of expenses) {
    const key = e.category || 'uncategorized';
    const name = e.category || 'Uncategorized';
    const row =
      rowsMap.get(key) ||
      {
        key,
        name,
        current: 0,
        bucket_1_30: 0,
        bucket_31_60: 0,
        bucket_61_90: 0,
        bucket_over_90: 0,
        total: 0,
      };

    const amount = Number(e.amount);
    const daysPast = Math.max(
      0,
      Math.floor(
        (today.getTime() - e.date.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    const bucket = bucketize(daysPast);
    row[bucket as keyof AgingRow] += amount;
    row.total += amount;
    rowsMap.set(key, row);
  }

  const rows = Array.from(rowsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const totals: AgingRow = rows.reduce(
    (acc, r) => ({
      key: 'TOTAL',
      name: 'Total',
      current: acc.current + r.current,
      bucket_1_30: acc.bucket_1_30 + r.bucket_1_30,
      bucket_31_60: acc.bucket_31_60 + r.bucket_31_60,
      bucket_61_90: acc.bucket_61_90 + r.bucket_61_90,
      bucket_over_90: acc.bucket_over_90 + r.bucket_over_90,
      total: acc.total + r.total,
    }),
    {
      key: 'TOTAL',
      name: 'Total',
      current: 0,
      bucket_1_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_over_90: 0,
      total: 0,
    },
  );

  return {
    asOf: today.toISOString().split('T')[0],
    rows,
    totals,
  };
}

export async function computeBurnRateForOrg(params: {
  orgId: string;
  from: Date;
  to: Date;
}): Promise<BurnRateResult> {
  const lines = await buildJournalLinesForOrg({
    orgId: params.orgId,
    from: params.from,
    to: params.to,
    basis: 'accrual',
  });

  let total = 0;
  for (const line of lines) {
    const acc = findAccount(line.accountCode);
    if (acc.type === 'expense' || acc.type === 'cogs') {
      total += line.debit - line.credit;
    }
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.max(
    1,
    Math.round(
      (params.to.getTime() - params.from.getTime()) / msPerDay,
    ) + 1,
  );
  const daily = total / days;
  const monthly = daily * 30;

  return {
    from: params.from.toISOString().split('T')[0],
    to: params.to.toISOString().split('T')[0],
    total: Number(total.toFixed(2)),
    days,
    daily: Number(daily.toFixed(2)),
    monthly: Number(monthly.toFixed(2)),
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Journal builder – computed from existing DXER entities
// ───────────────────────────────────────────────────────────────────────────────

async function buildJournalLinesForOrg(params: {
  orgId: string;
  from: Date;
  to: Date;
  basis: 'accrual' | 'cash';
}): Promise<JournalLine[]> {
  const { orgId, from, to, basis } = params;

  const [expenses, invoices, payrolls] = await Promise.all([
    prisma.expenses.findMany({
      where: {
        org_id: orgId,
        date: { gte: from, lte: to },
        status: { not: 'voided' },
      },
    }),
    prisma.invoices.findMany({
      where: {
        org_id: orgId,
        // For accrual, include all non-void; for cash, approximate by paid-only.
        status: basis === 'cash' ? 'paid' : { not: 'void' },
        due_date: { gte: from, lte: to },
      },
      include: { line_items: true },
    }),
    prisma.payrolls.findMany({
      where: {
        org_id: orgId,
        pay_date: { gte: from, lte: to },
        // For cash vs accrual we currently treat similarly; more nuance can come later.
      },
      include: { entries: true },
    }),
  ]);

  const lines: JournalLine[] = [];

  // Expenses → expense / COGS + AP or Bank
  for (const e of expenses) {
    const amount = Number(e.amount);
    if (!amount) continue;

    const date = e.date;
    const description = e.description;

    // Very simple category → account mapping; can be replaced with rules later.
    const expenseAccount = mapExpenseCategoryToAccount(e.category, e.tags, !!e.production_batch_id);
    const creditAccount = mapExpensePaymentToCreditAccount(e.tags);

    // Debit expense/COGS
    lines.push({
      date,
      accountCode: expenseAccount,
      debit: amount,
      credit: 0,
      description,
      sourceType: 'expense',
      sourceId: e.id,
    });

    // Credit AP / Bank (we assume accrual-style recording; cash/bank integration can refine later)
    lines.push({
      date,
      accountCode: creditAccount,
      debit: 0,
      credit: amount,
      description,
      sourceType: 'expense',
      sourceId: e.id,
    });
  }

  // Invoices → AR + Revenue
  for (const inv of invoices) {
    const total = Number(inv.total);
    if (!total) continue;

    const date = inv.due_date;
    const description = `Invoice ${inv.invoice_number}`;

    // Aggregate revenue by a simple heuristic – in future, use line item tags or product types.
    const revenueAccount =
      inv.line_items.length > 0 &&
      inv.line_items.every((li) => li.description.toLowerCase().includes('subscription'))
        ? '4010'
        : '4000';

    // Accrual: Dr AR, Cr Revenue
    lines.push({
      date,
      accountCode: '1100', // Accounts Receivable
      debit: total,
      credit: 0,
      description,
      sourceType: 'invoice',
      sourceId: inv.id,
    });

    lines.push({
      date,
      accountCode: revenueAccount,
      debit: 0,
      credit: total,
      description,
      sourceType: 'invoice',
      sourceId: inv.id,
    });
  }

  // Payrolls → Payroll expenses + Payroll liabilities
  for (const p of payrolls) {
    const total = Number(p.total_amount);
    if (!total) continue;

    const date = p.pay_date;
    const description = `Payroll ${p.period_start.toISOString().split('T')[0]}–${p.period_end
      .toISOString()
      .split('T')[0]}`;

    // Debit payroll wages expense
    lines.push({
      date,
      accountCode: '6000',
      debit: total,
      credit: 0,
      description,
      sourceType: 'payroll',
      sourceId: p.id,
    });

    // Credit payroll liabilities (until paid)
    lines.push({
      date,
      accountCode: '2100',
      debit: 0,
      credit: total,
      description,
      sourceType: 'payroll',
      sourceId: p.id,
    });
  }

  return lines;
}

// ───────────────────────────────────────────────────────────────────────────────
// Simple category → account mapping
// ───────────────────────────────────────────────────────────────────────────────

function mapExpenseCategoryToAccount(
  category: string,
  tags: string[] | null,
  hasProductionBatch: boolean,
): string {
  const lowerTags = (tags || []).map((t) => t.toLowerCase());

  // Explicit override via tag: acct:6400, acct:5000, etc.
  const overrideTag = lowerTags.find((t) => t.startsWith('acct:'));
  if (overrideTag) {
    const code = overrideTag.slice('acct:'.length).trim();
    if (code && getDefaultAccounts().some((a) => a.code === code)) {
      return code;
    }
  }

  const normalized = (category || '').toLowerCase();
  const tagString = lowerTags.join(' ');

  // Production-related costs
  if (hasProductionBatch || tagString.includes('factory') || tagString.includes('production')) {
    return '5010'; // COGS: Production Costs
  }

  if (normalized.includes('software') || normalized.includes('saas')) return '6200';
  if (normalized.includes('rent') || normalized.includes('lease')) return '6100';
  if (normalized.includes('marketing') || normalized.includes('ads') || normalized.includes('advert')) {
    return '6300';
  }
  if (normalized.includes('office') || normalized.includes('supplies') || normalized.includes('stationery')) {
    return '6400';
  }

  return '6999'; // Misc Expenses
}

function mapExpensePaymentToCreditAccount(tags: string[] | null): string {
  const lowerTags = (tags || []).map((t) => t.toLowerCase());
  const payTag = lowerTags.find((t) => t.startsWith('pay:'));
  const mode = payTag ? payTag.slice('pay:'.length) : 'ap';

  if (mode === 'bank' || mode === 'cash') {
    // For now, treat both as Bank: Operating until we introduce more granular cash accounts.
    return '1000';
  }

  return '2000';
}

function buildAgingBuckets(): (days: number) => keyof AgingRow {
  return (days: number): keyof AgingRow => {
    if (days <= 0) return 'current';
    if (days <= 30) return 'bucket_1_30';
    if (days <= 60) return 'bucket_31_60';
    if (days <= 90) return 'bucket_61_90';
    return 'bucket_over_90';
  };
}

