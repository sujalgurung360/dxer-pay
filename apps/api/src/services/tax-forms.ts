/**
 * Tax forms auto-generation: W-2, 1099-NEC, Form 1120, depreciation schedule.
 * Uses existing P&L and trial balance; no AI required.
 */

import { prisma } from '../lib/prisma.js';
import { computeProfitAndLossForOrg, computeTrialBalanceForOrg } from './accountancy.js';

const SS_WAGE_LIMIT = 168_600; // 2024
const SS_RATE = 0.062;
const MEDICARE_RATE = 0.0145;

function parseFullName(fullName: string): { firstName: string; lastName: string; middleInitial: string } {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '', middleInitial: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '', middleInitial: '' };
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const middleInitial = parts.length > 2 ? parts[1].charAt(0) : '';
  return { firstName, lastName, middleInitial };
}

export async function generateW2(employeeId: string, year: number): Promise<Record<string, unknown>> {
  const entries = await prisma.payroll_entries.findMany({
    where: {
      employee_id: employeeId,
      payroll: {
        pay_date: {
          gte: new Date(`${year}-01-01`),
          lte: new Date(`${year}-12-31`),
        },
        status: 'completed',
      },
    },
    include: { employee: true, payroll: true },
    orderBy: { payroll: { pay_date: 'asc' } },
  });

  if (entries.length === 0) {
    throw new Error(`No payroll entries found for employee in ${year}`);
  }

  const employee = entries[0].employee;
  const org = await prisma.organizations.findUnique({ where: { id: employee.org_id } });
  if (!org) throw new Error('Organization not found');

  const totals = entries.reduce(
    (acc, entry) => {
      const gross = Number(entry.amount);
      const e = entry as any;
      const fed = e.federal_withholding != null ? Number(e.federal_withholding) : 0;
      const state = e.state_withholding != null ? Number(e.state_withholding) : 0;
      const ss = e.social_security_tax != null ? Number(e.social_security_tax) : gross * SS_RATE;
      const med = e.medicare_tax != null ? Number(e.medicare_tax) : gross * MEDICARE_RATE;
      return {
        grossWages: acc.grossWages + gross,
        federalWithholding: acc.federalWithholding + fed,
        stateWithholding: acc.stateWithholding + state,
        socialSecurityTax: acc.socialSecurityTax + ss,
        medicareTax: acc.medicareTax + med,
      };
    },
    { grossWages: 0, federalWithholding: 0, stateWithholding: 0, socialSecurityTax: 0, medicareTax: 0 },
  );

  let socialSecurityWages = Math.min(totals.grossWages, SS_WAGE_LIMIT);
  const socialSecurityTax = Number((socialSecurityWages * SS_RATE).toFixed(2));
  const medicareWages = totals.grossWages;
  const medicareTax = Number((medicareWages * MEDICARE_RATE).toFixed(2));

  const { firstName, lastName, middleInitial } = parseFullName(employee.full_name);
  const ein = (org as any).ein ?? org.registration_number ?? '';

  return {
    year,
    employee: {
      ssn: (employee as any).ssn ?? '',
      firstName,
      lastName,
      middleInitial,
      address: (employee as any).address ?? '',
      city: (employee as any).city ?? '',
      state: (employee as any).state ?? '',
      zip: (employee as any).zip ?? '',
    },
    employer: {
      ein,
      name: org.name,
      address: (org as any).address ?? '',
      city: (org as any).city ?? '',
      state: (org as any).state ?? '',
      zip: (org as any).zip ?? '',
    },
    box1_wages: Number(totals.grossWages.toFixed(2)),
    box2_federalTax: Number(totals.federalWithholding.toFixed(2)),
    box3_socialSecurityWages: Number(socialSecurityWages.toFixed(2)),
    box4_socialSecurityTax: socialSecurityTax,
    box5_medicareWages: Number(medicareWages.toFixed(2)),
    box6_medicareTax: medicareTax,
    box15_state: (org as any).state ?? '',
    box16_stateWages: Number(medicareWages.toFixed(2)),
    box17_stateTax: Number(totals.stateWithholding.toFixed(2)),
    payrollCount: entries.length,
    firstPayDate: entries[0].payroll.pay_date,
    lastPayDate: entries[entries.length - 1].payroll.pay_date,
  };
}

export async function generateAllW2s(orgId: string, year: number): Promise<Record<string, unknown>[]> {
  const employees = await prisma.employees.findMany({
    where: { org_id: orgId, is_active: true },
  });
  const results: Record<string, unknown>[] = [];
  for (const emp of employees) {
    try {
      const w2 = await generateW2(emp.id, year);
      results.push(w2);
    } catch (err) {
      console.error(`W-2 failed for ${emp.full_name}:`, err);
    }
  }
  return results;
}

export async function generate1099NEC(orgId: string, year: number): Promise<Record<string, unknown>[]> {
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year}-12-31`);

  const expenses = await (prisma as any).expenses.findMany({
    where: {
      org_id: orgId,
      date: { gte: start, lte: end },
      status: { not: 'voided' },
      contractor_id: { not: null },
    },
    include: { contractor: true },
  }) as Array<{ contractor_id: string | null; amount: { toString(): string }; contractor: any }>;

  const byContractor = new Map<string, { contractor: any; total: number; count: number }>();
  for (const e of expenses) {
    const cid = e.contractor_id;
    if (!cid) continue;
    const contractor = e.contractor;
    const amt = Number(e.amount);
    const existing = byContractor.get(cid);
    if (existing) {
      existing.total += amt;
      existing.count += 1;
    } else {
      byContractor.set(cid, { contractor, total: amt, count: 1 });
    }
  }

  const org = await prisma.organizations.findUnique({ where: { id: orgId } });
  if (!org) return [];

  const ein = (org as any).ein ?? org.registration_number ?? '';
  const forms: Record<string, unknown>[] = [];

  for (const [, v] of byContractor) {
    if (v.total < 600) continue;
    forms.push({
      year,
      payer: {
        ein,
        name: org.name,
        address: (org as any).address ?? '',
        city: (org as any).city ?? '',
        state: (org as any).state ?? '',
        zip: (org as any).zip ?? '',
      },
      recipient: {
        name: v.contractor.name,
        businessName: v.contractor.business_name ?? '',
        tinEin: v.contractor.ein_or_ssn ?? '',
        address: v.contractor.address ?? '',
        city: v.contractor.city ?? '',
        state: v.contractor.state ?? '',
        zip: v.contractor.zip ?? '',
      },
      box1_nonemployeeCompensation: Number(v.total.toFixed(2)),
      paymentCount: v.count,
      contractorId: v.contractor.id,
    });
  }
  return forms;
}

async function getTotalDepreciation(orgId: string, year: number): Promise<number> {
  const result = await (prisma as any).depreciation_entries.aggregate({
    where: { org_id: orgId, period_year: year },
    _sum: { depreciation_amount: true },
  });
  return Number(result._sum?.depreciation_amount ?? 0);
}

async function getFixedAssetsTotal(orgId: string, category: string): Promise<number> {
  const assets = await (prisma as any).fixed_assets.findMany({
    where: { org_id: orgId, status: 'active', ...(category ? { category } : {}) },
  });
  return assets.reduce((sum: number, a: any) => {
    const cost = Number(a.cost);
    const acc = Number(a.accumulated_depreciation ?? 0);
    return sum + (cost - acc);
  }, 0);
}

export async function generate1120(orgId: string, year: number): Promise<Record<string, unknown>> {
  const startDate = new Date(`${year}-01-01`);
  const endDate = new Date(`${year}-12-31`);

  const pl = await computeProfitAndLossForOrg({
    orgId,
    from: startDate,
    to: endDate,
    basis: 'accrual',
  });

  const tb = await computeTrialBalanceForOrg({
    orgId,
    from: new Date(0),
    to: endDate,
    basis: 'accrual',
  });

  const org = await prisma.organizations.findUnique({ where: { id: orgId } });
  if (!org) throw new Error('Organization not found');

  const rows = pl.rows || [];
  const findExpense = (code: string) => rows.find((r: any) => r.code === code)?.amount ?? 0;

  const totalDepreciation = await getTotalDepreciation(orgId, year);
  const otherDeductions = rows
    .filter((r: any) => r.section === 'expense' && !['6000', '6010', '6100', '6300', '6900'].includes(r.code))
    .reduce((sum: number, r: any) => sum + r.amount, 0);

  const accounts = tb.accounts || [];
  const getBalance = (code: string) => accounts.find((a: any) => a.code === code)?.balance ?? 0;

  return {
    year,
    company: {
      name: org.name,
      ein: (org as any).ein ?? org.registration_number ?? '',
      address: (org as any).address ?? '',
      city: (org as any).city ?? '',
      state: (org as any).state ?? '',
      zip: (org as any).zip ?? '',
    },
    line1a_grossReceipts: pl.totals.revenue ?? 0,
    line2_costOfGoodsSold: pl.totals.cogs ?? 0,
    line3_grossProfit: (pl.totals.revenue ?? 0) - (pl.totals.cogs ?? 0),
    line12_compensation: findExpense('6000'),
    line16_rents: findExpense('6100'),
    line17_taxes: findExpense('6010'),
    line20_depreciation: totalDepreciation,
    line22_advertising: findExpense('6300'),
    line25_otherDeductions: otherDeductions,
    line27_totalDeductions: pl.totals.expenses ?? 0,
    line28_taxableIncome: pl.totals.netIncome ?? 0,
    scheduleL: {
      cash: getBalance('1000'),
      accountsReceivable: getBalance('1100'),
      inventory: getBalance('1300'),
      accountsPayable: getBalance('2000'),
      retainedEarnings: getBalance('3100'),
      depreciableAssets: await getFixedAssetsTotal(orgId, 'equipment'),
    },
  };
}

function calculateMonthsOwned(purchaseDate: Date, year: number): number {
  const start = new Date(Math.max(purchaseDate.getTime(), new Date(`${year}-01-01`).getTime()));
  const end = new Date(`${year}-12-31`);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(0, Math.min(12, months));
}

function calculateAnnualDepreciation(asset: any, year: number): number {
  const monthsOwned = calculateMonthsOwned(asset.purchase_date, year);
  const cost = Number(asset.cost);
  const salvage = Number((asset.salvage_value ?? 0));
  const lifeYears = asset.useful_life_years ?? 5;
  const monthly = (cost - salvage) / (lifeYears * 12);
  return Number((monthly * monthsOwned).toFixed(2));
}

export async function generateDepreciationSchedule(
  orgId: string,
  year: number,
): Promise<Record<string, unknown>> {
  const assets = await (prisma as any).fixed_assets.findMany({
    where: {
      org_id: orgId,
      status: { in: ['active', 'fully_depreciated'] },
      purchase_date: { lte: new Date(`${year}-12-31`) },
    },
    orderBy: { purchase_date: 'asc' },
  });

  const schedule = assets.map((asset: any) => {
    const cost = Number(asset.cost);
    const acc = Number((asset as any).accumulated_depreciation ?? 0);
    const annualDepr = calculateAnnualDepreciation(asset, year);
    return {
      assetId: asset.id,
      description: asset.name,
      category: (asset as any).category ?? '',
      dateAcquired: asset.purchase_date,
      cost,
      depreciationMethod: asset.depreciation_method,
      usefulLife: asset.useful_life_years,
      currentYearDepreciation: annualDepr,
      accumulatedDepreciation: acc,
      netBookValue: cost - acc,
    };
  });

  const totals = {
    totalCost: schedule.reduce((s: number, x: any) => s + x.cost, 0),
    totalCurrentYearDepreciation: schedule.reduce((s: number, x: any) => s + x.currentYearDepreciation, 0),
    totalAccumulatedDepreciation: schedule.reduce((s: number, x: any) => s + x.accumulatedDepreciation, 0),
    totalNetBookValue: schedule.reduce((s: number, x: any) => s + x.netBookValue, 0),
  };

  return { year, assets: schedule, totals };
}
