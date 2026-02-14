'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { AnchorBadge } from '@/components/ui/anchor-badge';
import { Modal } from '@/components/ui/modal';
import { formatCurrency, formatDate } from '@dxer/shared';
import { useUiMode } from '@/lib/ui-mode';
import { Plus, Download, CheckCircle } from 'lucide-react';

export default function PayrollPage() {
  const { currentOrg } = useAuth();
  const [uiMode] = useUiMode();
  const [data, setData] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({
    periodStart: '', periodEnd: '', payDate: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadPayrolls = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page) };
      if (fromDate) params.dateFrom = fromDate;
      if (toDate) params.dateTo = toDate;
      const res = await api.payrolls.list(params);
      setData(res.data);
      setPagination(res.pagination);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [currentOrg, page]);

  useEffect(() => { loadPayrolls(); }, [loadPayrolls]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.payrolls.create(formData);
      setShowCreate(false);
      setFormData({ periodStart: '', periodEnd: '', payDate: '', notes: '' });
      loadPayrolls();
    } catch (err: any) {
      setError(err.message || 'Failed to create payroll');
    } finally { setSubmitting(false); }
  };

  const handleComplete = async (id: string) => {
    if (!confirm('Mark this payroll as completed?')) return;
    try {
      await api.payrolls.complete(id);
      loadPayrolls();
    } catch (err: any) { alert(err.message); }
  };

  const handleExport = async (id: string) => {
    const token = localStorage.getItem('dxer_token');
    const orgId = localStorage.getItem('dxer_org_id');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/payrolls/${id}/export`, {
      headers: { Authorization: `Bearer ${token}`, 'x-org-id': orgId || '' },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'payroll.csv'; a.click();
  };

  const columns = [
    { key: 'periodStart', header: 'Period', render: (row: any) => `${formatDate(row.periodStart)} - ${formatDate(row.periodEnd)}` },
    { key: 'payDate', header: 'Pay Date', render: (row: any) => formatDate(row.payDate) },
    { key: 'totalAmount', header: 'Total', className: 'text-right', render: (row: any) => formatCurrency(row.totalAmount) },
    { key: 'entryCount', header: 'Employees', className: 'text-right' },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    ...(uiMode === 'advanced'
      ? [{ key: 'anchor', header: 'Proof', render: (row: any) => <AnchorBadge polygonTxHash={row.polygonTxhash} multichainTxId={row.multichainTxid} entityType="payroll" entityId={row.id} showLabel /> }]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Generate and manage payroll entries"
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="mr-2 h-4 w-4" />Generate Payroll</button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-100 bg-surface-50 px-4 py-3">
        <div>
          <label className="label mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="input-field"
          />
        </div>
        <div>
          <label className="label mb-1">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="input-field"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={setPage}
        isLoading={loading}
        emptyMessage="No payrolls yet."
        actions={(row) => (
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => handleExport(row.id)} className="text-primary-600 hover:text-primary-800 text-xs flex items-center gap-1">
              <Download className="h-3 w-3" /> CSV
            </button>
            {row.status === 'draft' && (
              <button onClick={() => handleComplete(row.id)} className="text-green-600 hover:text-green-800 text-xs flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Complete
              </button>
            )}
          </div>
        )}
      />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Generate Payroll">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <p className="text-sm text-gray-500">This will generate a payroll entry for all active employees with their current salary.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Period Start *</label>
              <input type="date" value={formData.periodStart} onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })} className="input-field mt-1" required />
            </div>
            <div>
              <label className="label">Period End *</label>
              <input type="date" value={formData.periodEnd} onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })} className="input-field mt-1" required />
            </div>
          </div>
          <div>
            <label className="label">Pay Date *</label>
            <input type="date" value={formData.payDate} onChange={(e) => setFormData({ ...formData, payDate: e.target.value })} className="input-field mt-1" required />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input-field mt-1" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Generating...' : 'Generate Payroll'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
