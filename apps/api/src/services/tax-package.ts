/**
 * One-click tax package: ZIP with cover letter, P&L, balance sheet,
 * Form 1120, W-2s, 1099-NECs, depreciation schedule, GL/expense Excel, verification report.
 */

import { prisma } from '../lib/prisma.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createZip } from '../lib/zip-utils.js';
import { computeProfitAndLossForOrg, computeTrialBalanceForOrg } from './accountancy.js';
import {
  generateAllW2s,
  generate1099NEC,
  generate1120,
  generateDepreciationSchedule,
} from './tax-forms.js';

const EXPIRY_DAYS = 90;

export async function generateTaxPackage(
  orgId: string,
  year: number,
  userId: string,
): Promise<{ packageId: string; url: string; files: string[]; size: number }> {
  const taxPackage = await (prisma as any).tax_packages.create({
    data: {
      org_id: orgId,
      tax_year: year,
      package_type: 'annual',
      status: 'generating',
      generated_by: userId,
    },
  });

  try {
    const org = await prisma.organizations.findUnique({ where: { id: orgId } });
    if (!org) throw new Error('Organization not found');

    const files: Record<string, Buffer> = {};

    files['00-cover-letter.pdf'] = await stubCoverLetterPDF(org, year);
    files['01-profit-loss.pdf'] = await stubPLPDF(orgId, year, org);
    files['02-balance-sheet.pdf'] = await stubBSPDF(orgId, year, org);
    const form1120 = await generate1120(orgId, year);
    files['03-form-1120.pdf'] = await stub1120PDF(form1120);
    const w2s = await generateAllW2s(orgId, year);
    if (w2s.length > 0) {
      files['04-w2-forms.pdf'] = await stubW2sPDF(w2s);
    }
    const form1099s = await generate1099NEC(orgId, year);
    if (form1099s.length > 0) {
      files['05-1099-nec-forms.pdf'] = await stub1099PDF(form1099s);
    }
    const depSchedule = await generateDepreciationSchedule(orgId, year);
    if ((depSchedule.assets as any[]).length > 0) {
      files['06-depreciation-schedule.pdf'] = await stubDepSchedulePDF(depSchedule);
    }
    files['07-general-ledger.xlsx'] = await stubGLExcel(orgId, year);
    files['08-expense-details.xlsx'] = await stubExpenseExcel(orgId, year);
    files['09-blockchain-verification.pdf'] = await stubVerificationPDF(orgId, year);

    const zipBuffer = await createZip(files);
    const fileName = `${orgId}/${year}/tax-package-${Date.now()}.zip`;

    const { error } = await getSupabaseAdmin().storage
      .from('tax-packages')
      .upload(fileName, zipBuffer, { contentType: 'application/zip', upsert: true });

    if (error) throw error;

    const {
      data: { publicUrl },
    } = getSupabaseAdmin().storage.from('tax-packages').getPublicUrl(fileName);

    await (prisma as any).tax_packages.update({
      where: { id: taxPackage.id },
      data: {
        status: 'completed',
        file_url: publicUrl,
        file_size_bytes: BigInt(zipBuffer.length),
        contents: Object.keys(files),
        expires_at: new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    return {
      packageId: taxPackage.id,
      url: publicUrl,
      files: Object.keys(files),
      size: zipBuffer.length,
    };
  } catch (err) {
    await (prisma as any).tax_packages.update({
      where: { id: taxPackage.id },
      data: { status: 'failed' },
    });
    throw err;
  }
}

// Stub PDF/Excel generators (return minimal content; replace with real PDF/Excel lib later)
async function stubCoverLetterPDF(org: any, year: number): Promise<Buffer> {
  const text = `Tax Package Cover Letter\n\nDear Accountant,\n\nEnclosed are the financial records for ${org.name} for the year ending December 31, ${year}.\n\nPlease review and prepare tax returns.\n\nBest regards,\nDXER Pay\n`;
  return Buffer.from(text, 'utf-8');
}

async function stubPLPDF(orgId: string, year: number, org: any): Promise<Buffer> {
  const pl = await computeProfitAndLossForOrg({
    orgId,
    from: new Date(`${year}-01-01`),
    to: new Date(`${year}-12-31`),
    basis: 'accrual',
  });
  const lines = [
    `Profit & Loss — ${org.name}`,
    `Period: ${pl.from} to ${pl.to}`,
    `Revenue: ${pl.totals.revenue}`,
    `COGS: ${pl.totals.cogs}`,
    `Gross Profit: ${pl.totals.grossProfit}`,
    `Expenses: ${pl.totals.expenses}`,
    `Net Income: ${pl.totals.netIncome}`,
  ];
  return Buffer.from(lines.join('\n'), 'utf-8');
}

async function stubBSPDF(orgId: string, year: number, org: any): Promise<Buffer> {
  const tb = await computeTrialBalanceForOrg({
    orgId,
    from: new Date(0),
    to: new Date(`${year}-12-31`),
    basis: 'accrual',
  });
  const lines = [
    `Balance Sheet — ${org.name}`,
    `As of ${tb.to}`,
    ...(tb.accounts || []).map((a: any) => `${a.code} ${a.name}: ${a.balance}`),
  ];
  return Buffer.from(lines.join('\n'), 'utf-8');
}

async function stub1120PDF(data: any): Promise<Buffer> {
  return Buffer.from(
    `Form 1120 Pre-fill\nYear: ${data.year}\nCompany: ${(data.company && data.company.name) || ''}\nTaxable Income: ${data.line28_taxableIncome ?? ''}\n`,
    'utf-8',
  );
}

async function stubW2sPDF(w2s: any[]): Promise<Buffer> {
  const lines = w2s.map(
    (w, i) =>
      `W-2 ${i + 1}: ${w.employee?.firstName} ${w.employee?.lastName} — Box 1 Wages: ${w.box1_wages}`,
  );
  return Buffer.from(lines.join('\n'), 'utf-8');
}

async function stub1099PDF(forms: any[]): Promise<Buffer> {
  const lines = forms.map(
    (f, i) =>
      `1099-NEC ${i + 1}: ${f.recipient?.name} — Box 1: ${f.box1_nonemployeeCompensation}`,
  );
  return Buffer.from(lines.join('\n'), 'utf-8');
}

async function stubDepSchedulePDF(schedule: any): Promise<Buffer> {
  const lines = [
    `Depreciation Schedule — Year ${schedule.year}`,
    ...(schedule.assets || []).map(
      (a: any) => `${a.description}: Cost ${a.cost}, Current Year Depr ${a.currentYearDepreciation}`,
    ),
    `Total current year depreciation: ${(schedule.totals && schedule.totals.totalCurrentYearDepreciation) || 0}`,
  ];
  return Buffer.from(lines.join('\n'), 'utf-8');
}

async function stubGLExcel(_orgId: string, _year: number): Promise<Buffer> {
  return Buffer.from('General Ledger (Excel placeholder)\n', 'utf-8');
}

async function stubExpenseExcel(_orgId: string, _year: number): Promise<Buffer> {
  return Buffer.from('Expense Details (Excel placeholder)\n', 'utf-8');
}

async function stubVerificationPDF(_orgId: string, _year: number): Promise<Buffer> {
  return Buffer.from('Blockchain Verification Report (placeholder)\n', 'utf-8');
}
