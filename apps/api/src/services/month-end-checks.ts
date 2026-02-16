/**
 * Month-end close assistant: checks if books are ready to close.
 */

import { prisma } from '../lib/prisma.js';
import { computeTrialBalanceForOrg } from './accountancy.js';
import { checkIfAsset } from './anomaly-detection.js';

export interface MonthEndCheckItem {
  id: string;
  description: string;
  amount: number;
  aiSuggestion?: string;
}

export interface MonthEndCheck {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'warning' | 'info';
  count?: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  action?: string;
  items?: MonthEndCheckItem[];
}

export interface MonthEndResult {
  canClose: boolean;
  checks: MonthEndCheck[];
  summary: { passed: number; failed: number; warnings: number };
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

export async function runMonthEndChecks(
  orgId: string,
  year: number,
  month: number
): Promise<MonthEndResult> {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0);

  const checks: MonthEndCheck[] = [];

  // Check 1: Missing receipts for expenses > $75 (IRS-like requirement)
  const missingReceipts = await prisma.expenses.findMany({
    where: {
      org_id: orgId,
      date: { gte: startOfMonth, lte: endOfMonth },
      amount: { gt: 75 },
      receipt_url: null,
      status: { not: 'voided' },
    },
  });

  checks.push({
    id: 'missing_receipts',
    name: 'Receipts for expenses > $75',
    status: missingReceipts.length === 0 ? 'passed' : 'warning',
    count: missingReceipts.length,
    severity: 'medium',
    message:
      missingReceipts.length === 0
        ? 'All large expenses have receipts'
        : `${missingReceipts.length} expenses over $75 need receipts`,
    action: '/expenses',
    items: missingReceipts.map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
    })),
  });

  // Check 2: Large expenses (might be assets)
  const largeExpensesRaw = await prisma.expenses.findMany({
    where: {
      org_id: orgId,
      date: { gte: startOfMonth, lte: endOfMonth },
      amount: { gt: 1000 },
      status: { not: 'voided' },
    },
  });
  const largeExpenses = largeExpensesRaw.filter((e) => !e.tags?.includes('reviewed:asset'));

  if (largeExpenses.length > 0) {
    const aiReviews = await Promise.all(
      largeExpenses.map((e) =>
        checkIfAsset({ description: e.description, amount: Number(e.amount) }).catch(() => ({ isAsset: false, reasoning: '' }))
      )
    );
    const possibleAssets = largeExpenses.filter((_, i) => aiReviews[i].isAsset);

    checks.push({
      id: 'large_expenses_review',
      name: 'Large expenses reviewed',
      status: possibleAssets.length === 0 ? 'passed' : 'warning',
      count: possibleAssets.length,
      severity: 'medium',
      message:
        possibleAssets.length === 0
          ? 'All large expenses reviewed'
          : `${possibleAssets.length} large expenses may be capital assets`,
      items: possibleAssets.map((e, i) => ({
        id: e.id,
        description: e.description,
        amount: Number(e.amount),
        aiSuggestion: aiReviews[largeExpenses.indexOf(e)].reasoning,
      })),
    });
  }

  // Check 3: Trial balance balanced
  const tb = await computeTrialBalanceForOrg({
    orgId,
    from: startOfMonth,
    to: endOfMonth,
    basis: 'accrual',
  });
  const totalDebit = tb.totals.debit;
  const totalCredit = tb.totals.credit;
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  checks.push({
    id: 'trial_balance',
    name: 'Trial balance is balanced',
    status: balanced ? 'passed' : 'failed',
    severity: 'critical',
    message: balanced
      ? `Debits ($${totalDebit.toFixed(2)}) = Credits ($${totalCredit.toFixed(2)})`
      : `Debits ($${totalDebit.toFixed(2)}) ≠ Credits ($${totalCredit.toFixed(2)})`,
  });

  // Check 4: Spending trend vs last month
  const currentSpend = await prisma.expenses.aggregate({
    where: {
      org_id: orgId,
      date: { gte: startOfMonth, lte: endOfMonth },
      status: { not: 'voided' },
    },
    _sum: { amount: true },
  });

  const lastMonthStart = addMonths(startOfMonth, -1);
  const lastMonthEnd = addMonths(endOfMonth, -1);

  const lastMonthSpend = await prisma.expenses.aggregate({
    where: {
      org_id: orgId,
      date: { gte: lastMonthStart, lte: lastMonthEnd },
      status: { not: 'voided' },
    },
    _sum: { amount: true },
  });

  const currentTotal = Number(currentSpend._sum?.amount ?? 0);
  const lastTotal = Number(lastMonthSpend._sum?.amount ?? 0);
  const percentChange =
    lastTotal > 0 ? ((currentTotal - lastTotal) / lastTotal) * 100 : 0;

  if (Math.abs(percentChange) > 30) {
    checks.push({
      id: 'spending_anomaly',
      name: 'Spending pattern review',
      status: 'info',
      severity: 'low',
      message: `Spending ${percentChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentChange).toFixed(1)}% vs last month`,
      items: [
        {
          id: 'current',
          description: `Current: $${currentTotal.toFixed(2)}`,
          amount: currentTotal,
        },
        {
          id: 'last',
          description: `Last month: $${lastTotal.toFixed(2)}`,
          amount: lastTotal,
        },
      ],
    });
  }

  const passed = checks.filter((c) => c.status === 'passed').length;
  const failed = checks.filter((c) => c.status === 'failed').length;
  const warnings = checks.filter((c) => c.status === 'warning').length;

  return {
    canClose: failed === 0,
    checks,
    summary: { passed, failed, warnings },
  };
}
