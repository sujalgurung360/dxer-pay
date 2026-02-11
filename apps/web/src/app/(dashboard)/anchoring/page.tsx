'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { AnchorBadge } from '@/components/ui/anchor-badge';
import { Anchor, CheckCircle, AlertCircle, Loader2, ShieldCheck, Shield } from 'lucide-react';

const ENTITY_TYPES = [
  { value: 'expense', label: 'Expenses' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'payroll', label: 'Payrolls' },
  { value: 'production_batch', label: 'Production Batches' },
  { value: 'production_event', label: 'Production Events' },
  { value: 'employee', label: 'Employees' },
  { value: 'customer', label: 'Customers' },
];

export default function AnchoringPage() {
  const { currentOrg } = useAuth();
  const [entityType, setEntityType] = useState('expense');
  const [records, setRecords] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (currentOrg) {
      loadRecords();
      loadJobs();
    }
  }, [currentOrg, entityType]);

  async function loadRecords() {
    setLoading(true);
    try {
      let res: any;
      switch (entityType) {
        case 'expense': res = await api.expenses.list({ pageSize: '50' }); break;
        case 'invoice': res = await api.invoices.list({ pageSize: '50' }); break;
        case 'payroll': res = await api.payrolls.list({ pageSize: '50' }); break;
        case 'production_batch': res = await api.batches.list({ pageSize: '50' }); break;
        case 'production_event': res = await api.events.list(); break;
        case 'employee': res = await api.employees.list({ pageSize: '50' }); break;
        case 'customer': res = await api.customers.list({ pageSize: '50' }); break;
      }
      setRecords(res.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function loadJobs() {
    try {
      const res = await api.anchoring.jobs();
      setJobs(res.data || []);
    } catch (err) { console.error(err); }
  }

  const isAnchored = (record: any) =>
    !!(record.polygonTxhash && record.multichainTxid);

  const unanchoredCount = records.filter((r) => !isAnchored(r)).length;

  const toggleSelection = (id: string) => {
    const record = records.find((r) => r.id === id);
    if (record && isAnchored(record)) return; // Can't select already-anchored
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAllUnanchored = () => {
    const unanchored = records.filter((r) => !isAnchored(r)).map((r) => r.id);
    setSelected(new Set(unanchored));
  };

  const handleAnchor = async () => {
    if (selected.size === 0) return;
    setAnchoring(true);
    setResult(null);
    try {
      const res = await api.anchoring.anchor(entityType, Array.from(selected));
      const results = res.data?.results || [];
      const anchored = results.filter((r: any) => r.status === 'anchored').length;
      const skipped = results.filter((r: any) => r.status === 'already_anchored').length;
      const failed = results.filter((r: any) => r.status === 'error').length;
      setResult({ anchored, skipped, failed, results });
      setSelected(new Set());
      loadRecords();
      loadJobs();
    } catch (err: any) {
      setResult({ error: err.message });
    } finally { setAnchoring(false); }
  };

  const getRecordLabel = (record: any) => {
    if (entityType === 'expense') return record.description || record.id;
    if (entityType === 'invoice') return record.invoiceNumber || record.id;
    if (entityType === 'payroll') return `Payroll: ${record.periodStart} → ${record.periodEnd}`;
    if (entityType === 'production_batch') return record.name || record.batchNumber || record.id;
    if (entityType === 'production_event') return `${record.eventType || 'Event'}: ${record.description || record.id}`;
    if (entityType === 'employee') return record.fullName || record.name || record.id;
    if (entityType === 'customer') return record.name || record.id;
    return record.description || record.name || record.id;
  };

  return (
    <div>
      <PageHeader
        title="Blockchain Anchoring"
        description="Anchor records to Multichain (private) and Polygon Amoy (public) for immutable verification"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Record selection */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setSelected(new Set()); }} className="input-field w-48">
                  {ENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <span className="text-sm text-gray-400">{records.length} records</span>
                {unanchoredCount > 0 && (
                  <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                    {unanchoredCount} unanchored
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unanchoredCount > 0 && (
                  <button
                    onClick={selectAllUnanchored}
                    className="btn-secondary text-xs"
                  >
                    Select All Unanchored
                  </button>
                )}
                <button
                  onClick={handleAnchor}
                  disabled={selected.size === 0 || anchoring}
                  className="btn-primary"
                >
                  {anchoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Anchor className="mr-2 h-4 w-4" />}
                  Anchor {selected.size} Selected
                </button>
              </div>
            </div>

            {result && (
              <div className={`mb-4 rounded-lg p-3 text-sm ${result.error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                {result.error
                  ? result.error
                  : (
                    <div className="flex items-center gap-4">
                      {result.anchored > 0 && <span><ShieldCheck className="inline h-4 w-4 mr-1" />{result.anchored} anchored</span>}
                      {result.skipped > 0 && <span className="text-purple-400">{result.skipped} already anchored (skipped)</span>}
                      {result.failed > 0 && <span className="text-red-600">{result.failed} failed</span>}
                    </div>
                  )}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : records.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No records found</p>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {records.map((record: any) => {
                  const anchored = isAnchored(record);
                  return (
                    <label
                      key={record.id}
                      className={`flex items-center gap-3 p-3 ${
                        anchored
                          ? 'bg-surface-50 cursor-default'
                          : 'hover:bg-surface-100 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(record.id)}
                        onChange={() => toggleSelection(record.id)}
                        disabled={anchored}
                        className="h-4 w-4 rounded border-gray-100 accent-purple-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${anchored ? 'text-gray-400' : 'text-gray-900'}`}>
                          {getRecordLabel(record)}
                        </p>
                        <p className="text-xs text-gray-400">{record.id}</p>
                      </div>
                      <AnchorBadge
                        polygonTxHash={record.polygonTxhash}
                        multichainTxId={record.multichainTxid}
                        entityType={entityType}
                        entityId={record.id}
                        showLabel
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent anchor jobs */}
        <div>
          <div className="card">
            <h3 className="text-sm font-semibold font-serif text-gray-900 mb-3">Recent Anchor Jobs</h3>
            {jobs.length === 0 ? (
              <p className="text-sm text-gray-400">No anchor jobs yet</p>
            ) : (
              <div className="space-y-2">
                {jobs.slice(0, 20).map((job: any) => (
                  <div key={job.id} className="rounded-lg border border-gray-100 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium capitalize">{job.entityType.replace(/_/g, ' ')}</span>
                      <StatusBadge status={job.status} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{new Date(job.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
