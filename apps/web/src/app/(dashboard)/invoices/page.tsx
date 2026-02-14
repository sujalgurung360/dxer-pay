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
import { Plus, FileText, Send, CheckCircle } from 'lucide-react';

export default function InvoicesPage() {
  const { currentOrg } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    customerId: '', dueDate: '', taxRate: '0', notes: '',
    lineItems: [{ description: '', quantity: '1', unitPrice: '' }],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadInvoices = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page) };
      if (search) params.search = search;
      if (fromDate) params.dateFrom = fromDate;
      if (toDate) params.dateTo = toDate;
      const res = await api.invoices.list(params);
      setData(res.data);
      setPagination(res.pagination);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [currentOrg, page, search]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const loadCustomers = async () => {
    try {
      const res = await api.customers.list({ pageSize: '100' });
      setCustomers(res.data);
    } catch (err) { console.error(err); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const lineItems = formData.lineItems.map((li) => ({
        description: li.description,
        quantity: parseFloat(li.quantity),
        unitPrice: parseFloat(li.unitPrice),
        amount: parseFloat(li.quantity) * parseFloat(li.unitPrice),
      }));
      await api.invoices.create({
        customerId: formData.customerId,
        dueDate: formData.dueDate,
        taxRate: parseFloat(formData.taxRate),
        notes: formData.notes || undefined,
        lineItems,
      });
      setShowCreate(false);
      loadInvoices();
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice');
    } finally { setSubmitting(false); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.invoices.updateStatus(id, status);
      loadInvoices();
    } catch (err: any) { alert(err.message); }
  };

  const openCreateModal = () => {
    loadCustomers();
    setShowCreate(true);
  };

  const addLineItem = () => {
    setFormData({ ...formData, lineItems: [...formData.lineItems, { description: '', quantity: '1', unitPrice: '' }] });
  };

  const updateLineItem = (index: number, field: string, value: string) => {
    const items = [...formData.lineItems];
    (items[index] as any)[field] = value;
    setFormData({ ...formData, lineItems: items });
  };

  const viewPdf = (id: string) => {
    const token = localStorage.getItem('dxer_token');
    const orgId = localStorage.getItem('dxer_org_id');
    window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/invoices/${id}/pdf?token=${token}`, '_blank');
  };

  const columns = [
    { key: 'invoiceNumber', header: 'Invoice #', render: (row: any) => <span className="font-medium">{row.invoiceNumber}</span> },
    { key: 'customerName', header: 'Customer' },
    { key: 'dueDate', header: 'Due Date', render: (row: any) => formatDate(row.dueDate) },
    { key: 'total', header: 'Total', className: 'text-right', render: (row: any) => formatCurrency(row.total, row.currency) },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    { key: 'anchor', header: 'Proof', render: (row: any) => <AnchorBadge polygonTxHash={row.polygonTxhash} multichainTxId={row.multichainTxid} entityType="invoice" entityId={row.id} showLabel /> },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Create and manage invoices"
        actions={
          <button onClick={openCreateModal} className="btn-primary"><Plus className="mr-2 h-4 w-4" />New Invoice</button>
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
        onSearch={(q) => { setSearch(q); setPage(1); }}
        searchPlaceholder="Search invoices..."
        isLoading={loading}
        emptyMessage="No invoices yet."
        actions={(row) => (
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => viewPdf(row.id)} className="text-primary-600 hover:text-primary-800 text-xs flex items-center gap-1">
              <FileText className="h-3 w-3" /> PDF
            </button>
            {row.status === 'draft' && (
              <button onClick={() => handleStatusChange(row.id, 'sent')} className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1">
                <Send className="h-3 w-3" /> Send
              </button>
            )}
            {row.status === 'sent' && (
              <button onClick={() => handleStatusChange(row.id, 'paid')} className="text-green-600 hover:text-green-800 text-xs flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Paid
              </button>
            )}
          </div>
        )}
      />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Invoice" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Customer *</label>
              <select value={formData.customerId} onChange={(e) => setFormData({ ...formData, customerId: e.target.value })} className="input-field mt-1" required>
                <option value="">Select customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Due Date *</label>
              <input type="date" value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} className="input-field mt-1" required />
            </div>
          </div>
          <div>
            <label className="label">Tax Rate (%)</label>
            <input type="number" step="0.01" min="0" max="100" value={formData.taxRate} onChange={(e) => setFormData({ ...formData, taxRate: e.target.value })} className="input-field mt-1 w-32" />
          </div>

          <div>
            <label className="label mb-2">Line Items</label>
            {formData.lineItems.map((li, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <input placeholder="Description" value={li.description} onChange={(e) => updateLineItem(i, 'description', e.target.value)} className="input-field col-span-6" required />
                <input type="number" placeholder="Qty" value={li.quantity} onChange={(e) => updateLineItem(i, 'quantity', e.target.value)} className="input-field col-span-2" required />
                <input type="number" step="0.01" placeholder="Price" value={li.unitPrice} onChange={(e) => updateLineItem(i, 'unitPrice', e.target.value)} className="input-field col-span-3" required />
                <div className="col-span-1 flex items-center justify-center text-xs text-gray-500">
                  {li.quantity && li.unitPrice ? formatCurrency(parseFloat(li.quantity) * parseFloat(li.unitPrice)) : '$0'}
                </div>
              </div>
            ))}
            <button type="button" onClick={addLineItem} className="text-sm text-primary-600 hover:text-primary-700">+ Add Line Item</button>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input-field mt-1" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Creating...' : 'Create Invoice'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
