'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@dxer/shared';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';

type Basis = 'accrual' | 'cash';

interface TrialBalanceResponse {
  success: boolean;
  data: {
    basis: Basis;
    from: string;
    to: string;
    accounts: {
      code: string;
      name: string;
      type: string;
      debit: number;
      credit: number;
      balance: number;
    }[];
    totals: { debit: number; credit: number };
  };
}

export default function TrialBalancePage() {
  const { currentOrg } = useAuth();
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(isoToday);
  const [basis, setBasis] = useState<Basis>('accrual');
  const [tb, setTb] = useState<TrialBalanceResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await api.accountancy.trialBalance({
        from,
        to,
        basis,
      })) as TrialBalanceResponse;
      setTb(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load Trial Balance');
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
        title="Trial Balance"
        description="General ledger trial balance computed from DXER events"
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
        <div>
          <label className="label mb-1">Basis</label>
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as Basis)}
            className="input-field"
          >
            <option value="accrual">Accrual</option>
            <option value="cash">Cash (approx)</option>
          </select>
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
        <h2 className="mb-3 text-lg font-serif text-gray-900">Trial Balance</h2>
        {!tb ? (
          <p className="text-sm text-gray-400">{loading ? 'Loading…' : 'No data yet.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-gray-100 text-gray-400">
                <tr>
                  <th className="py-1 pr-4 font-normal">Code</th>
                  <th className="py-1 pr-4 font-normal">Account</th>
                  <th className="py-1 pr-4 text-right font-normal">Debit</th>
                  <th className="py-1 pr-4 text-right font-normal">Credit</th>
                  <th className="py-1 pr-0 text-right font-normal">Balance</th>
                </tr>
              </thead>
              <tbody>
                {tb.accounts.map((a) => (
                  <tr key={a.code} className="border-b border-gray-50">
                    <td className="py-1.5 pr-4 font-mono text-[11px] text-gray-500">{a.code}</td>
                    <td className="py-1.5 pr-4 text-gray-700">{a.name}</td>
                    <td className="py-1.5 pr-4 text-right text-gray-700">
                      {a.debit ? formatCurrency(a.debit) : ''}
                    </td>
                    <td className="py-1.5 pr-4 text-right text-gray-700">
                      {a.credit ? formatCurrency(a.credit) : ''}
                    </td>
                    <td className="py-1.5 pr-0 text-right text-gray-900 font-medium">
                      {formatCurrency(a.balance)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200">
                  <td className="py-1.5 pr-4 text-xs font-semibold text-gray-500" colSpan={2}>
                    Totals
                  </td>
                  <td className="py-1.5 pr-4 text-right text-xs font-semibold text-gray-800">
                    {formatCurrency(tb.totals.debit)}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-xs font-semibold text-gray-800">
                    {formatCurrency(tb.totals.credit)}
                  </td>
                  <td className="py-1.5 pr-0" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

