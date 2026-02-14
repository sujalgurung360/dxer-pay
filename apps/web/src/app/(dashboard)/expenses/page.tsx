'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Modal } from '@/components/ui/modal';
import { formatCurrency, formatDate, EXPENSE_CATEGORIES } from '@dxer/shared';
import { Plus, Download, Ban, Eye } from 'lucide-react';
import { AnchorBadge, AnchorDetail } from '@/components/ui/anchor-badge';

const ACCOUNT_OPTIONS = [
  { code: '', name: 'Auto (based on category)' },
  { code: '6400', name: '6400 · Office Supplies' },
  { code: '6200', name: '6200 · Software' },
  { code: '6100', name: '6100 · Rent' },
  { code: '6300', name: '6300 · Marketing' },
  { code: '5000', name: '5000 · COGS: Materials' },
  { code: '5010', name: '5010 · COGS: Production Costs' },
  { code: '6999', name: '6999 · Miscellaneous Expenses' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'ap', label: 'To be paid later (Accounts Payable)' },
  { value: 'bank', label: 'Paid from Bank: Operating' },
  { value: 'cash', label: 'Paid from Cash / Card' },
];

const DEPARTMENT_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'general', label: 'General' },
  { value: 'sales', label: 'Sales' },
  { value: 'production', label: 'Production' },
  { value: 'rnd', label: 'R&D' },
];

export default function ExpensesPage() {
  const { currentOrg } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({
    description: '', amount: '', category: 'supplies' as string,
    date: new Date().toISOString().split('T')[0], tags: '', notes: '',
  });
  const [accountOverride, setAccountOverride] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'ap' | 'bank' | 'cash'>('ap');
  const [department, setDepartment] = useState('');
  const [isCapex, setIsCapex] = useState(false);
  const [taxCode, setTaxCode] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showDetail, setShowDetail] = useState<any>(null);

  const loadExpenses = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const res = await api.expenses.list({ page: String(page), search });
      setData(res.data);
      setPagination(res.pagination);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [currentOrg, page, search]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const userTags = formData.tags ? formData.tags.split(',').map((t) => t.trim()) : [];
      const tags = [...userTags];

      if (accountOverride) {
        tags.push(`acct:${accountOverride}`);
      }

      if (paymentMethod === 'bank') tags.push('pay:bank');
      else if (paymentMethod === 'cash') tags.push('pay:cash');
      else tags.push('pay:ap');

      if (department) {
        tags.push(`dept:${department.toLowerCase()}`);
      }

      if (isCapex) {
        tags.push('capex:true');
      }
      if (taxCode) {
        tags.push(`tax:${taxCode}`);
      }
      if (projectCode) {
        tags.push(`proj:${projectCode}`);
      }

      await api.expenses.create({
        description: formData.description,
        amount: parseFloat(formData.amount),
        category: formData.category,
        date: formData.date,
        tags,
        notes: formData.notes || undefined,
      });
      setShowCreate(false);
      setFormData({ description: '', amount: '', category: 'supplies', date: new Date().toISOString().split('T')[0], tags: '', notes: '' });
      setAccountOverride('');
      setPaymentMethod('ap');
      setDepartment('');
      setIsCapex(false);
      setTaxCode('');
      setProjectCode('');
      loadExpenses();
    } catch (err: any) {
      setError(err.message || 'Failed to create expense');
    } finally { setSubmitting(false); }
  };

  const handleVoid = async (id: string) => {
    if (!confirm('Are you sure you want to void this expense?')) return;
    try {
      await api.expenses.void(id);
      loadExpenses();
    } catch (err: any) { alert(err.message); }
  };

  const viewExpenseDetail = async (id: string) => {
    try {
      const res = await api.expenses.get(id);
      setShowDetail(res.data);
    } catch (err: any) { alert(err.message); }
  };

  const handleExport = async () => {
    const token = localStorage.getItem('dxer_token');
    const orgId = localStorage.getItem('dxer_org_id');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/expenses/export`, {
      headers: { Authorization: `Bearer ${token}`, 'x-org-id': orgId || '' },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'expenses.csv'; a.click();
  };

  const columns = [
    { key: 'date', header: 'Date', render: (row: any) => formatDate(row.date) },
    { key: 'description', header: 'Description', render: (row: any) => <span className="font-medium">{row.description}</span> },
    { key: 'amount', header: 'Amount', className: 'text-right', render: (row: any) => formatCurrency(row.amount, row.currency) },
    { key: 'category', header: 'Category', render: (row: any) => <span className="capitalize">{row.category}</span> },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    { key: 'anchor', header: 'Proof', render: (row: any) => <AnchorBadge polygonTxHash={row.polygonTxhash} multichainTxId={row.multichainTxid} entityType="expense" entityId={row.id} showLabel /> },
  ];

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track and manage organization expenses"
        actions={
          <div className="flex gap-2">
            <button onClick={handleExport} className="btn-secondary"><Download className="mr-2 h-4 w-4" />Export CSV</button>
            <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="mr-2 h-4 w-4" />New Expense</button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={setPage}
        onSearch={(q) => { setSearch(q); setPage(1); }}
        searchPlaceholder="Search expenses..."
        isLoading={loading}
        emptyMessage="No expenses yet. Create your first expense."
        actions={(row) => (
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => viewExpenseDetail(row.id)} className="text-purple-400 hover:text-purple-300 text-xs flex items-center gap-1">
              <Eye className="h-3 w-3" /> View
            </button>
            {row.status !== 'voided' && (
              <button onClick={() => handleVoid(row.id)} className="text-red-600 hover:text-red-500 text-xs flex items-center gap-1">
                <Ban className="h-3 w-3" /> Void
              </button>
            )}
          </div>
        )}
      />

      {/* Expense Detail Modal — includes Blockchain Proof panel */}
      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title="Expense Detail" size="lg">
        {showDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 font-medium">Description</p>
                <p className="text-sm font-medium text-gray-800">{showDetail.description}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Amount</p>
                <p className="text-sm font-medium text-gray-800">{formatCurrency(showDetail.amount, showDetail.currency)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Category</p>
                <p className="text-sm capitalize text-gray-600">{showDetail.category}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Date</p>
                <p className="text-sm text-gray-600">{formatDate(showDetail.date)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Status</p>
                <StatusBadge status={showDetail.status} />
              </div>
              {showDetail.notes && (
                <div>
                  <p className="text-xs text-gray-400 font-medium">Notes</p>
                  <p className="text-sm text-gray-600">{showDetail.notes}</p>
                </div>
              )}
            </div>

            {/* Blockchain Proof — clickable verification */}
            <AnchorDetail
              polygonTxHash={showDetail.polygonTxhash}
              multichainTxId={showDetail.multichainTxid}
              multichainDataHex={showDetail.multichainDataHex}
              entityType="expense"
              entityId={showDetail.id}
            />
          </div>
        )}
      </Modal>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Expense" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          <div>
            <label className="label">Description *</label>
            <input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input-field mt-1" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Amount *</label>
              <input type="number" step="0.01" min="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="input-field mt-1" required />
            </div>
            <div>
              <label className="label">Category *</label>
              <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="input-field mt-1">
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date *</label>
              <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="input-field mt-1" required />
            </div>
            <div>
              <label className="label">Tags (comma-separated)</label>
              <input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} className="input-field mt-1" placeholder="office, supplies" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input-field mt-1" rows={2} />
          </div>
          <div className="rounded-2xl border border-dashed border-gray-200 bg-surface-50 px-3 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Accounting details (optional)
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="label text-xs">Account override</label>
                <select
                  value={accountOverride}
                  onChange={(e) => setAccountOverride(e.target.value)}
                  className="input-field mt-1 text-xs"
                >
                  {ACCOUNT_OPTIONS.map((opt) => (
                    <option key={opt.code || 'auto'} value={opt.code}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">Payment method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'ap' | 'bank' | 'cash')}
                  className="input-field mt-1 text-xs"
                >
                  {PAYMENT_METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">Department / cost centre</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="input-field mt-1 text-xs"
                >
                  {DEPARTMENT_OPTIONS.map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="inline-flex items-center gap-2 text-[11px] text-gray-500">
                <input
                  type="checkbox"
                  checked={isCapex}
                  onChange={(e) => setIsCapex(e.target.checked)}
                  className="h-3 w-3 rounded border-gray-300 text-purple-600"
                />
                Treat as fixed asset (capex)
              </label>
              <div>
                <label className="label text-xs">Tax code</label>
                <select
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  className="input-field mt-1 text-xs"
                >
                  <option value="">None</option>
                  <option value="gst_standard">GST - Standard</option>
                  <option value="gst_free">GST - Free</option>
                  <option value="out_of_scope">Out of scope</option>
                </select>
              </div>
              <div>
                <label className="label text-xs">Project / job code</label>
                <input
                  value={projectCode}
                  onChange={(e) => setProjectCode(e.target.value)}
                  className="input-field mt-1 text-xs"
                  placeholder="e.g. PROJ-001"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Creating...' : 'Create Expense'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
