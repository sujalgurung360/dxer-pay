/**
 * Persistent journal entries: create, void, query.
 * Journal entries are stored in the database and blockchain-anchored.
 */

import { prisma } from '../lib/prisma.js';
import { anchorRecord } from './anchoring.js';
import { logger } from '../lib/logger.js';

export interface JournalEntryLineInput {
  accountCode: string;
  debitAmount?: number;
  creditAmount?: number;
  description?: string;
}

export interface CreateJournalEntryParams {
  orgId: string;
  entryDate: Date;
  description: string;
  referenceType?: string;
  referenceId?: string;
  lines: JournalEntryLineInput[];
  createdBy: string;
}

export async function createJournalEntry(params: CreateJournalEntryParams) {
  const { orgId, entryDate, description, referenceType, referenceId, lines, createdBy } = params;

  const totalDebits = lines.reduce((sum, l) => sum + (l.debitAmount || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (l.creditAmount || 0), 0);

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Journal entry doesn't balance: Debits ${totalDebits} ≠ Credits ${totalCredits}`);
  }

  const entryNumber = await generateEntryNumber(orgId, entryDate);

  // Resolve accounts from chart_of_accounts or fallback to static list
  const accountCodes = [...new Set(lines.map((l) => l.accountCode))];
  const accounts = await (prisma as any).chart_of_accounts?.findMany({
    where: { org_id: orgId, account_code: { in: accountCodes }, is_active: true },
  }).catch(() => []) as Array<{ id: string; account_code: string; account_name: string }> | undefined;

  const accountMap = new Map<string | undefined, { id: string; account_code: string; account_name: string }>();
  const staticAccounts = getStaticAccountNames();
  for (const code of accountCodes) {
    const found = accounts?.find((a: any) => a.account_code === code);
    if (found) {
      accountMap.set(code, found);
    } else if (staticAccounts[code]) {
      accountMap.set(code, { id: '', account_code: code, account_name: staticAccounts[code] });
    } else {
      throw new Error(`Account ${code} not found in chart of accounts`);
    }
  }

  const journalEntry = await prisma.$transaction(async (tx: any) => {
    const entry = await tx.journal_entries.create({
      data: {
        org_id: orgId,
        entry_number: entryNumber,
        entry_date: entryDate,
        description,
        reference_type: referenceType,
        reference_id: referenceId,
        status: 'posted',
        created_by: createdBy,
      },
    });

    const createdLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const acc = accountMap.get(line.accountCode);
      const debit = line.debitAmount || 0;
      const credit = line.creditAmount || 0;
      const created = await tx.journal_entry_lines.create({
        data: {
          journal_entry_id: entry.id,
          account_id: acc?.id || null,
          account_code: line.accountCode,
          account_name: acc?.account_name || staticAccounts[line.accountCode] || line.accountCode,
          debit_amount: debit,
          credit_amount: credit,
          line_number: i + 1,
          description: line.description,
        },
      });
      createdLines.push(created);
    }

    return { ...entry, lines: createdLines };
  });

  anchorJournalEntry(journalEntry.id, orgId).catch((err: Error) =>
    logger.error({ err, journalEntryId: journalEntry.id }, 'Failed to anchor journal entry'),
  );

  return journalEntry;
}

function getStaticAccountNames(): Record<string, string> {
  return {
    '1000': 'Bank: Operating',
    '1100': 'Accounts Receivable',
    '1200': 'Prepayments',
    '1300': 'Inventory',
    '1800': 'Fixed Assets: Equipment',
    '1850': 'Accumulated Depreciation',
    '2000': 'Accounts Payable',
    '2100': 'Payroll Liabilities',
    '2200': 'Credit Card',
    '3000': 'Owner Equity',
    '3100': 'Retained Earnings',
    '4000': 'Revenue: Products',
    '4010': 'Revenue: Subscriptions',
    '4020': 'Other Income',
    '5000': 'COGS: Materials',
    '5010': 'COGS: Production',
    '6000': 'Payroll: Wages',
    '6010': 'Payroll: Taxes & Benefits',
    '6100': 'Rent',
    '6200': 'Software & SaaS',
    '6300': 'Marketing & Advertising',
    '6310': 'Meals & Entertainment',
    '6400': 'Office Supplies',
    '6500': 'Travel',
    '6700': 'Utilities',
    '6800': 'Legal & Professional Fees',
    '6900': 'Repairs & Maintenance',
    '6999': 'Miscellaneous Expenses',
  };
}

async function generateEntryNumber(orgId: string, entryDate: Date): Promise<string> {
  const year = entryDate.getFullYear();

  const lastEntry = await (prisma as any).journal_entries
    ?.findFirst({
      where: { org_id: orgId, entry_number: { startsWith: `JE-${year}-` } },
      orderBy: { entry_number: 'desc' },
      select: { entry_number: true },
    })
    .catch(() => null);

  let nextNumber = 1;
  if (lastEntry?.entry_number) {
    const parts = lastEntry.entry_number.split('-');
    const lastNum = parseInt(parts[2] || '0', 10);
    nextNumber = lastNum + 1;
  }

  return `JE-${year}-${nextNumber.toString().padStart(4, '0')}`;
}

async function anchorJournalEntry(journalEntryId: string, orgId?: string) {
  const entry = await (prisma as any).journal_entries?.findUnique({
    where: { id: journalEntryId },
    include: { lines: true },
  });

  if (!entry) return;

  const anchorData = {
    entry_number: entry.entry_number,
    entry_date: entry.entry_date.toISOString?.() ?? entry.entry_date,
    description: entry.description,
    lines: (entry.lines || []).map((l: any) => ({
      account_code: l.account_code,
      debit: Number(l.debit_amount),
      credit: Number(l.credit_amount),
    })),
    total_debits: (entry.lines || []).reduce((s: number, l: any) => s + Number(l.debit_amount), 0),
    total_credits: (entry.lines || []).reduce((s: number, l: any) => s + Number(l.credit_amount), 0),
  };

  const result = await anchorRecord(anchorData, 'journal_entry', journalEntryId);

  await (prisma as any).journal_entries?.update({
    where: { id: journalEntryId },
    data: {
      multichain_data_hex: result.multichainDataHex,
      multichain_txid: result.multichainTxid,
      polygon_txhash: result.polygonTxhash,
    },
  });
}

export async function voidJournalEntry(
  journalEntryId: string,
  userId: string,
  reason: string,
) {
  await (prisma as any).journal_entries?.update({
    where: { id: journalEntryId },
    data: {
      status: 'voided',
      voided_by: userId,
      voided_at: new Date(),
      void_reason: reason,
    },
  });

  await anchorRecord(
    {
      action: 'voided',
      journal_entry_id: journalEntryId,
      reason,
      voided_by: userId,
    },
    'journal_entry_void',
    journalEntryId,
  );
}

export interface GetJournalEntriesFilters {
  startDate?: Date;
  endDate?: Date;
  accountCode?: string;
  referenceType?: string;
  status?: string;
  limit?: number;
}

export async function getJournalEntries(
  orgId: string,
  filters: GetJournalEntriesFilters,
) {
  const where: Record<string, unknown> = { org_id: orgId };

  if (filters.startDate || filters.endDate) {
    where.entry_date = {};
    if (filters.startDate) (where.entry_date as any).gte = filters.startDate;
    if (filters.endDate) (where.entry_date as any).lte = filters.endDate;
  }
  if (filters.referenceType) where.reference_type = filters.referenceType;
  if (filters.status) where.status = filters.status;

  let entries = await (prisma as any).journal_entries?.findMany({
    where,
    include: {
      lines: { orderBy: { line_number: 'asc' } },
    },
    orderBy: { entry_date: 'desc' },
    take: filters.limit || 100,
  }).catch(() => []);

  if (filters.accountCode && Array.isArray(entries)) {
    entries = entries.filter((e: any) =>
      (e.lines || []).some((l: any) => l.account_code === filters.accountCode),
    );
  }

  return entries || [];
}
