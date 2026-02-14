'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@dxer/shared';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';

interface BurnRateResponse {
  success: boolean;
  data: {
    from: string;
    to: string;
    total: number;
    days: number;
    daily: number;
    monthly: number;
  };
}

export default function BurnRatePage() {
  const { currentOrg } = useAuth();
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(isoToday);
  const [data, setData] = useState<BurnRateResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await api.accountancy.burnRate({ from, to })) as BurnRateResponse;
      setData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load burn rate');
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

  return (
    <div>
      <PageHeader
        title="Burn Rate Report"
        description="Average spend over a period, based on expense and COGS postings"
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

      {!data ? (
        <div className="card">
          <p className="text-xs text-gray-400">
            {loading ? 'Calculating burn rate…' : 'No burn rate data for this period.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard label="Total spend" value={data.total} />
          <StatCard label="Days in period" value={data.days} isCount />
          <StatCard label="Daily burn (avg)" value={data.daily} />
          <StatCard label="Monthly burn (approx)" value={data.monthly} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, isCount }: { label: string; value: number; isCount?: boolean }) {
  return (
    <div className="card">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900">
        {isCount ? value : formatCurrency(value || 0)}
      </p>
    </div>
  );
}

