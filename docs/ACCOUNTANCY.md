# Accountancy — Documentation

This document describes the **Accountancy** section of the DXER application: its purpose, data model, and every **sidebar** item with its **functions** and **features**.

---

## 1. Overview

- **Purpose:** Accountancy provides financial statements, internal reports, tax and compliance views, and operational reports derived from DXER’s transactional data (expenses, invoices, payroll, production).
- **Data model:** There are **no dedicated accountancy tables** in the database. All numbers are **computed on demand** from expenses, invoices, and payroll (and their metadata). The backend builds virtual **journal lines** using a fixed **chart of accounts**, then aggregates them into P&L, Trial Balance, General Ledger, aging, and burn rate.
- **Access:** Accountancy API routes require the **accountant** role. The default chart of accounts is shared; per-org customization is planned for later.
- **Basis:** Reports support **accrual** and **cash** basis where applicable; cash is approximated using status (e.g. paid vs unpaid).

---

## 2. Sidebar Structure

The Accountancy area uses a **left sidebar** grouped under “Reports & Documents”. Each group and each link is listed below with its **route**, **function**, and **features**.

---

### 2.1 Financial Statements

| Sidebar item | Route | Function | Features / qualities |
|--------------|--------|----------|----------------------|
| **Income Statement (P&L)** | `/accountancy/profit-and-loss` | Primary P&L view (revenue, COGS, expenses, net income). | **From/To** date range; **Basis** (accrual / cash); **Compare** to previous period or same period last year; sectioned rows (Revenue, COGS, Operating expenses); totals (revenue, gross profit, expenses, net income); optional **Blockchain Proof** and anchored-count in Advanced mode; **Download CSV** / **Email** placeholders; **AccountancyAddButtons** (quick links to + Expense, + Invoice, + Payroll). Default landing when opening Accountancy. |
| **Balance Sheet** | `/accountancy/balance-sheet` | Snapshot of **Assets**, **Liabilities**, and **Equity** as of a date. | **As of** date; data from Trial Balance (all time to that date); accounts grouped by type; total assets, total liabilities, total equity; **AccountancyAddButtons**. |
| **Cash Flow Statement** | `/accountancy/cash-flow` | Approximate cash flow for a period (operating focus). | **From/To** date; uses P&L net income and Burn Rate; shows **Operating**, **Investing**, **Financing** (investing/financing currently zero); **Net change**; **AccountancyAddButtons**. |
| **Changes in Equity** | `/accountancy/equity` | Statement of equity movement between two dates. | **From/To** range; **Opening** and **Closing** equity from Trial Balance (sum of equity accounts); **Change** (closing − opening); **AccountancyAddButtons**. |

---

### 2.2 Internal Reports

| Sidebar item | Route | Function | Features / qualities |
|--------------|--------|----------|----------------------|
| **Trial Balance** | `/accountancy/trial-balance` | General-ledger trial balance: all accounts with debit/credit totals and balances. | **From/To** date; **Basis** (accrual / cash); table of account **code**, **name**, **type**, **debit**, **credit**, **balance**; **Totals** row (debits = credits); **AccountancyAddButtons**. |
| **General Ledger** | `/accountancy/general-ledger` | Line-level journal view of all postings from DXER events. | **From/To**, **Basis**; optional **Account code** filter; columns: **Date**, **Account**, **Description**, **Debit**, **Credit**, **Source** (expense / invoice / payroll), **Source ID**; **AccountancyAddButtons**. |
| **AR Aging** | `/accountancy/ar-aging` | **Accounts receivable** aging: outstanding receivables by customer and bucket. | **As of** date; rows per customer (or logical key); buckets: **Current**, **1–30**, **31–60**, **61–90**, **90+** days; **Total** column and totals row; **AccountancyAddButtons**. |
| **AP Aging** | `/accountancy/ap-aging` | **Accounts payable** aging: outstanding payables by vendor/source and bucket. | **As of** date; same bucket structure as AR; rows and totals; **AccountancyAddButtons**. |
| **Expense by Category** | `/accountancy/expense-by-category` | Sum of expenses grouped by **category** over a period. | **From/To** date; uses Expenses API (not accountancy engine); category totals and **Total**; **AccountancyAddButtons**. |
| **Revenue Report** | `/accountancy/revenue-report` | Revenue breakdown by **invoice status** over a period. | **From/To** date; uses Invoices API; total revenue and breakdown by status (e.g. draft, sent, paid); **AccountancyAddButtons**. |
| **Burn Rate** | `/accountancy/burn-rate` | Average spend over a period (expense + COGS). | **From/To** date; API returns **total** spend, **days**, **daily** and **monthly** burn; displayed as daily/monthly and total; **AccountancyAddButtons**. |
| **Budget vs Actual** | `/accountancy/budget-vs-actual` | Placeholder for comparing actuals to budget. | **Placeholder:** UI explains that variance reporting will appear here once budgeting data exists; no data yet. |

---

### 2.3 Tax Documents

| Sidebar item | Route | Function | Features / qualities |
|--------------|--------|----------|----------------------|
| **Form 1120 / Schedule C** | `/accountancy/tax-1120` | Placeholder for corporate/individual tax pre-fill. | **Placeholder:** Intended to map P&L and Balance Sheet lines to tax form fields (e.g. revenue, COGS, salaries); structural placeholder only. |
| **W-2 (Employees)** | `/accountancy/tax-w2` | Planned: W-2 wage and tax statements. | **Planned;** no page implemented yet. |
| **1099-NEC (Contractors)** | `/accountancy/tax-1099` | Planned: 1099-NEC for contractors. | **Planned;** no page implemented yet. |
| **Form 941 (Quarterly)** | `/accountancy/tax-941` | Planned: Quarterly payroll tax form. | **Planned;** no page implemented yet. |
| **Sales Tax Returns** | `/accountancy/sales-tax` | Planned: Sales tax reporting/returns. | **Planned;** no page implemented yet. |
| **Depreciation Schedule (4562)** | `/accountancy/depreciation-schedule` | Planned: Depreciation / Form 4562. | **Planned;** no page implemented yet. |

---

### 2.4 Startup Reports

| Sidebar item | Route | Function | Features / qualities |
|--------------|--------|----------|----------------------|
| **Cap Table** | `/accountancy/cap-table` | Planned: Capitalization table. | **Planned;** no page implemented yet. |
| **Board Report Package** | `/accountancy/board-package` | Planned: Board reporting package. | **Planned;** no page implemented yet. |
| **Monthly Investor Update** | `/accountancy/investor-update` | Planned: Monthly investor summary. | **Planned;** no page implemented yet. |

---

### 2.5 Compliance

| Sidebar item | Route | Function | Features / qualities |
|--------------|--------|----------|----------------------|
| **Bank Reconciliation** | `/accountancy/bank-reconciliation` | Shell for reconciling bank statements to ledger. | **Bank account** dropdown (e.g. 1000 · Bank: Operating); **From/To** date; UI shell only—reconciliation logic and statement upload not yet wired; **AccountancyAddButtons**. |
| **Inventory Report** | `/accountancy/inventory-report` | Planned: Inventory valuation/report. | **Planned;** no page implemented yet. |
| **Fixed Assets Register** | `/accountancy/fixed-assets` | Planned: Fixed assets register. | **Planned;** no page implemented yet. |
| **Audit Trail** | `/accountancy/audit-trail` | Planned: Dedicated audit trail view. | **Planned;** main app already has **Activity** (`/audit`) for action log. |

---

### 2.6 Packages

| Sidebar item | Route | Function | Features / qualities |
|--------------|--------|----------|----------------------|
| **Due Diligence Package** | `/accountancy/due-diligence-package` | Planned: Export package for due diligence. | **Planned;** no page implemented yet. |
| **Accountant Tax Package** | `/accountancy/tax-package` | Planned: Package for external accountant/tax prep. | **Planned;** no page implemented yet. |

---

## 3. Related Routes (not in Accountancy sidebar)

These are accountancy-related but linked from elsewhere (e.g. Dashboard quick actions):

| Page | Route | Function | Features / qualities |
|------|--------|----------|----------------------|
| **Journals & Adjustments** | `/accountancy/journals` | Shell for manual journal entries. | **Date**, **Reference**, **Description**; multiple **lines** (account code, description, debit, credit); **Total debit / Total credit**; add line; persistence and posting not yet implemented; **AccountancyAddButtons**. |
| **Documents Inbox** | `/accountancy/inbox` | Shell for uploading documents for future extraction. | **Upload** PDFs, images, or CSV; list of uploaded files (name, size, type); intended for future AI extraction into expenses/invoices/bank lines; **AccountancyAddButtons**. |

---

## 4. Shared UI and API

- **AccountancyAddButtons:** On most accountancy pages, the header includes quick actions: **+ Expense**, **+ Invoice**, **+ Payroll** (navigate to `/expenses`, `/invoices`, `/payroll`).
- **API endpoints (all require authentication and accountant role):**
  - `GET /api/accountancy/profit-and-loss?from=&to=&basis=`
  - `GET /api/accountancy/trial-balance?from=&to=&basis=`
  - `GET /api/accountancy/general-ledger?from=&to=&basis=&accountCode=`
  - `GET /api/accountancy/ar-aging?asOf=`
  - `GET /api/accountancy/ap-aging?asOf=`
  - `GET /api/accountancy/burn-rate?from=&to=`
- **Chart of accounts (examples):** 1000 Bank, 1100 AR, 2000 AP, 2100 Payroll Liabilities, 3000/3100 Equity, 4000/4010/4020 Revenue, 5000/5010 COGS, 6000/6010/6100–6999 Expenses.

---

## 5. Summary Table (sidebar only)

| Group | Sidebar item | Implemented | Notes |
|-------|----------------|------------|--------|
| Financial Statements | Income Statement (P&L) | ✅ | Full P&L, comparison, insights. |
| | Balance Sheet | ✅ | As-of snapshot. |
| | Cash Flow Statement | ✅ | Operating from P&L + burn rate. |
| | Changes in Equity | ✅ | Opening/closing/change. |
| Internal Reports | Trial Balance | ✅ | Full TB table. |
| | General Ledger | ✅ | Line-level, optional account filter. |
| | AR Aging | ✅ | Receivables by bucket. |
| | AP Aging | ✅ | Payables by bucket. |
| | Expense by Category | ✅ | From expenses API. |
| | Revenue Report | ✅ | From invoices API. |
| | Burn Rate | ✅ | Daily/monthly burn. |
| | Budget vs Actual | Placeholder | No budget data yet. |
| Tax Documents | Form 1120 / Schedule C | Placeholder | Pre-fill planned. |
| | W-2, 1099-NEC, 941, Sales Tax, Depreciation | Planned | No pages yet. |
| Startup Reports | Cap Table, Board Package, Investor Update | Planned | No pages yet. |
| Compliance | Bank Reconciliation | Shell | UI only. |
| | Inventory, Fixed Assets, Audit Trail | Planned | No pages yet. |
| Packages | Due Diligence, Tax Package | Planned | No pages yet. |

This completes the detailed documentation of Accountancy and **every sidebar item** with its **functions** and **features**.
