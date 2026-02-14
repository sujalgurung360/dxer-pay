/**
 * OCR & AI services for receipt extraction and expense categorization.
 * Uses OpenAI GPT-4 Vision for receipt parsing and GPT-4 for categorization.
 */

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export interface ReceiptExtractResult {
  merchant: string;
  amount: number;
  date: string; // YYYY-MM-DD
  lineItems: { description: string; amount: number }[];
  taxAmount: number;
}

export interface CategorizeResult {
  category: string;
  confidence: number;
  accountCode: string;
}

const CATEGORY_TO_ACCOUNT: Record<string, string> = {
  supplies: '6400',
  office_supplies: '6400',
  software: '6200',
  marketing: '6300',
  travel: '6999',
  meals: '6999',
  rent: '6100',
  utilities: '6999',
  equipment: '5010',
  services: '6999',
  miscellaneous: '6999',
  other: '6999',
};

const VALID_CATEGORIES = [
  'supplies',
  'office_supplies',
  'software',
  'marketing',
  'travel',
  'meals',
  'rent',
  'utilities',
  'equipment',
  'services',
  'miscellaneous',
  'other',
];

/**
 * Extract receipt data from image using GPT-4 Vision.
 */
export async function extractReceiptFromImage(imageBase64: string): Promise<ReceiptExtractResult> {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const imageUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract from this receipt image and return ONLY valid JSON, no markdown:
{
  "merchant_name": "string - store/business name",
  "total_amount": number - total in USD,
  "date": "YYYY-MM-DD",
  "line_items": [{"description": "string", "amount": number}],
  "tax_amount": number
}`,
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          },
        ],
      },
    ],
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('No response from OCR');
  }

  // Parse JSON - strip markdown code blocks if present
  let jsonStr = content;
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) jsonStr = match[1];
  const parsed = JSON.parse(jsonStr) as {
    merchant_name?: string;
    total_amount?: number;
    date?: string;
    line_items?: { description: string; amount: number }[];
    tax_amount?: number;
  };

  return {
    merchant: parsed.merchant_name || parsed.merchant || 'Unknown',
    amount: Number(parsed.total_amount) || 0,
    date: parsed.date || new Date().toISOString().split('T')[0],
    lineItems: Array.isArray(parsed.line_items)
      ? parsed.line_items.map((li) => ({
          description: String(li.description || ''),
          amount: Number(li.amount) || 0,
        }))
      : [],
    taxAmount: Number(parsed.tax_amount) || 0,
  };
}

/**
 * Smart categorization: check past categorizations first, then use AI.
 */
export async function categorizeExpense(
  orgId: string,
  merchant: string,
  description: string,
  amount: number
): Promise<CategorizeResult> {
  // 1. Check past categorizations by description (often contains merchant)
  const searchTerm = (merchant || description || '').trim();
  if (searchTerm.length >= 2) {
    const past = await prisma.expenses.groupBy({
      by: ['category'],
      where: {
        org_id: orgId,
        description: { contains: searchTerm.slice(0, 30), mode: 'insensitive' },
      },
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
    });

    if (past.length > 0) {
      const top = past[0];
      const accountCode = CATEGORY_TO_ACCOUNT[top.category] || '6999';
      return {
        category: top.category,
        confidence: 0.9,
        accountCode,
      };
    }
  }

  // 2. Use AI
  if (!openai) {
    return {
      category: 'other',
      confidence: 0.5,
      accountCode: '6999',
    };
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `Merchant: ${merchant}
Description: ${description}
Amount: $${amount}

What expense category? Options: supplies, software, marketing, travel, meals, rent, utilities, equipment, services, other

Return ONLY valid JSON: {"category": "one_of_options", "confidence": 0.0-1.0}`,
      },
    ],
    max_tokens: 100,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    return { category: 'other', confidence: 0.5, accountCode: '6999' };
  }

  let parsed: { category?: string; confidence?: number };
  try {
    parsed = JSON.parse(content.replace(/```json?|```/g, '').trim());
  } catch {
    return { category: 'other', confidence: 0.5, accountCode: '6999' };
  }

  const category = VALID_CATEGORIES.includes(parsed.category || '')
    ? parsed.category!
    : 'other';
  const accountCode = CATEGORY_TO_ACCOUNT[category] || '6999';
  const mapToDb = (c: string) => {
    if (c === 'office_supplies') return 'supplies';
    if (c === 'miscellaneous') return 'other';
    return c;
  };
  const dbCategory = mapToDb(category);

  return {
    category: dbCategory,
    confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.7)),
    accountCode,
  };
}
