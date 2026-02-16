/**
 * Anomaly detection for expenses: rule-based checks with optional AI enhancement.
 * Works fully without AI; enable ENABLE_AI_ANOMALY_DETECTION for AI enhancements.
 */

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';

export interface AnomalyFlag {
  type:
    | 'amount_spike'
    | 'possible_duplicate'
    | 'possible_asset'
    | 'unusual_merchant'
    | 'data_entry_error'
    | 'missing_receipt';
  severity: 'critical' | 'low' | 'medium' | 'high';
  message: string;
  suggestion?: string;
  relatedId?: string;
  autoFix?: {
    action: string;
    usefulLife?: number;
    suggestedAmount?: number;
    category?: string;
  };
}

interface ExpenseInput {
  id?: string;
  description: string;
  amount: number;
  date: Date;
  orgId: string;
  notes?: string;
  receipt_url?: string | null;
}

const openai =
  process.env.OPENAI_API_KEY && process.env.ENABLE_AI_ANOMALY_DETECTION === 'true'
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    : null;

async function checkAmountAnomaly(
  expense: ExpenseInput,
  orgId: string,
): Promise<AnomalyFlag | null> {
  const searchTerm = (expense.description || '').trim().slice(0, 20) || '';
  if (searchTerm.length < 2) return null;

  const history = await prisma.expenses.aggregate({
    where: {
      org_id: orgId,
      description: { contains: searchTerm.slice(0, 10), mode: 'insensitive' },
      status: { not: 'voided' },
      ...(expense.id ? { id: { not: expense.id } } : {}),
    },
    _avg: { amount: true },
    _count: true,
  });

  const avgAmount = Number(history._avg?.amount ?? 0);
  const count = history._count ?? 0;
  if (count < 3 || avgAmount <= 0) return null;

  const ratio = expense.amount / avgAmount;

  if (ratio > 10) {
    return {
      type: 'amount_spike',
      severity: 'critical',
      message: `Amount $${expense.amount.toLocaleString()} is ${Math.floor(ratio)}x larger than typical ${expense.description} purchase (avg: $${avgAmount.toFixed(2)})`,
      suggestion:
        'This is extremely unusual. Verify amount is correct or check for decimal point error.',
    };
  }
  if (ratio > 5) {
    return {
      type: 'amount_spike',
      severity: 'high',
      message: `Amount is ${ratio.toFixed(1)}x larger than usual`,
      suggestion:
        'Verify this is correct. Common causes: bulk purchase, annual payment, or data entry error.',
    };
  }
  if (ratio > 3) {
    return {
      type: 'amount_spike',
      severity: 'medium',
      message: `Amount is ${ratio.toFixed(1)}x larger than usual for ${expense.description}`,
      suggestion: 'Please confirm amount is correct.',
    };
  }
  return null;
}

async function checkDuplicates(
  expense: ExpenseInput,
  orgId: string,
): Promise<AnomalyFlag | null> {
  const threeDaysAgo = new Date(expense.date);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysLater = new Date(expense.date);
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);

  const exactDuplicate = await prisma.expenses.findFirst({
    where: {
      org_id: orgId,
      description: expense.description,
      amount: expense.amount,
      date: { gte: threeDaysAgo, lte: threeDaysLater },
      status: { not: 'voided' },
      ...(expense.id ? { id: { not: expense.id } } : {}),
    },
  });

  if (exactDuplicate) {
    return {
      type: 'possible_duplicate',
      severity: 'critical',
      message: `Duplicate detected: ${exactDuplicate.description} $${Number(exactDuplicate.amount)} on ${exactDuplicate.date.toISOString().split('T')[0]}`,
      suggestion: 'This appears to be a duplicate. If confirmed, void one of them.',
      relatedId: exactDuplicate.id,
    };
  }

  const expenseDate = expense.date instanceof Date ? expense.date : new Date(expense.date);
  const nearDuplicate = await prisma.expenses.findFirst({
    where: {
      org_id: orgId,
      description: expense.description,
      amount: {
        gte: expense.amount * 0.95,
        lte: expense.amount * 1.05,
      },
      date: expenseDate,
      status: { not: 'voided' },
      ...(expense.id ? { id: { not: expense.id } } : {}),
    },
  });

  if (nearDuplicate) {
    return {
      type: 'possible_duplicate',
      severity: 'high',
      message: 'Possible duplicate: Similar expense on same day',
      suggestion: `Found: ${nearDuplicate.description} $${Number(nearDuplicate.amount)}. Amounts differ slightly - verify these are different purchases.`,
      relatedId: nearDuplicate.id,
    };
  }
  return null;
}

function checkIfAssetRuleBased(expense: ExpenseInput): AnomalyFlag | null {
  if (expense.amount < 1000) return null;

  const description = (expense.description || '').toLowerCase();
  const combined = `${description} ${expense.notes || ''}`.toLowerCase();

  const assetKeywords: Record<
    string,
    { keywords: string[]; usefulLife: number }
  > = {
    computers: {
      keywords: [
        'laptop',
        'macbook',
        'computer',
        'imac',
        'pc',
        'dell',
        'lenovo',
        'hp laptop',
        'thinkpad',
      ],
      usefulLife: 3,
    },
    furniture: {
      keywords: [
        'desk',
        'chair',
        'table',
        'cabinet',
        'shelving',
        'furniture',
        'standing desk',
      ],
      usefulLife: 7,
    },
    equipment: {
      keywords: [
        'printer',
        'scanner',
        'projector',
        'monitor',
        'equipment',
        'display',
      ],
      usefulLife: 5,
    },
    vehicles: {
      keywords: ['vehicle', 'car', 'truck', 'van', 'auto'],
      usefulLife: 5,
    },
    machinery: {
      keywords: ['machine', 'tool', 'apparatus'],
      usefulLife: 7,
    },
  };

  for (const [category, config] of Object.entries(assetKeywords)) {
    if (config.keywords.some((k) => combined.includes(k))) {
      return {
        type: 'possible_asset',
        severity: 'medium',
        message: `This looks like ${category} and may be a capital asset`,
        suggestion: `Large purchases of ${category} are typically depreciated over ${config.usefulLife} years rather than expensed immediately.`,
        autoFix: {
          action: 'convert_to_asset',
          category,
          usefulLife: config.usefulLife,
        },
      };
    }
  }

  if (expense.amount > 2000) {
    return {
      type: 'possible_asset',
      severity: 'low',
      message: 'Large purchase over $2,000',
      suggestion:
        'Verify if this should be classified as a capital asset (equipment, furniture, etc.) for depreciation.',
    };
  }
  return null;
}

async function checkUnusualMerchant(
  expense: ExpenseInput,
  orgId: string,
): Promise<AnomalyFlag | null> {
  const searchTerm = (expense.description || '').trim().slice(0, 20) || '';
  if (searchTerm.length < 2) return null;

  const existingCount = await prisma.expenses.count({
    where: {
      org_id: orgId,
      description: { contains: searchTerm, mode: 'insensitive' },
      ...(expense.id ? { id: { not: expense.id } } : {}),
    },
  });

  if (existingCount === 0 && expense.amount > 500) {
    return {
      type: 'unusual_merchant',
      severity: 'low',
      message: `First purchase from ${expense.description}`,
      suggestion:
        'New vendor detected. Verify merchant name is spelled correctly for consistent tracking.',
    };
  }
  return null;
}

function checkDataEntryErrors(expense: ExpenseInput): AnomalyFlag | null {
  const amount = expense.amount;

  if (amount > 1000 && amount % 100 < 100) {
    const possibleCorrect = amount / 100;
    if (possibleCorrect > 10 && possibleCorrect < 1000) {
      return {
        type: 'data_entry_error',
        severity: 'high',
        message: 'Possible decimal point error',
        suggestion: `Did you mean $${possibleCorrect.toFixed(2)} instead of $${amount.toFixed(2)}?`,
        autoFix: {
          action: 'fix_decimal',
          suggestedAmount: Math.round(possibleCorrect * 100) / 100,
        },
      };
    }
  }

  const amountStr = amount.toString().replace('.', '');
  const digits = amountStr.split('');
  if (digits.length >= 4 && digits.every((d) => d === digits[0])) {
    return {
      type: 'data_entry_error',
      severity: 'medium',
      message: 'Unusual amount pattern',
      suggestion: `Amount $${amount} has all repeating digits. Please verify this is correct.`,
    };
  }

  if (amount >= 100 && amount % 100 === 0) {
    return {
      type: 'data_entry_error',
      severity: 'low',
      message: 'Round number detected',
      suggestion: `Round amounts like $${amount}.00 may indicate an estimate. Please confirm exact amount from receipt.`,
    };
  }

  if (amount < 1 && amount > 0) {
    const possibleCorrect = amount * 100;
    return {
      type: 'data_entry_error',
      severity: 'medium',
      message: 'Unusually small amount',
      suggestion: `Did you mean $${possibleCorrect.toFixed(2)} instead of $${amount.toFixed(2)}?`,
      autoFix: {
        action: 'multiply_100',
        suggestedAmount: Math.round(possibleCorrect * 100) / 100,
      },
    };
  }
  return null;
}

function checkMissingReceipt(expense: ExpenseInput): AnomalyFlag | null {
  if (expense.amount > 75 && !expense.receipt_url) {
    return {
      type: 'missing_receipt',
      severity: 'medium',
      message: 'Receipt required for IRS compliance',
      suggestion:
        'IRS requires documentation for expenses over $75. Please upload receipt.',
    };
  }
  return null;
}

async function runAIAnomalyDetection(
  _expense: ExpenseInput,
  _existingAnomalies: AnomalyFlag[],
): Promise<AnomalyFlag[]> {
  if (!openai) return [];

  try {
    // Future: AI could detect unusual descriptions, context-based anomalies, fraud patterns
    // const response = await openai.chat.completions.create({...});
    // return JSON.parse(response.choices[0].message.content);
  } catch {
    // Ignore AI errors
  }
  return [];
}

async function updateAnomalyStats(orgId: string, anomalies: AnomalyFlag[]): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const flagTypes: Record<string, number> = {};
    anomalies.forEach((a) => {
      flagTypes[a.type] = (flagTypes[a.type] || 0) + 1;
    });

    const existing = await prisma.anomaly_detection_stats.findUnique({
      where: { org_id_date: { org_id: orgId, date: new Date(today) } },
    });
    const currentFlagTypes: Record<string, number> = {
      ...((existing?.flag_types as Record<string, number>) || {}),
    };
    Object.entries(flagTypes).forEach(([k, v]) => {
      currentFlagTypes[k] = (currentFlagTypes[k] || 0) + v;
    });

    await prisma.anomaly_detection_stats.upsert({
      where: { org_id_date: { org_id: orgId, date: new Date(today) } },
      create: {
        org_id: orgId,
        date: new Date(today),
        total_expenses: 1,
        flagged_count: anomalies.length > 0 ? 1 : 0,
        flag_types: flagTypes,
      },
      update: {
        total_expenses: { increment: 1 },
        flagged_count: { increment: anomalies.length > 0 ? 1 : 0 },
        flag_types: currentFlagTypes,
      },
    });
  } catch {
    // Stats table may not exist; ignore
  }
}

/**
 * Detect anomalies for an expense. All rule-based checks run; AI enhancement optional.
 */
export async function detectAnomalies(expense: ExpenseInput): Promise<AnomalyFlag[]> {
  const anomalies: AnomalyFlag[] = [];
  const orgId = expense.orgId;
  const useAI =
    !!process.env.OPENAI_API_KEY &&
    process.env.ENABLE_AI_ANOMALY_DETECTION === 'true';

  const [
    amountCheck,
    duplicateCheck,
    assetCheck,
    merchantCheck,
    dataEntryCheck,
    receiptCheck,
  ] = await Promise.all([
    checkAmountAnomaly(expense, orgId),
    checkDuplicates(expense, orgId),
    Promise.resolve(checkIfAssetRuleBased(expense)),
    checkUnusualMerchant(expense, orgId),
    Promise.resolve(checkDataEntryErrors(expense)),
    Promise.resolve(checkMissingReceipt(expense)),
  ]);

  if (amountCheck) anomalies.push(amountCheck);
  if (duplicateCheck) anomalies.push(duplicateCheck);
  if (assetCheck) anomalies.push(assetCheck);
  if (merchantCheck) anomalies.push(merchantCheck);
  if (dataEntryCheck) anomalies.push(dataEntryCheck);
  if (receiptCheck) anomalies.push(receiptCheck);

  if (useAI) {
    const aiChecks = await runAIAnomalyDetection(expense, anomalies);
    anomalies.push(...aiChecks);
  }

  if (anomalies.length > 0) {
    updateAnomalyStats(orgId, anomalies).catch(() => {});
  }

  return anomalies;
}

/**
 * Check if an expense might be a capital asset (for month-end checks).
 */
export async function checkIfAsset(input: { description: string; amount: number }): Promise<{ isAsset: boolean; reasoning: string }> {
  const expense: ExpenseInput = {
    description: input.description,
    amount: input.amount,
    date: new Date(),
    orgId: '',
  };
  const flag = checkIfAssetRuleBased(expense);
  return {
    isAsset: !!flag,
    reasoning: flag?.suggestion ?? '',
  };
}
