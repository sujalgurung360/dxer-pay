'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@dxer/shared';

interface InvoiceListResponse {
  success: boolean;
  data: {
    id: string;
    invoiceNumber: string;
    status: string;
    total: number;
    dueDate: string;
  }[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export default function RevenueReportPage() {
  const { currentOrg } = useAuth();
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(isoToday);
  const [data, setData] = useState<{ total: number; byStatus: Record<string, number> } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await api.invoices.list({
        page: '1',
        pageSize: '500',
        // simple approximation: filter by due date range
        dateFrom: from,
        dateTo: to,
      } as any)) as InvoiceListResponse;

      const byStatus: Record<string, number> = {};
      let total = 0;

      res.data.forEach((inv) => {
        total += inv.total;
        byStatus[inv.status] = (byStatus[inv.status] || 0) + inv.total;
      });

      setData({ total, byStatus });
    } catch (err: any) {
      setError(err.message || 'Failed to load revenue data');
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

  const statusEntries = data ? Object.entries(data.byStatus) : [];

  return (
    <div>
      <PageHeader
        title="Revenue Report"
        description="Simple revenue breakdown by invoice status over a period"
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
        {!data ? (
          <p className="text-xs text-gray-400">
            {loading ? 'Loading…' : 'No invoices in this period.'}
          </p>
        ) : (
          <div className="space-y-1 text-xs">
            {statusEntries.map(([status, amount]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="capitalize text-gray-700">{status}</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(amount || 0)}
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-2 text-xs font-semibold text-gray-900">
              <span>Total invoiced</span>
              <span>{formatCurrency(data.total || 0)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

