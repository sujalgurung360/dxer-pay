'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@dxer/shared';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';

interface ExpenseListResponse {
  success: boolean;
  data: {
    id: string;
    amount: number;
    category: string;
    date: string;
  }[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export default function ExpenseByCategoryPage() {
  const { currentOrg } = useAuth();
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(isoToday);
  const [data, setData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      // For now we fetch just first page with a large pageSize; can be paginated later if needed.
      const res = (await api.expenses.list({
        page: '1',
        pageSize: '500',
        dateFrom: from,
        dateTo: to,
      })) as ExpenseListResponse;

      const map: Record<string, number> = {};
      res.data.forEach((e) => {
        const key = e.category || 'uncategorized';
        map[key] = (map[key] || 0) + e.amount;
      });
      setData(map);
    } catch (err: any) {
      setError(err.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg]);

  const handleRefresh = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div>
      <PageHeader
        title="Expense by Category"
        description="Simple breakdown of expenses by category over a period"
        actions={<AccountancyAddButtons />}
      />

      <form
        onSubmit={handleRefresh}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-100 bg-surface-50 px-4 py-3"
      >
        <div>
          <label className="label mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="label mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input-field"
          />
        </div>
        <div className="flex-1" />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card">
        {!entries.length ? (
          <p className="text-xs text-gray-400">
            {loading ? 'Loading…' : 'No expenses in this period.'}
          </p>
        ) : (
          <div className="space-y-1 text-xs">
            {entries.map(([category, amount]) => (
              <div key={category} className="flex items-center justify-between">
                <span className="capitalize text-gray-700">{category}</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(amount || 0)}
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-2 text-xs font-semibold text-gray-900">
              <span>Total</span>
              <span>{formatCurrency(total || 0)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

