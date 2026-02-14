'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@dxer/shared';

interface ProfitAndLossResponse {
  success: boolean;
  data: {
    totals: {
      netIncome: number;
    };
  };
}

interface BurnRateResponse {
  success: boolean;
  data: {
    total: number;
  };
}

export default function CashFlowPage() {
  const { currentOrg } = useAuth();
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(isoToday);
  const [data, setData] = useState<{
    operating: number;
    investing: number;
    financing: number;
    netChange: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const [plRes, burnRes] = await Promise.all([
        api.accountancy.profitAndLoss({ from, to, basis: 'accrual' }) as Promise<ProfitAndLossResponse>,
        api.accountancy.burnRate({ from, to }) as Promise<BurnRateResponse>,
      ]);
      const netIncome = plRes.data.totals.netIncome;
      const operating = burnRes.data.total * -1; // spend is negative cash flow
      const investing = 0;
      const financing = 0;
      const netChange = operating + investing + financing;
      setData({ operating, investing, financing, netChange });
    } catch (err: any) {
      setError(err.message || 'Failed to load Cash Flow');
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
        title="Cash Flow Statement"
        description="Approximate cash flows derived from automated accounting data (operating focus for now)"
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
            {loading ? 'Calculating cash flows…' : 'No cash flow data for this period yet.'}
          </p>
        </div>
      ) : (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Summary (approximate)</h2>
          <div className="space-y-1 text-sm">
            <CfRow label="Net cash from operating activities" value={data.operating} />
            <CfRow label="Net cash from investing activities" value={data.investing} />
            <CfRow label="Net cash from financing activities" value={data.financing} />
            <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-sm font-semibold text-gray-900">
              <span>Net change in cash</span>
              <span>{formatCurrency(data.netChange || 0)}</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-gray-400">
            Note: This initial version focuses on operating cash flows based on expenses and COGS.
            Investing and financing sections are placeholders that can be wired to additional
            journal classifications over time.
          </p>
        </div>
      )}
    </div>
  );
}

function CfRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-700">{label}</span>
      <span className="font-medium text-gray-900">{formatCurrency(value || 0)}</span>
    </div>
  );
}

