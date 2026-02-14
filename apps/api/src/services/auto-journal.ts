/**
 * Auto-generate journal entries from expenses, invoices, and payroll.
 * Called when transactions are created/approved/completed.
 */

import { prisma } from '../lib/prisma.js';
import { createJournalEntry } from './journal-entries.js';

/** Avoid double-creation: return true if journal already exists for this reference */
async function hasJournalForReference(
  referenceType: string,
  referenceId: string,
): Promise<boolean> {
  const count = await (prisma as any).journal_entries?.count({
    where: { reference_type: referenceType, reference_id: referenceId, status: 'posted' },
  }).catch(() => 0);
  return (count ?? 0) > 0;
}

function getCategoryAccountCode(category: string, tags: string[] = [], hasProductionBatch = false): string {
  const lowerTags = (tags || []).map((t) => String(t).toLowerCase());
  const overrideTag = lowerTags.find((t) => t.startsWith('acct:'));
  if (overrideTag) {
    const code = overrideTag.slice('acct:'.length).trim();
    if (code && ['1000','1100','2000','2100','4000','5000','5010','6000','6010','6100','6200','6300','6400','6999'].includes(code)) {
      return code;
    }
  }
  const normalized = (category || '').toLowerCase();
  const tagString = lowerTags.join(' ');
  if (hasProductionBatch || tagString.includes('factory') || tagString.includes('production')) return '5010';
  if (normalized.includes('software') || normalized.includes('saas')) return '6200';
  if (normalized.includes('rent') || normalized.includes('lease')) return '6100';
  if (normalized.includes('marketing') || normalized.includes('ads') || normalized.includes('advert')) return '6300';
  if (normalized.includes('office') || normalized.includes('supplies')) return '6400';
  return '6999';
}

function getPaymentCreditAccount(tags: string[] = []): string {
  const lowerTags = (tags || []).map((t) => String(t).toLowerCase());
  const payTag = lowerTags.find((t) => t.startsWith('pay:'));
  const mode = payTag ? payTag.slice('pay:'.length) : 'ap';
  if (mode === 'bank' || mode === 'cash') return '1000';
  return '2000';
}

export async function createExpenseJournal(expense: any, userId: string) {
  const amount = Number(expense.amount);
  if (!amount || amount <= 0) return;
  if (await hasJournalForReference('expense', expense.id)) return;

  const category = expense.category || 'miscellaneous';
  const tags = expense.tags || [];
  const hasProductionBatch = !!expense.production_batch_id;

  const expenseAccount = getCategoryAccountCode(category, tags, hasProductionBatch);
  const creditAccount = getPaymentCreditAccount(tags);

  await createJournalEntry({
    orgId: expense.org_id,
    entryDate: expense.date instanceof Date ? expense.date : new Date(expense.date),
    description: `Expense: ${expense.description || ''}`,
    referenceType: 'expense',
    referenceId: expense.id,
    lines: [
      { accountCode: expenseAccount, debitAmount: amount, description: expense.description },
      { accountCode: creditAccount, creditAmount: amount, description: 'To be paid' },
    ],
    createdBy: userId,
  });
}

export async function createInvoiceJournal(invoice: any, userId: string) {
  const total = Number(invoice.total);
  if (!total || total <= 0) return;
  if (await hasJournalForReference('invoice', invoice.id)) return;

  const lineItems = invoice.line_items || [];
  const revenueAccount = lineItems.length > 0 &&
    lineItems.every((li: any) => String(li.description || '').toLowerCase().includes('subscription'))
    ? '4010' : '4000';

  await createJournalEntry({
    orgId: invoice.org_id,
    entryDate: invoice.due_date instanceof Date ? invoice.due_date : new Date(invoice.due_date),
    description: `Invoice ${invoice.invoice_number}`,
    referenceType: 'invoice',
    referenceId: invoice.id,
    lines: [
      { accountCode: '1100', debitAmount: total, description: `Invoice ${invoice.invoice_number}` },
      { accountCode: revenueAccount, creditAmount: total, description: 'Revenue recognized' },
    ],
    createdBy: userId,
  });
}

export async function createInvoicePaymentJournal(invoice: any, userId: string) {
  const total = Number(invoice.total);
  if (!total || total <= 0) return;
  if (await hasJournalForReference('invoice_payment', invoice.id)) return;

  const paymentDate = invoice.payment_date ? new Date(invoice.payment_date) : new Date();

  await createJournalEntry({
    orgId: invoice.org_id,
    entryDate: paymentDate,
    description: `Payment received: Invoice ${invoice.invoice_number}`,
    referenceType: 'invoice_payment',
    referenceId: invoice.id,
    lines: [
      { accountCode: '1000', debitAmount: total, description: 'Payment received' },
      { accountCode: '1100', creditAmount: total, description: `Payment for Invoice ${invoice.invoice_number}` },
    ],
    createdBy: userId,
  });
}

export async function createPayrollJournal(payroll: any, userId: string) {
  const totalGross = Number(payroll.total_amount);
  if (!totalGross || totalGross <= 0) return;
  if (await hasJournalForReference('payroll', payroll.id)) return;

  // Simplified: Debit wages, Credit payroll liabilities (until paid out)
  await createJournalEntry({
    orgId: payroll.org_id,
    entryDate: payroll.pay_date instanceof Date ? payroll.pay_date : new Date(payroll.pay_date),
    description: `Payroll ${String(payroll.period_start).slice(0, 10)} to ${String(payroll.period_end).slice(0, 10)}`,
    referenceType: 'payroll',
    referenceId: payroll.id,
    lines: [
      { accountCode: '6000', debitAmount: totalGross, description: 'Gross payroll' },
      { accountCode: '2100', creditAmount: totalGross, description: 'Payroll liabilities' },
    ],
    createdBy: userId,
  });
}
