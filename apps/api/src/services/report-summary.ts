/**
 * AI-generated executive summary for P&L report.
 */

import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export interface ReportSummaryResult {
  summary: string;
  insights: { type: 'info' | 'warning'; message: string; action?: string }[];
}

export async function generatePLSummary(params: {
  orgName: string;
  period: string;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  topExpenses: { name: string; amount: number }[];
  daysCount: number;
  expensesWithoutReceipts?: number;
}): Promise<ReportSummaryResult> {
  const insights: ReportSummaryResult['insights'] = [];

  // Insight 1: Top expense category
  if (params.topExpenses.length > 0 && params.totalExpenses > 0) {
    const top = params.topExpenses[0];
    const pct = (top.amount / params.totalExpenses) * 100;
    insights.push({
      type: 'info',
      message: `${top.name} represents ${pct.toFixed(0)}% of total expenses`,
    });
  }

  // Insight 2: Burn rate
  if (params.netIncome < 0 && params.daysCount > 0) {
    const dailyBurn = Math.abs(params.netIncome) / params.daysCount;
    const monthlyBurn = dailyBurn * 30;
    insights.push({
      type: 'warning',
      message: `Current burn rate: $${monthlyBurn.toLocaleString()}/month`,
      action: '/accountancy/burn-rate',
    });
  }

  // Insight 3: Missing receipts
  if (params.expensesWithoutReceipts && params.expensesWithoutReceipts > 0) {
    insights.push({
      type: 'warning',
      message: `${params.expensesWithoutReceipts} expenses missing receipts`,
      action: '/expenses',
    });
  }

  // AI-generated summary
  if (!openai) {
    return {
      summary: `${params.orgName} reported revenue of $${params.totalRevenue.toLocaleString()} and expenses of $${params.totalExpenses.toLocaleString()} for the period, resulting in net income of $${params.netIncome.toLocaleString()}.`,
      insights,
    };
  }

  try {
    const prompt = `Generate a 3-4 sentence executive summary for this P&L:

Company: ${params.orgName}
Period: ${params.period}
Revenue: $${params.totalRevenue.toLocaleString()}
Expenses: $${params.totalExpenses.toLocaleString()}
Net Income: $${params.netIncome.toLocaleString()}

Top expense categories:
${params.topExpenses.slice(0, 5).map((e) => `- ${e.name}: $${e.amount.toLocaleString()}`).join('\n')}

Write in professional business tone. Focus on key insights and trends.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
    });

    const summary = response.choices[0]?.message?.content?.trim() || '';
    return { summary: summary || 'Unable to generate summary.', insights };
  } catch {
    return {
      summary: `${params.orgName} reported revenue of $${params.totalRevenue.toLocaleString()} and expenses of $${params.totalExpenses.toLocaleString()} for the period, resulting in net income of $${params.netIncome.toLocaleString()}.`,
      insights,
    };
  }
}
