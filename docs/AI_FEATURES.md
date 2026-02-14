# AI-Powered Accountancy Features

This document describes the 5 AI features added to DXER Accountancy.

## Environment Variables

Add to `.env`:

```
OPENAI_API_KEY=sk-...
```

## 1. Receipt OCR & Auto-Fill Expenses

**Goal:** User uploads receipt photo → AI extracts data → auto-fills expense form.

**API:**
- `POST /api/ocr/receipt` — Body: `{ image: base64 string }` — Extracts merchant, amount, date, line items, tax using GPT-4 Vision.
- `POST /api/ocr/categorize` — Body: `{ merchant, description, amount }` — Returns suggested category (from past data or AI) with account code.
- `POST /api/ocr/upload-receipt` — Body: `{ image: base64 }` — Stores receipt in Supabase storage, returns signed URL.

**UI:** In the New Expense modal:
- **Scan Receipt** and **Upload Image** buttons
- On image upload: OCR runs, categorization runs, form auto-fills
- On submit: receipt is uploaded to storage and linked to expense

**Database:** Add `receipt_url` to expense create/update. Migration `00005_expense_flags.sql` adds `flags` and `needs_review` (optional).

---

## 2. Anomaly Detection (Flag Unusual Expenses)

**Goal:** AI flags suspicious/unusual transactions on expense creation.

**API:** Runs automatically in `POST /api/expenses`:
- Amount spike: expense > 5× historical average for similar description
- Duplicate: same amount within 24h
- Possible asset: expense > $1,000 and AI suggests capital asset

**Storage:** Anomalies stored in `expenses.flags` (JSONB) and `expenses.needs_review` (boolean) when migration is applied.

**UI:**
- Expense list: "Needs Review" badge when `needs_review` is true
- Expense detail: Review flags section with "Mark as Reviewed" button
- `POST /api/expenses/:id/mark-reviewed` clears flags and needs_review

---

## 3. Smart Month-End Close Assistant

**Goal:** AI checks if books are ready to close and tells user what to fix.

**API:** `POST /api/accountancy/month-end-check` — Body: `{ year, month }`

**Checks:**
1. Receipts for expenses > $75 (IRS-like requirement)
2. Large expenses (> $1,000) reviewed — AI suggests if capital asset
3. Trial balance balanced
4. Spending trend vs last month (> 30% change = info)

**UI:** P&L page — "Close {Month} {Year}" button opens modal with check results. Passed / failed / warning / info status per check.

---

## 4. AI-Generated Report Summaries

**Goal:** Executive summary at top of P&L with AI insights.

**API:** P&L endpoint (`GET /api/accountancy/profit-and-loss`) now returns `summary` and `insights`:
- `summary`: 3–4 sentence AI-generated executive summary
- `insights`: Top expense category %, burn rate warning (if net income < 0), missing receipts warning

**UI:** P&L page — "Executive Summary" card at top with summary and key insights.

---

## 5. Natural Language Query

**Goal:** User asks "What did we spend on software last month?" and gets an answer.

**API:** `POST /api/accountancy/query` — Body: `{ question: string }`

**Flow:**
1. AI parses question → `queryType`, `category`, `dateRange`
2. Execute query (expenses_by_category, revenue_total, burn_rate, top_expenses)
3. AI formats answer in natural language

**UI:** Accountancy sidebar — search box "Ask about your finances..." at top. Enter question, press Enter or click search. Result shown below.

---

## Migrations

Run to add anomaly flags columns (optional):

```bash
# Supabase
supabase db push

# Or apply migration manually
psql $DATABASE_URL -f supabase/migrations/00005_expense_flags.sql
```

---

## Cost Estimate

- Receipt OCR: ~$0.01/image
- Categorization: ~$0.001/call
- Anomaly check (asset): ~$0.001/expense
- Month-end checks: ~$0.01/run
- P&L summary: ~$0.01/load
- NL query: ~$0.02/query

For 100 users: ~$110/month AI costs.
