/**
 * Natural language query for accountancy: parse question, execute query, format answer.
 */

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export interface NLQueryResult {
  answer: string;
  data?: { total?: number; count?: number };
  params?: Record<string, string>;
}

function resolveDateRange(dateRange: string): { from: string; to: string } {
  const today = new Date();
  const iso = today.toISOString().split('T')[0];

  switch (dateRange) {
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: start.toISOString().split('T')[0], to: end.toISOString().split('T')[0] };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: start.toISOString().split('T')[0], to: iso };
    }
    case 'last_week': {
      const end = new Date(today);
      end.setDate(end.getDate() - 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return { from: start.toISOString().split('T')[0], to: end.toISOString().split('T')[0] };
    }
    case 'this_week': {
      const day = today.getDay();
      const start = new Date(today);
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      return { from: start.toISOString().split('T')[0], to: iso };
    }
    default:
      return { from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0], to: iso };
  }
}

const CATEGORY_MAP: Record<string, string> = {
  office_supplies: 'supplies',
  software: 'software',
  marketing: 'marketing',
  travel: 'travel',
  meals: 'meals',
  rent: 'rent',
  utilities: 'utilities',
  equipment: 'equipment',
  services: 'services',
  miscellaneous: 'other',
};

export async function executeNLQuery(
  orgId: string,
  question: string
): Promise<NLQueryResult> {
  if (!openai) {
    return {
      answer: 'AI query is not configured. Add OPENAI_API_KEY to enable natural language queries.',
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `Parse this accounting question into query parameters.

Question: "${question}"

Available categories: supplies, software, marketing, travel, meals, rent, utilities, equipment, services, other
Available date ranges: this_month, last_month, this_week, last_week

Return ONLY valid JSON:
{
  "queryType": "expenses_by_category" | "revenue_total" | "burn_rate" | "top_expenses",
  "category": string or null,
  "dateRange": "this_month" | "last_month" | "this_week" | "last_week"
}`,
        },
      ],
      max_tokens: 150,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return { answer: 'Could not parse your question.' };
    }

    const parsed = JSON.parse(content.replace(/```json?|```/g, '').trim()) as {
      queryType?: string;
      category?: string | null;
      dateRange?: string;
    };

    const dateRange = parsed.dateRange || 'this_month';
    const { from, to } = resolveDateRange(dateRange);

    let total = 0;
    let count = 0;

    switch (parsed.queryType) {
      case 'expenses_by_category': {
        const category = parsed.category
          ? (CATEGORY_MAP[parsed.category] || parsed.category)
          : undefined;
        const agg = await prisma.expenses.aggregate({
          where: {
            org_id: orgId,
            date: { gte: new Date(from), lte: new Date(to) },
            status: { not: 'voided' },
            ...(category ? { category } : {}),
          },
          _sum: { amount: true },
          _count: true,
        });
        total = Number(agg._sum?.amount ?? 0);
        count = agg._count ?? 0;
        break;
      }
      case 'revenue_total': {
        const invoices = await prisma.invoices.aggregate({
          where: {
            org_id: orgId,
            due_date: { gte: new Date(from), lte: new Date(to) },
            status: { not: 'void' },
          },
          _sum: { total: true },
          _count: true,
        });
        total = Number(invoices._sum?.total ?? 0);
        count = invoices._count ?? 0;
        break;
      }
      case 'top_expenses':
      default: {
        const agg = await prisma.expenses.aggregate({
          where: {
            org_id: orgId,
            date: { gte: new Date(from), lte: new Date(to) },
            status: { not: 'voided' },
          },
          _sum: { amount: true },
          _count: true,
        });
        total = Number(agg._sum?.amount ?? 0);
        count = agg._count ?? 0;
        break;
      }
    }

    // Format natural language answer
    const formatResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `User asked: "${question}"

Query results:
- Total: $${total.toFixed(2)}
- Count: ${count} transactions
- Period: ${from} to ${to}
- Category: ${parsed.category || 'all'}

Write a natural, conversational response (2-3 sentences).`,
        },
      ],
      max_tokens: 120,
    });

    const answer = formatResponse.choices[0]?.message?.content?.trim() || `Total: $${total.toFixed(2)} across ${count} transactions (${from} to ${to}).`;

    return {
      answer,
      data: { total, count },
      params: { from, to, category: parsed.category ?? '' },
    };
  } catch (err) {
    return {
      answer: 'Sorry, I could not process that question. Try asking something like "What did we spend on software last month?"',
    };
  }
}
