/**
 * Month-end close assistant: run checks, close period, reopen.
 * All checks are rule-based; AI enhancement optional via ENABLE_AI_MONTH_END.
 */

import { prisma } from '../lib/prisma.js';
import { computeTrialBalanceForOrg } from './accountancy.js';
import { anchorRecord } from './anchoring.js';

export interface CloseCheck {
  id: string;
  name: string;
  checkType: string;
  status: 'passed' | 'failed' | 'warning';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  count?: number;
  details?: Record<string, unknown>;
  action?: string;
  items?: Array<{
    id: string;
    description: string;
    amount: number;
    date?: string;
    suggestion?: string;
    flagType?: string;
  }>;
}

export interface MonthEndResult {
  canClose: boolean;
  checks: CloseCheck[];
  summary: { passed: number; failed: number; warnings: number; critical: number };
  period: { year: number; month: number; startDate: string; endDate: string };
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

async function checkUncategorizedExpenses(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<CloseCheck> {
  // Schema requires category; we treat 'other' as catch-all to review
  const uncategorized = await prisma.expenses.findMany({
    where: {
      org_id: orgId,
      date: { gte: startDate, lte: endDate },
      category: 'other',
      status: { not: 'voided' },
    },
    select: { id: true, description: true, amount: true, date: true },
    orderBy: { amount: 'desc' },
    take: 10,
  });

  return {
    id: 'uncategorized_expenses',
    name: 'All expenses categorized',
    checkType: 'categorization',
    status: uncategorized.length === 0 ? 'passed' : 'warning',
    severity: 'high',
    count: uncategorized.length,
    message:
      uncategorized.length === 0
        ? 'All expenses have categories'
        : `${uncategorized.length} expenses use category "other" – consider reviewing`,
    action: '/expenses?filter=uncategorized',
    items: uncategorized.map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      date: e.date.toISOString().split('T')[0],
    })),
  };
}

async function checkMissingReceipts(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<CloseCheck> {
  const missing = await prisma.expenses.findMany({
    where: {
      org_id: orgId,
      date: { gte: startDate, lte: endDate },
      amount: { gt: 75 },
      receipt_url: null,
      status: { not: 'voided' },
    },
    select: { id: true, description: true, amount: true, date: true },
    orderBy: { amount: 'desc' },
    take: 10,
  });

  return {
    id: 'missing_receipts',
    name: 'Receipts for expenses >$75',
    checkType: 'receipts',
    status: missing.length === 0 ? 'passed' : 'warning',
    severity: 'medium',
    count: missing.length,
    message:
      missing.length === 0
        ? 'All large expenses have receipts'
        : `${missing.length} expenses over $75 need receipts (IRS requirement)`,
    action: '/expenses?filter=missing_receipts',
    items: missing.map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      date: e.date.toISOString().split('T')[0],
    })),
  };
}

async function checkLargeExpenses(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<CloseCheck> {
  const large = await prisma.expenses.findMany({
    where: {
      org_id: orgId,
      date: { gte: startDate, lte: endDate },
      amount: { gt: 1000 },
      status: { not: 'voided' },
      NOT: { tags: { has: 'reviewed:asset' } },
    },
    select: { id: true, description: true, amount: true, date: true, flags: true },
  });

  const possibleAssets = large.filter((e) => {
    const f = (e.flags as any[] | null);
    return Array.isArray(f) && f.some((x: any) => x.type === 'possible_asset');
  });

  return {
    id: 'large_expenses_review',
    name: 'Large expenses reviewed',
    checkType: 'asset_classification',
    status: possibleAssets.length === 0 ? 'passed' : 'warning',
    severity: 'medium',
    count: possibleAssets.length,
    message:
      possibleAssets.length === 0
        ? 'All large expenses reviewed'
        : `${possibleAssets.length} large expenses may be capital assets`,
    action: '/expenses?filter=needs_review',
    items: possibleAssets.map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      date: e.date.toISOString().split('T')[0],
      suggestion: (e.flags as any[])?.find((x: any) => x.type === 'possible_asset')?.suggestion,
    })),
  };
}

async function checkPayrollComplete(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<CloseCheck> {
  const expectedRuns = 2; // default biweekly
  const actualRuns = await prisma.payrolls.count({
    where: {
      org_id: orgId,
      pay_date: { gte: startDate, lte: endDate },
      status: 'completed',
    },
  });
  const isPassed = actualRuns >= expectedRuns;
  return {
    id: 'payroll_complete',
    name: 'Payroll runs complete',
    checkType: 'payroll',
    status: isPassed ? 'passed' : 'warning',
    severity: 'high',
    count: actualRuns,
    message: isPassed
      ? `${actualRuns} payroll run${actualRuns !== 1 ? 's' : ''} completed`
      : `Expected ${expectedRuns} payroll runs, found ${actualRuns}`,
    action: '/payroll',
    details: { expected: expectedRuns, actual: actualRuns, frequency: 'biweekly' },
  };
}

async function checkTrialBalanceBalanced(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<CloseCheck> {
  const tb = await computeTrialBalanceForOrg({
    orgId,
    from: startDate,
    to: endDate,
    basis: 'accrual',
  });
  const totalDebit = tb.totals.debit;
  const totalCredit = tb.totals.credit;
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.01;
  return {
    id: 'trial_balance',
    name: 'Trial balance balanced',
    checkType: 'trial_balance',
    status: isBalanced ? 'passed' : 'failed',
    severity: 'critical',
    message: isBalanced
      ? `Debits ($${totalDebit.toFixed(2)}) = Credits ($${totalCredit.toFixed(2)})`
      : `Trial balance doesn't balance! Difference: $${difference.toFixed(2)}`,
    action: '/accountancy/trial-balance',
    details: { debits: totalDebit, credits: totalCredit, difference },
  };
}

async function checkFlaggedItems(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<CloseCheck> {
  const flagged = await prisma.expenses.findMany({
    where: {
      org_id: orgId,
      date: { gte: startDate, lte: endDate },
      needs_review: true,
      status: { not: 'voided' },
    },
    select: { id: true, description: true, amount: true, flags: true },
    take: 5,
  });
  return {
    id: 'flagged_items',
    name: 'Flagged items resolved',
    checkType: 'review',
    status: flagged.length === 0 ? 'passed' : 'warning',
    severity: 'medium',
    count: flagged.length,
    message:
      flagged.length === 0 ? 'No items flagged for review' : `${flagged.length} items need review`,
    action: '/expenses?filter=needs_review',
    items: flagged.map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      flagType: (e.flags as any[])?.[0]?.type,
    })),
  };
}

async function checkSpendingTrend(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<CloseCheck | null> {
  const current = await prisma.expenses.aggregate({
    where: {
      org_id: orgId,
      date: { gte: startDate, lte: endDate },
      status: { not: 'voided' },
    },
    _sum: { amount: true },
  });
  const prevStart = addMonths(startDate, -1);
  const prevEnd = addMonths(endDate, -1);
  const prev = await prisma.expenses.aggregate({
    where: {
      org_id: orgId,
      date: { gte: prevStart, lte: prevEnd },
      status: { not: 'voided' },
    },
    _sum: { amount: true },
  });
  const currentSum = Number(current._sum?.amount ?? 0);
  const prevSum = Number(prev._sum?.amount ?? 0);
  if (prevSum === 0) return null;
  const percentChange = ((currentSum - prevSum) / prevSum) * 100;
  if (Math.abs(percentChange) < 30) return null;
  return {
    id: 'spending_trend',
    name: 'Spending pattern review',
    checkType: 'trend',
    status: 'warning',
    severity: 'low',
    message: `Spending ${percentChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentChange).toFixed(1)}% vs last month`,
    details: {
      current: currentSum,
      previous: prevSum,
      percentChange: percentChange.toFixed(1),
      direction: percentChange > 0 ? 'increase' : 'decrease',
    },
  };
}

async function checkInvoicesUnpaid(
  orgId: string,
  _startDate: Date,
  _endDate: Date,
): Promise<CloseCheck | null> {
  const unpaid = await prisma.invoices.count({
    where: {
      org_id: orgId,
      status: { in: ['draft', 'sent'] },
      total: { gt: 0 },
    },
  });
  if (unpaid === 0) return null;
  return {
    id: 'unpaid_invoices',
    name: 'Invoice collection status',
    checkType: 'receivables',
    status: 'warning',
    severity: 'low',
    count: unpaid,
    message: `${unpaid} invoice${unpaid !== 1 ? 's' : ''} still unpaid`,
    action: '/invoices',
    details: { count: unpaid },
  };
}

async function runAIMonthEndChecks(
  _orgId: string,
  _startDate: Date,
  _endDate: Date,
  _existingChecks: CloseCheck[],
): Promise<CloseCheck[]> {
  if (!process.env.OPENAI_API_KEY || process.env.ENABLE_AI_MONTH_END !== 'true') return [];
  return [];
}

export async function runMonthEndChecks(
  orgId: string,
  year: number,
  month: number,
): Promise<MonthEndResult> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const results = await Promise.all([
    checkUncategorizedExpenses(orgId, startDate, endDate),
    checkMissingReceipts(orgId, startDate, endDate),
    checkLargeExpenses(orgId, startDate, endDate),
    checkPayrollComplete(orgId, startDate, endDate),
    checkTrialBalanceBalanced(orgId, startDate, endDate),
    checkFlaggedItems(orgId, startDate, endDate),
    checkSpendingTrend(orgId, startDate, endDate),
    checkInvoicesUnpaid(orgId, startDate, endDate),
  ]);

  const checks: CloseCheck[] = results.filter((c): c is CloseCheck => c != null);

  const aiChecks = await runAIMonthEndChecks(orgId, startDate, endDate, checks);
  checks.push(...aiChecks);

  const summary = {
    passed: checks.filter((c) => c.status === 'passed').length,
    failed: checks.filter((c) => c.status === 'failed').length,
    warnings: checks.filter((c) => c.status === 'warning').length,
    critical: checks.filter((c) => c.severity === 'critical' && c.status === 'failed').length,
  };

  const canClose = summary.failed === 0 && summary.critical === 0;

  return {
    canClose,
    checks,
    summary,
    period: {
      year,
      month,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    },
  };
}

export async function closePeriod(
  orgId: string,
  year: number,
  month: number,
  userId: string,
  force = false,
): Promise<{ period: any; anchorResult?: any; checks: CloseCheck[] }> {
  const result = await runMonthEndChecks(orgId, year, month);
  if (!result.canClose && !force) {
    throw new Error(`Cannot close period: ${result.summary.failed} check(s) failed`);
  }
  if (result.summary.critical > 0 && force) {
    throw new Error('Cannot force close when critical issues exist');
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const tb = await computeTrialBalanceForOrg({
    orgId,
    from: new Date(0),
    to: endDate,
    basis: 'accrual',
  });

  const period = await prisma.accounting_periods.upsert({
    where: {
      org_id_year_month_period_type: {
        org_id: orgId,
        year,
        month,
        period_type: 'month',
      },
    },
    create: {
      org_id: orgId,
      period_type: 'month',
      year,
      month,
      start_date: startDate,
      end_date: endDate,
      status: 'closed',
      closed_by: userId,
      closed_at: new Date(),
      final_balances: tb as any,
    },
    update: {
      status: 'closed',
      closed_by: userId,
      closed_at: new Date(),
      final_balances: tb as any,
    },
  });

  let anchorResult: any;
  try {
    anchorResult = await anchorRecord(
      {
        period_id: period.id,
        org_id: orgId,
        year,
        month,
        final_balances: tb,
        checks_summary: result.summary,
        closed_by: userId,
        closed_at: new Date(),
      },
      'accounting_period',
      period.id,
    );
    await prisma.accounting_periods.update({
      where: { id: period.id },
      data: {
        multichain_data_hex: anchorResult.multichainDataHex,
        multichain_txid: anchorResult.multichainTxid,
        polygon_txhash: anchorResult.polygonTxhash,
      },
    });
  } catch {
    // Anchoring optional
  }

  await Promise.all(
    result.checks.map((check) =>
      prisma.period_close_checks.create({
        data: {
          period_id: period.id,
          check_type: check.checkType,
          status: check.status,
          severity: check.severity,
          message: check.message,
          details: (check.details || check) as any,
        },
      }),
    ),
  );

  return { period, anchorResult, checks: result.checks };
}

export async function reopenPeriod(
  orgId: string,
  year: number,
  month: number,
  userId: string,
  reason: string,
): Promise<any> {
  const period = await prisma.accounting_periods.findUnique({
    where: {
      org_id_year_month_period_type: {
        org_id: orgId,
        year,
        month,
        period_type: 'month',
      },
    },
  });
  if (!period) throw new Error('Period not found');
  if (period.status !== 'closed') throw new Error('Period is not closed');

  const updated = await prisma.accounting_periods.update({
    where: { id: period.id },
    data: {
      status: 'reopened',
      reopened_by: userId,
      reopened_at: new Date(),
      reopen_reason: reason,
    },
  });

  try {
    await anchorRecord(
      {
        period_id: period.id,
        action: 'reopened',
        reason,
        reopened_by: userId,
        reopened_at: new Date(),
      },
      'accounting_period_reopen',
      period.id,
    );
  } catch {
    // optional
  }
  return updated;
}
