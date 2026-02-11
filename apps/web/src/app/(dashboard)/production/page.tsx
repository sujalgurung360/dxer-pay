'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { AnchorBadge, AnchorDetail } from '@/components/ui/anchor-badge';
import { Modal } from '@/components/ui/modal';
import { formatDate } from '@dxer/shared';
import { Plus, Eye, Clock } from 'lucide-react';

export default function ProductionPage() {
  const { currentOrg } = useAuth();
  const [batches, setBatches] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', plannedStartDate: '', plannedEndDate: '' });
  const [eventForm, setEventForm] = useState({ eventType: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadBatches = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const res = await api.batches.list({ page: String(page), search });
      setBatches(res.data);
      setPagination(res.pagination);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [currentOrg, page, search]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.batches.create({
        name: formData.name,
        description: formData.description || undefined,
        plannedStartDate: formData.plannedStartDate || undefined,
        plannedEndDate: formData.plannedEndDate || undefined,
      });
      setShowCreate(false);
      setFormData({ name: '', description: '', plannedStartDate: '', plannedEndDate: '' });
      loadBatches();
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const viewBatchDetail = async (id: string) => {
    try {
      const res = await api.batches.get(id);
      setShowDetail(res.data);
    } catch (err: any) { alert(err.message); }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDetail) return;
    setSubmitting(true);
    try {
      await api.events.create({
        batchId: showDetail.id,
        eventType: eventForm.eventType,
        description: eventForm.description || undefined,
      });
      setEventForm({ eventType: '', description: '' });
      setShowAddEvent(false);
      viewBatchDetail(showDetail.id);
    } catch (err: any) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  const columns = [
    { key: 'name', header: 'Batch Name', render: (row: any) => <span className="font-medium text-gray-800">{row.name}</span> },
    { key: 'status', header: 'Status', render: (row: any) => <StatusBadge status={row.status} /> },
    { key: 'plannedStartDate', header: 'Planned Start', render: (row: any) => row.plannedStartDate ? formatDate(row.plannedStartDate) : '-' },
    { key: 'eventCount', header: 'Events', className: 'text-right' },
    { key: 'expenseCount', header: 'Expenses', className: 'text-right' },
    { key: 'anchor', header: 'Proof', render: (row: any) => <AnchorBadge polygonTxHash={row.polygonTxhash} multichainTxId={row.multichainTxid} entityType="production_batch" entityId={row.id} showLabel /> },
  ];

  return (
    <div>
      <PageHeader
        title="Production"
        description="Manage production batches and events"
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="mr-2 h-4 w-4" />New Batch</button>
        }
      />

      <DataTable
        columns={columns}
        data={batches}
        pagination={pagination}
        onPageChange={setPage}
        onSearch={(q) => { setSearch(q); setPage(1); }}
        searchPlaceholder="Search batches..."
        isLoading={loading}
        emptyMessage="No production batches yet."
        actions={(row) => (
          <button onClick={() => viewBatchDetail(row.id)} className="text-purple-400 hover:text-purple-300 text-xs flex items-center gap-1">
            <Eye className="h-3 w-3" /> View
          </button>
        )}
      />

      {/* Create Batch Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Production Batch">
        <form onSubmit={handleCreateBatch} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          <div>
            <label className="label">Batch Name *</label>
            <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field mt-1" required />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input-field mt-1" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Planned Start</label>
              <input type="date" value={formData.plannedStartDate} onChange={(e) => setFormData({ ...formData, plannedStartDate: e.target.value })} className="input-field mt-1" />
            </div>
            <div>
              <label className="label">Planned End</label>
              <input type="date" value={formData.plannedEndDate} onChange={(e) => setFormData({ ...formData, plannedEndDate: e.target.value })} className="input-field mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Creating...' : 'Create Batch'}</button>
          </div>
        </form>
      </Modal>

      {/* Batch Detail Modal */}
      <Modal isOpen={!!showDetail} onClose={() => { setShowDetail(null); setShowAddEvent(false); }} title={showDetail?.name || 'Batch Detail'} size="lg">
        {showDetail && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <StatusBadge status={showDetail.status} />
              <span className="text-sm text-gray-400">Created {formatDate(showDetail.createdAt)}</span>
            </div>
            {showDetail.description && <p className="text-sm text-gray-600">{showDetail.description}</p>}

            {/* Blockchain Proof Panel */}
            <AnchorDetail
              polygonTxHash={showDetail.polygonTxhash}
              multichainTxId={showDetail.multichainTxid}
              multichainDataHex={showDetail.multichainDataHex}
              entityType="production_batch"
              entityId={showDetail.id}
            />

            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold font-serif text-gray-900">Timeline</h3>
                <button onClick={() => setShowAddEvent(true)} className="text-sm text-purple-400 hover:text-purple-300">+ Add Event</button>
              </div>

              {showAddEvent && (
                <form onSubmit={handleAddEvent} className="mb-4 rounded-lg border border-gray-100 p-3 space-y-2">
                  <input placeholder="Event type (e.g., quality_check)" value={eventForm.eventType} onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })} className="input-field" required />
                  <input placeholder="Description" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} className="input-field" />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowAddEvent(false)} className="btn-secondary py-1.5 px-3 text-xs">Cancel</button>
                    <button type="submit" className="btn-primary py-1.5 px-3 text-xs">Add Event</button>
                  </div>
                </form>
              )}

              {showDetail.events?.length === 0 ? (
                <p className="text-sm text-gray-300">No events yet</p>
              ) : (
                <div className="space-y-3">
                  {showDetail.events?.map((evt: any) => (
                    <div key={evt.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <Clock className="h-4 w-4 text-purple-400" />
                        <div className="w-px flex-1 bg-surface-100" />
                      </div>
                      <div className="pb-4">
                        <p className="text-sm font-medium text-gray-900">{evt.eventType.replace(/_/g, ' ')}</p>
                        {evt.description && <p className="text-sm text-gray-400">{evt.description}</p>}
                        <p className="text-xs text-gray-300">{new Date(evt.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
