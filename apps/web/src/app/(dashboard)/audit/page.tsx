'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { useUiMode } from '@/lib/ui-mode';
import { AnchorBadge, AnchorDetail } from '@/components/ui/anchor-badge';
import { Modal } from '@/components/ui/modal';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '@dxer/shared';
import {
  Eye, GitBranch, ArrowRight, ExternalLink, Globe,
  Hash, Clock, ChevronDown, ChevronUp, Link2,
} from 'lucide-react';

export default function ActivityLogPage() {
  const { currentOrg } = useAuth();
  const [uiMode] = useUiMode();
  const [data, setData] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ entityType: '', action: '' });
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [versionHistory, setVersionHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showVersionChain, setShowVersionChain] = useState(false);

  const loadAudit = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page) };
      if (filters.entityType) params.entityType = filters.entityType;
      if (filters.action) params.action = filters.action;
      const res = await api.audit.list(params);
      setData(res.data);
      setPagination(res.pagination);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [currentOrg, page, filters]);

  useEffect(() => { loadAudit(); }, [loadAudit]);

  // Load version history for a specific entity when opening detail
  const loadVersionHistory = useCallback(async (entityType: string, entityId: string) => {
    setLoadingHistory(true);
    try {
      // Fetch all audit entries for this entity to build the version timeline
      const res = await api.audit.list({
        entityType,
        pageSize: '100',
      });
      // Filter for this entity ID and sort by version
      const entityEntries = (res.data || [])
        .filter((e: any) => e.entityId === entityId)
        .sort((a: any, b: any) => (a.version || 1) - (b.version || 1));
      setVersionHistory(entityEntries);
    } catch (err) {
      console.error('Failed to load version history:', err);
      setVersionHistory([]);
    }
    setLoadingHistory(false);
  }, []);

  const handleShowDetail = useCallback((row: any) => {
    setShowDetail(row);
    setShowVersionChain(false);
    setVersionHistory([]);
    loadVersionHistory(row.entityType, row.entityId);
  }, [loadVersionHistory]);

  const columns = [
    {
      key: 'createdAt', header: 'Timestamp',
      render: (row: any) => <span className="text-xs text-gray-400">{new Date(row.createdAt).toLocaleString()}</span>,
    },
    { key: 'userName', header: 'User' },
    {
      key: 'action', header: 'Action',
      render: (row: any) => (
        <span className={`badge ${row.action === 'create' ? 'badge-green' : row.action === 'void' || row.action === 'delete' ? 'badge-red' : 'badge-blue'}`}>
          {row.action}
        </span>
      ),
    },
    {
      key: 'entityType', header: 'Entity',
      render: (row: any) => <span className="capitalize">{row.entityType.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'entityId', header: 'Entity ID',
      render: (row: any) => <code className="text-xs bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{row.entityId.slice(0, 8)}...</code>,
    },
    {
      key: 'version', header: 'Version',
      render: (row: any) => (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
            v{row.version || 1}
          </span>
          {uiMode === 'advanced' && row.previousPolygonTx && (
            <Link2 className="h-3 w-3 text-purple-400" title="Linked to previous version" />
          )}
        </div>
      ),
    },
    ...(uiMode === 'advanced'
      ? [{
          key: 'anchor' as const,
          header: 'Proof',
          render: (row: any) => (
            <AnchorBadge
              polygonTxHash={row.polygonTxhash}
              multichainTxId={row.multichainTxid}
              entityType={row.entityType}
              entityId={row.entityId}
              integrityStatus={row.integrityStatus}
              showLabel
            />
          ),
        }]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Activity Log"
        description={uiMode === 'advanced' ? 'Complete trail of all actions with blockchain-backed version chain' : 'Complete trail of all actions'}
      />

      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <select
          value={filters.entityType}
          onChange={(e) => { setFilters({ ...filters, entityType: e.target.value }); setPage(1); }}
          className="input-field w-48"
        >
          <option value="">All Entities</option>
          {AUDIT_ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={filters.action}
          onChange={(e) => { setFilters({ ...filters, action: e.target.value }); setPage(1); }}
          className="input-field w-48"
        >
          <option value="">All Actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={setPage}
        isLoading={loading}
        emptyMessage="No activity entries found."
        actions={(row) => (
          <button
            onClick={() => handleShowDetail(row)}
            className="text-purple-400 hover:text-purple-300 text-xs flex items-center gap-1"
          >
            <Eye className="h-3 w-3" /> View
          </button>
        )}
      />

      {/* Activity Detail Modal */}
      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title="Activity Detail" size="lg">
        {showDetail && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 font-medium">User</p>
                <p className="text-sm font-medium text-gray-900 font-serif">{showDetail.userName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Timestamp</p>
                <p className="text-sm text-gray-600">{new Date(showDetail.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Action</p>
                <span className={`badge ${showDetail.action === 'create' ? 'badge-green' : showDetail.action === 'void' || showDetail.action === 'delete' ? 'badge-red' : 'badge-blue'}`}>
                  {showDetail.action}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Entity</p>
                <p className="text-sm capitalize text-gray-600">{showDetail.entityType.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Version</p>
                <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">
                  v{showDetail.version || 1}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Entity ID</p>
                <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-100 block mt-0.5 truncate">{showDetail.entityId}</code>
              </div>
              {showDetail.ipAddress && (
                <div>
                  <p className="text-xs text-gray-400 font-medium">IP Address</p>
                  <p className="text-sm text-gray-600">{showDetail.ipAddress}</p>
                </div>
              )}
            </div>

            {/* Changed Fields */}
            {showDetail.changedFields && showDetail.changedFields.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Changed Fields</p>
                <div className="flex flex-wrap gap-1.5">
                  {showDetail.changedFields.map((field: string) => (
                    <span key={field} className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs text-blue-700">
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Before / After Changes */}
            {(showDetail.before || showDetail.after) && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 font-serif">Changes</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">Before</p>
                    <pre className="text-xs bg-red-50 border border-red-200 p-3 rounded-lg overflow-auto max-h-48 text-red-600">
                      {JSON.stringify(showDetail.before || null, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">After</p>
                    <pre className="text-xs bg-emerald-50 border border-emerald-200 p-3 rounded-lg overflow-auto max-h-48 text-emerald-700">
                      {JSON.stringify(showDetail.after || null, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Version Chain Link (advanced only) */}
            {uiMode === 'advanced' && showDetail.previousPolygonTx && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <GitBranch className="h-4 w-4 text-purple-600" />
                  <span className="text-xs font-semibold text-purple-700">Previous Version Link</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-purple-600">Previous Polygon TX:</span>
                  <a
                    href={`https://amoy.polygonscan.com/tx/${showDetail.previousPolygonTx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-purple-700 hover:text-purple-500 flex items-center gap-1"
                  >
                    {showDetail.previousPolygonTx.slice(0, 16)}...
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {showDetail.previousHash && (
                  <div className="flex items-center gap-2 text-xs mt-1">
                    <span className="text-purple-600">Previous Hash:</span>
                    <code className="font-mono text-purple-700">{showDetail.previousHash.slice(0, 20)}...</code>
                  </div>
                )}
              </div>
            )}

            {/* Version Timeline (advanced: shows polygon links) */}
            {uiMode === 'advanced' && (
            <div>
              <button
                onClick={() => setShowVersionChain(!showVersionChain)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
              >
                <GitBranch className="h-4 w-4" />
                Version Timeline ({versionHistory.length} entries)
                {showVersionChain ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showVersionChain && (
                <div className="mt-3 space-y-0">
                  {loadingHistory ? (
                    <div className="text-xs text-gray-400 py-4 text-center">Loading version history...</div>
                  ) : versionHistory.length === 0 ? (
                    <div className="text-xs text-gray-400 py-4 text-center">No version history found</div>
                  ) : (
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

                      {versionHistory.map((entry: any, idx: number) => {
                        const isCurrentVersion = entry.id === showDetail.id;
                        return (
                          <div key={entry.id} className="relative flex items-start gap-3 pb-4">
                            {/* Timeline dot */}
                            <div className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                              isCurrentVersion
                                ? 'border-purple-500 bg-purple-500 text-white'
                                : entry.polygonTxhash
                                  ? 'border-emerald-400 bg-emerald-50 text-emerald-600'
                                  : 'border-gray-300 bg-white text-gray-400'
                            }`}>
                              <span className="text-[10px] font-bold">v{entry.version || idx + 1}</span>
                            </div>

                            {/* Content */}
                            <div className={`flex-1 rounded-lg border p-3 ${
                              isCurrentVersion ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-white'
                            }`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    entry.action === 'create' ? 'bg-emerald-100 text-emerald-700'
                                      : entry.action === 'void' || entry.action === 'delete' ? 'bg-red-100 text-red-700'
                                        : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {entry.action}
                                  </span>
                                  <span className="text-xs text-gray-500">{entry.userName}</span>
                                  {isCurrentVersion && (
                                    <span className="rounded bg-purple-200 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">CURRENT</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3 w-3 text-gray-400" />
                                  <span className="text-[10px] text-gray-400">{new Date(entry.createdAt).toLocaleString()}</span>
                                </div>
                              </div>

                              {/* Changed fields */}
                              {entry.changedFields && entry.changedFields.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {entry.changedFields.map((f: string) => (
                                    <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{f}</span>
                                  ))}
                                </div>
                              )}

                              {/* Polygon TX link */}
                              {entry.polygonTxhash && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <Globe className="h-3 w-3 text-purple-500" />
                                  <a
                                    href={`https://amoy.polygonscan.com/tx/${entry.polygonTxhash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-mono text-purple-600 hover:text-purple-500 flex items-center gap-0.5"
                                  >
                                    {entry.polygonTxhash.slice(0, 16)}...
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                </div>
                              )}

                              {/* Link arrow to next version */}
                              {idx < versionHistory.length - 1 && entry.polygonTxhash && (
                                <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                                  <ArrowRight className="h-3 w-3" />
                                  <span>links to v{(entry.version || idx + 1) + 1}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Blockchain Proof (advanced only) */}
            {uiMode === 'advanced' && (
            <AnchorDetail
              polygonTxHash={showDetail.polygonTxhash}
              multichainTxId={showDetail.multichainTxid}
              entityType={showDetail.entityType}
              entityId={showDetail.entityId}
              integrityStatus={showDetail.integrityStatus}
            />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
