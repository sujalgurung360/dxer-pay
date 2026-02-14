'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { Search, Loader2 } from 'lucide-react';

const groups = [
  {
    title: 'Financial Statements',
    items: [
      { label: 'Income Statement (P&L)', href: '/accountancy/profit-and-loss' },
      { label: 'Balance Sheet', href: '/accountancy/balance-sheet' },
      { label: 'Cash Flow Statement', href: '/accountancy/cash-flow' },
      { label: 'Changes in Equity', href: '/accountancy/equity' },
    ],
  },
  {
    title: 'Internal Reports',
    items: [
      { label: 'Trial Balance', href: '/accountancy/trial-balance' },
      { label: 'General Ledger', href: '/accountancy/general-ledger' },
      { label: 'AR Aging', href: '/accountancy/ar-aging' },
      { label: 'AP Aging', href: '/accountancy/ap-aging' },
      { label: 'Expense by Category', href: '/accountancy/expense-by-category' },
      { label: 'Revenue Report', href: '/accountancy/revenue-report' },
      { label: 'Burn Rate', href: '/accountancy/burn-rate' },
      { label: 'Budget vs Actual', href: '/accountancy/budget-vs-actual' },
    ],
  },
  {
    title: 'Tax Documents',
    items: [
      { label: 'Form 1120 / Schedule C', href: '/accountancy/tax-1120' },
      { label: 'W-2 (Employees)', href: '/accountancy/tax-w2' },
      { label: '1099-NEC (Contractors)', href: '/accountancy/tax-1099' },
      { label: 'Form 941 (Quarterly)', href: '/accountancy/tax-941' },
      { label: 'Sales Tax Returns', href: '/accountancy/sales-tax' },
      { label: 'Depreciation Schedule (4562)', href: '/accountancy/depreciation-schedule' },
    ],
  },
  {
    title: 'Startup Reports',
    items: [
      { label: 'Cap Table', href: '/accountancy/cap-table' },
      { label: 'Board Report Package', href: '/accountancy/board-package' },
      { label: 'Monthly Investor Update', href: '/accountancy/investor-update' },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { label: 'Bank Reconciliation', href: '/accountancy/bank-reconciliation' },
      { label: 'Inventory Report', href: '/accountancy/inventory-report' },
      { label: 'Fixed Assets Register', href: '/accountancy/fixed-assets' },
      { label: 'Audit Trail', href: '/accountancy/audit-trail' },
    ],
  },
  {
    title: 'Packages',
    items: [
      { label: 'Due Diligence Package', href: '/accountancy/due-diligence-package' },
      { label: 'Accountant Tax Package', href: '/accountancy/tax-package' },
    ],
  },
];

export default function AccountancyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  const handleQuery = async () => {
    if (!query.trim()) return;
    setQueryLoading(true);
    setQueryResult(null);
    try {
      const res = (await api.accountancy.query(query.trim())) as any;
      setQueryResult(res.data);
    } catch (err: any) {
      setQueryResult({ answer: err.message || 'Failed to run query' });
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px,minmax(0,1fr)]">
      <aside className="rounded-2xl border border-gray-100 bg-white/70 px-3 py-3 shadow-sm">
        <div className="mb-3 border-b border-gray-100 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Ask about your finances..."
              className="w-full rounded-lg border border-gray-200 bg-surface-50 pl-8 pr-8 py-2 text-xs placeholder:text-gray-400 focus:border-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-300"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
            />
            <button
              type="button"
              onClick={handleQuery}
              disabled={queryLoading}
              className="absolute right-2 top-1.5 text-purple-500 hover:text-purple-600 disabled:opacity-50"
            >
              {queryLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </button>
          </div>
          {queryResult && (
            <div className="mt-2 rounded-lg border border-purple-100 bg-purple-50/50 p-2.5 text-xs text-gray-700">
              <p>{queryResult.answer}</p>
              {queryResult.data?.count != null && (
                <p className="mt-1 text-gray-500">Based on {queryResult.data.count} transactions</p>
              )}
            </div>
          )}
        </div>
        <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Reports &amp; Documents
        </p>
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {group.title}
              </p>
              <nav className="mt-1 space-y-1">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== '/accountancy/profit-and-loss' &&
                      pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        'flex items-center rounded-xl px-2.5 py-1.5 text-xs transition-colors',
                        active
                          ? 'bg-purple-600 text-white shadow-purple'
                          : 'text-gray-500 hover:bg-surface-100 hover:text-gray-900',
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </aside>
      <div>{children}</div>
    </div>
  );
}

