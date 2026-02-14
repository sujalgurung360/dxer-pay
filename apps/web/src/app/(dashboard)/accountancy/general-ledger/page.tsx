'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@dxer/shared';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';

type Basis = 'accrual' | 'cash';

interface GeneralLedgerResponse {
  success: boolean;
  data: {
    basis: Basis;
    from: string;
    to: string;
    accountFilter?: string;
    entries: {
      date: string;
      accountCode: string;
      accountName: string;
      description: string;
      debit: number;
      credit: number;
      sourceType: string;
      sourceId: string;
    }[];
  };
}

export default function GeneralLedgerPage() {
  const { currentOrg } = useAuth();
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(isoToday);
  const [basis, setBasis] = useState<Basis>('accrual');
  const [accountCode, setAccountCode] = useState('');
  const [data, setData] = useState<GeneralLedgerResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await api.accountancy.generalLedger({
        from,
        to,
        basis,
        accountCode: accountCode || undefined,
      })) as GeneralLedgerResponse;
      setData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load General Ledger');
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
        title="General Ledger"
        description="Line-level journal view of all postings generated from DXER events"
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
        <div>
          <label className="label mb-1">Account code (optional)</label>
          <input
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            className="input-field"
            placeholder="e.g. 6400"
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
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Ledger entries</h2>
        {!data ? (
          <p className="text-xs text-gray-400">{loading ? 'Loading…' : 'No entries for this period.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-gray-100 text-gray-400">
                <tr>
                  <th className="py-1 pr-3 font-normal">Date</th>
                  <th className="py-1 pr-3 font-normal">Account</th>
                  <th className="py-1 pr-3 font-normal">Description</th>
                  <th className="py-1 pr-3 text-right font-normal">Debit</th>
                  <th className="py-1 pr-3 text-right font-normal">Credit</th>
                  <th className="py-1 pr-0 font-normal">Source</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e, idx) => (
                  <tr key={`${e.accountCode}-${e.sourceId}-${idx}`} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3 text-gray-500">
                      {new Date(e.date).toISOString().split('T')[0]}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700">
                      <span className="font-mono text-[11px] text-gray-500">{e.accountCode}</span>{' '}
                      <span>{e.accountName}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700">{e.description}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-700">
                      {e.debit ? formatCurrency(e.debit) : ''}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-700">
                      {e.credit ? formatCurrency(e.credit) : ''}
                    </td>
                    <td className="py-1.5 pr-0 text-[11px] text-gray-400">
                      {e.sourceType} · {e.sourceId.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

