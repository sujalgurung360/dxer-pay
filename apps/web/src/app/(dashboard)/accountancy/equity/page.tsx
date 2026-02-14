'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@dxer/shared';

interface TrialBalanceResponse {
  success: boolean;
  data: {
    from: string;
    to: string;
    accounts: {
      code: string;
      name: string;
      type: 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'cogs';
      balance: number;
    }[];
  };
}

export default function EquityStatementPage() {
  const { currentOrg } = useAuth();
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  const startOfYear = new Date(today.getFullYear(), 0, 1)
    .toISOString()
    .split('T')[0];

  const [from, setFrom] = useState(startOfYear);
  const [to, setTo] = useState(isoToday);
  const [opening, setOpening] = useState<number | null>(null);
  const [closing, setClosing] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const [openRes, closeRes] = await Promise.all([
        api.accountancy.trialBalance({
          from: '1970-01-01',
          to: from,
          basis: 'accrual',
        }) as Promise<TrialBalanceResponse>,
        api.accountancy.trialBalance({
          from: '1970-01-01',
          to,
          basis: 'accrual',
        }) as Promise<TrialBalanceResponse>,
      ]);

      const openEquity = sumEquity(openRes.data.accounts);
      const closeEquity = sumEquity(closeRes.data.accounts);
      setOpening(openEquity);
      setClosing(closeEquity);
    } catch (err: any) {
      setError(err.message || 'Failed to load equity statement');
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

  const change = closing !== null && opening !== null ? closing - opening : null;

  return (
    <div>
      <PageHeader
        title="Statement of Changes in Equity"
        description="High-level change in equity between two dates"
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
        {!loading && opening !== null && closing !== null ? (
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Opening equity</span>
              <span className="font-medium text-gray-900">{formatCurrency(opening)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Change in equity</span>
              <span className="font-medium text-gray-900">
                {change !== null ? formatCurrency(change) : '--'}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-2 text-sm font-semibold text-gray-900">
              <span>Closing equity</span>
              <span>{formatCurrency(closing)}</span>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Note: This simplified view aggregates all equity accounts. In a later phase this can be
              expanded into contributed capital vs retained earnings vs other reserves.
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            {loading ? 'Calculating equity changes…' : 'No data yet.'}
          </p>
        )}
      </div>
    </div>
  );
}

function sumEquity(
  accounts: {
    type: 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'cogs';
    balance: number;
  }[],
): number {
  return accounts
    .filter((a) => a.type === 'equity')
    .reduce((sum, a) => sum + a.balance, 0);
}

