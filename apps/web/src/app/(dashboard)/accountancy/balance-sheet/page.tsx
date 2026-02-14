'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@dxer/shared';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';

interface TrialBalanceResponse {
  success: boolean;
  data: {
    from: string;
    to: string;
    accounts: {
      code: string;
      name: string;
      type: 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'cogs';
      debit: number;
      credit: number;
      balance: number;
    }[];
  };
}

export default function BalanceSheetPage() {
  const { currentOrg } = useAuth();
  const todayIso = new Date().toISOString().split('T')[0];
  const [asOf, setAsOf] = useState(todayIso);
  const [data, setData] = useState<TrialBalanceResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await api.accountancy.trialBalance({
        from: '1970-01-01',
        to: asOf,
        basis: 'accrual',
      })) as TrialBalanceResponse;
      setData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load Balance Sheet');
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

  const assets = data?.accounts.filter((a) => a.type === 'asset') ?? [];
  const liabilities = data?.accounts.filter((a) => a.type === 'liability') ?? [];
  const equity = data?.accounts.filter((a) => a.type === 'equity') ?? [];

  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.balance, 0);
  const totalEquity = equity.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div>
      <PageHeader
        title="Balance Sheet"
        description="Snapshot of assets, liabilities, and equity as of a specific date"
        actions={<AccountancyAddButtons />}
      />

      <form
        onSubmit={handleRefresh}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-100 bg-surface-50 px-4 py-3"
      >
        <div>
          <label className="label mb-1">As of</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
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

      {!data ? (
        <div className="card">
          <p className="text-xs text-gray-400">
            {loading ? 'Loading…' : 'No accounting data available yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <BsSection title="Assets" rows={assets} total={totalAssets} />
          <BsSection title="Liabilities" rows={liabilities} total={totalLiabilities} />
          <BsSection title="Equity" rows={equity} total={totalEquity} />
        </div>
      )}
    </div>
  );
}

function BsSection({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { code: string; name: string; balance: number }[];
  total: number;
}) {
  return (
    <div className="card">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="space-y-0.5 text-xs">
        {rows.map((r) => (
          <div key={r.code} className="flex items-center justify-between">
            <span className="text-gray-700">
              <span className="font-mono text-[11px] text-gray-400">{r.code}</span>{' '}
              {r.name}
            </span>
            <span className="font-medium text-gray-900">
              {formatCurrency(r.balance || 0)}
            </span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-1 text-xs font-semibold text-gray-900">
          <span>Total {title}</span>
          <span>{formatCurrency(total || 0)}</span>
        </div>
      </div>
    </div>
  );
}

