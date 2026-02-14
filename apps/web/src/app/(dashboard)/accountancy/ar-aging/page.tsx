'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@dxer/shared';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';

interface AgingResponse {
  success: boolean;
  data: {
    asOf: string;
    rows: {
      key: string;
      name: string;
      current: number;
      bucket_1_30: number;
      bucket_31_60: number;
      bucket_61_90: number;
      bucket_over_90: number;
      total: number;
    }[];
    totals: {
      key: string;
      name: string;
      current: number;
      bucket_1_30: number;
      bucket_31_60: number;
      bucket_61_90: number;
      bucket_over_90: number;
      total: number;
    };
  };
}

export default function ArAgingPage() {
  const { currentOrg } = useAuth();
  const todayIso = new Date().toISOString().split('T')[0];
  const [asOf, setAsOf] = useState(todayIso);
  const [data, setData] = useState<AgingResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await api.accountancy.arAging(asOf)) as AgingResponse;
      setData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load AR aging');
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
        title="AR Aging Report"
        description="Outstanding receivables by customer and aging bucket"
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

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Aging by customer</h2>
        {!data ? (
          <p className="text-xs text-gray-400">{loading ? 'Loading…' : 'No open invoices.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-gray-100 text-gray-400">
                <tr>
                  <th className="py-1 pr-3 font-normal">Customer</th>
                  <th className="py-1 pr-3 text-right font-normal">Current</th>
                  <th className="py-1 pr-3 text-right font-normal">1–30</th>
                  <th className="py-1 pr-3 text-right font-normal">31–60</th>
                  <th className="py-1 pr-3 text-right font-normal">61–90</th>
                  <th className="py-1 pr-3 text-right font-normal">&gt; 90</th>
                  <th className="py-1 pr-0 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.key} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3 text-gray-700">{r.name}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-700">
                      {r.current ? formatCurrency(r.current) : ''}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-700">
                      {r.bucket_1_30 ? formatCurrency(r.bucket_1_30) : ''}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-700">
                      {r.bucket_31_60 ? formatCurrency(r.bucket_31_60) : ''}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-700">
                      {r.bucket_61_90 ? formatCurrency(r.bucket_61_90) : ''}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-700">
                      {r.bucket_over_90 ? formatCurrency(r.bucket_over_90) : ''}
                    </td>
                    <td className="py-1.5 pr-0 text-right text-gray-900 font-medium">
                      {formatCurrency(r.total)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200">
                  <td className="py-1.5 pr-3 text-xs font-semibold text-gray-500">
                    Total
                  </td>
                  <td className="py-1.5 pr-3 text-right text-xs font-semibold text-gray-800">
                    {formatCurrency(data.totals.current)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-xs font-semibold text-gray-800">
                    {formatCurrency(data.totals.bucket_1_30)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-xs font-semibold text-gray-800">
                    {formatCurrency(data.totals.bucket_31_60)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-xs font-semibold text-gray-800">
                    {formatCurrency(data.totals.bucket_61_90)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-xs font-semibold text-gray-800">
                    {formatCurrency(data.totals.bucket_over_90)}
                  </td>
                  <td className="py-1.5 pr-0 text-right text-xs font-semibold text-gray-900">
                    {formatCurrency(data.totals.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

