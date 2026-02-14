'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, Shield, ShieldCheck, ShieldX, ArrowRight,
  ExternalLink, Hash, Database, Globe, CheckCircle2,
  XCircle, Clock, Copy, RefreshCw, ChevronDown, ChevronUp,
  Fingerprint, Link2, Server, HardDrive, AlertTriangle,
  Building2, ArrowLeftRight,
} from 'lucide-react';
import { useUiMode } from '@/lib/ui-mode';
import { api } from '@/lib/api';

type ResolvedAddress = {
  address: string;
  isDxerOrg: boolean;
  name?: string;
  slug?: string;
  walletAddress?: string;
};

type VerificationResult = {
  verified: boolean;
  identifier: string;
  polygonTxHash: string | null;
  onChainHash: string | null;
  recomputedHash: string | null;
  /** Entity type extracted from Polygon calldata — traceable */
  entityType: string | null;
  /** Entity ID extracted from Polygon calldata — traceable */
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  blockNumber: number | null;
  timestamp: string | null;
  explorerUrl: string | null;
  multichainTxid: string | null;
  multichainConfirmations: number | null;
  polygonConfirmations: number | null;
  /** Whether data was recovered from MultiChain blockchain */
  recoveredFromBlockchain?: boolean;
  error?: string;
};

type LookupResult = {
  identifier: string;
  anchorJobs: Array<{
    id: string;
    entityType: string;
    entityId: string;
    status: string;
    payload: any;
    result: any;
    createdAt: string;
  }>;
  matchingRecords: Array<{
    entityType: string;
    entityId: string;
    polygonTxHash: string;
    multichainTxId: string;
    multichainDataHex: string;
  }>;
};

type SearchMode = 'verify' | 'lookup';

export default function DXExplorerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [uiMode] = useUiMode();
  const [searchMode, setSearchMode] = useState<SearchMode>('verify');

  useEffect(() => {
    if (uiMode === 'simple') {
      router.replace('/dashboard');
    }
  }, [uiMode, router]);
  const [identifier, setIdentifier] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const autoVerified = useRef(false);
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, ResolvedAddress>>({});

  // ─── URL Parameter Support ──────────────────────────────────
  // Accepts: ?tx=0x... or ?entityType=expense&entityId=UUID
  // Add &verify=true to auto-trigger verification on load
  //
  // This enables the clickable proof flow:
  //   User → Record → Click proof badge → DXEXPLORER auto-verifies
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const txParam = searchParams.get('tx');
    const entityTypeParam = searchParams.get('entityType');
    const entityIdParam = searchParams.get('entityId');
    const autoVerify = searchParams.get('verify') === 'true';

    if (txParam) {
      setIdentifier(txParam);
      setSearchMode('verify');
    }
    if (entityTypeParam) {
      setEntityType(entityTypeParam);
      setSearchMode('verify');
    }
    if (entityIdParam) {
      setEntityId(entityIdParam);
      setSearchMode('verify');
    }

    // Auto-verify if params present and verify=true
    if (autoVerify && !autoVerified.current && (txParam || (entityTypeParam && entityIdParam))) {
      autoVerified.current = true;
    }
  }, [searchParams]);

  const handleVerify = useCallback(async () => {
    setLoading(true);
    setError(null);
    setVerifyResult(null);
    setLookupResult(null);

    try {
      if (searchMode === 'verify') {
        const params: any = {};
        if (identifier.startsWith('0x')) {
          params.polygonTxHash = identifier;
        } else if (entityType && entityId) {
          params.entityType = entityType;
          params.entityId = entityId;
        } else if (identifier) {
          // Try as polygon tx hash first
          params.polygonTxHash = identifier;
        }

        const response = await api.dxexplorer.verify(params);
        setVerifyResult(response.data);
      } else {
        const response = await api.dxexplorer.lookup(identifier || entityId || '');
        setLookupResult(response.data);
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }, [searchMode, identifier, entityType, entityId]);

  // Auto-verify when loaded from a clickable proof link
  useEffect(() => {
    if (autoVerified.current && (identifier || (entityType && entityId)) && !verifyResult && !loading) {
      handleVerify();
    }
  }, [identifier, entityType, entityId, handleVerify, verifyResult, loading]);

  // Resolve addresses from metadata to detect inter-org relationships
  useEffect(() => {
    if (!verifyResult?.metadata) return;
    const meta = verifyResult.metadata as Record<string, any>;
    // Extract possible addresses: customer, from, to, org wallet, etc.
    const addressFields = ['wallet_address', 'metamask_address', 'from_address', 'to_address', 'customer_address'];
    const addresses: string[] = [];

    // Check invoice metadata for customer org relationship
    if (meta.customer_id || meta.org_id) {
      // We'll try to resolve these from the metadata
    }

    // Look for any Ethereum-like address in metadata values
    const findAddresses = (obj: Record<string, any>) => {
      for (const val of Object.values(obj)) {
        if (typeof val === 'string' && val.startsWith('0x') && val.length === 42) {
          addresses.push(val);
        }
      }
    };
    findAddresses(meta);

    // Resolve unique addresses
    const uniqueAddresses = [...new Set(addresses)];
    uniqueAddresses.forEach(async (addr) => {
      if (resolvedAddresses[addr]) return;
      try {
        const res = await api.orgs.resolveAddress(addr);
        setResolvedAddresses((prev) => ({ ...prev, [addr]: res.data }));
      } catch {
        setResolvedAddresses((prev) => ({
          ...prev,
          [addr]: { address: addr, isDxerOrg: false },
        }));
      }
    });
  }, [verifyResult?.metadata]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-purple-500">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">DXEXPLORER</h1>
              <p className="text-sm text-gray-400">
                Verification bridge between off-chain metadata and on-chain proof
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Architecture Flow Diagram */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Data Flow (Anchoring + Verification)</h3>
          {/* Anchoring Flow */}
          <div className="mb-3 flex items-center justify-between gap-3 overflow-x-auto">
            <FlowStep icon={<Database className="h-5 w-5" />} label="DXER Backend" desc="{METADATA}" color="blue" />
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <FlowStep icon={<Server className="h-5 w-5" />} label="HyperLedger" desc="Generates Hash" color="orange" />
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <FlowStep icon={<Globe className="h-5 w-5" />} label="Polygon" desc="Anchors Hash" color="purple" />
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <FlowStep icon={<ExternalLink className="h-5 w-5" />} label="PolygonScan" desc="Public proof" color="purple" />
          </div>
          {/* Verification Flow */}
          <div className="flex items-center justify-between gap-3 overflow-x-auto border-t border-gray-200 pt-3">
            <FlowStep icon={<Search className="h-5 w-5" />} label="Input TX Hash" desc="e.g. 0xabc..." color="gray" />
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <FlowStep icon={<Globe className="h-5 w-5" />} label="Polygon" desc="Extract hash + entity" color="purple" />
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <FlowStep icon={<Database className="h-5 w-5" />} label="DXER Backend" desc="Fetch {METADATA}" color="blue" />
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <FlowStep icon={<Hash className="h-5 w-5" />} label="Recompute" desc="SHA-256" color="orange" />
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <FlowStep icon={<ShieldCheck className="h-5 w-5" />} label="Compare" desc="Verified / Tampered" color="green" />
          </div>
        </div>
      </div>

      {/* Search Panel */}
      <div className="mx-auto max-w-6xl px-6 pb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          {/* Mode Tabs */}
          <div className="mb-6 flex gap-2">
            <button
              onClick={() => setSearchMode('verify')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                searchMode === 'verify'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-900'
              }`}
            >
              <ShieldCheck className="mr-2 inline-block h-4 w-4" />
              Verify Integrity
            </button>
            <button
              onClick={() => setSearchMode('lookup')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                searchMode === 'lookup'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-900'
              }`}
            >
              <Search className="mr-2 inline-block h-4 w-4" />
              Lookup Record
            </button>
          </div>

          {/* Input Fields */}
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {searchMode === 'verify' ? 'Polygon TX Hash or Identifier' : 'Search Identifier'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={searchMode === 'verify' ? '0x... (Polygon transaction hash)' : 'Enter TX hash, entity ID, or ledger ID'}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 pr-12 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                />
                <Fingerprint className="absolute right-4 top-3.5 h-4 w-4 text-gray-400" />
              </div>
            </div>

            {searchMode === 'verify' && (
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Entity Type (optional)</label>
                  <select
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">Select type...</option>
                    <option value="expense">Expense</option>
                    <option value="invoice">Invoice</option>
                    <option value="payroll">Payroll</option>
                    <option value="production_batch">Production Batch</option>
                    <option value="production_event">Production Event</option>
                    <option value="employee">Employee</option>
                    <option value="customer">Customer</option>
                    <option value="organization_member">Organization Member</option>
                    <option value="payroll_entry">Payroll Entry</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Entity ID (optional)</label>
                  <input
                    type="text"
                    value={entityId}
                    onChange={(e) => setEntityId(e.target.value)}
                    placeholder="UUID of the record"
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleVerify}
              disabled={loading || (!identifier && !entityId)}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:from-purple-500 hover:to-purple-400 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {searchMode === 'verify' ? 'Verifying...' : 'Looking up...'}
                </>
              ) : (
                <>
                  {searchMode === 'verify' ? <ShieldCheck className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                  {searchMode === 'verify' ? 'Verify Integrity' : 'Lookup'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-auto max-w-6xl px-6 pb-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-600">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </div>
        </div>
      )}

      {/* Verification Result */}
      {verifyResult && (
        <div className="mx-auto max-w-6xl px-6 pb-12">
          {/* Status Banner */}
          <div
            className={`mb-6 rounded-xl border p-6 ${
              verifyResult.verified
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-center gap-4">
              {verifyResult.verified ? (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <ShieldCheck className="h-8 w-8 text-emerald-500" />
                </div>
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                  <ShieldX className="h-8 w-8 text-red-500" />
                </div>
              )}
              <div>
                <h2 className={`text-xl font-bold ${verifyResult.verified ? 'text-emerald-600' : 'text-red-600'}`}>
                  {verifyResult.verified ? 'VERIFIED - Integrity Confirmed' : 'INTEGRITY FAILURE'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {verifyResult.verified
                    ? 'The recomputed hash matches the on-chain hash. Data has not been tampered with.'
                    : verifyResult.error || 'Hash mismatch detected. Data may have been modified.'}
                </p>
              </div>
            </div>
          </div>

          {/* Recovered from Blockchain Badge */}
          {verifyResult.recoveredFromBlockchain && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                  <Database className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-amber-700">Recovered from Blockchain</h3>
                  <p className="text-xs text-amber-600">
                    The original database record was not found. This data was recovered from the MultiChain
                    (HyperLedger) private blockchain — proving that decentralized backup works. The full
                    metadata was stored immutably on-chain at the time of anchoring.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Hash Comparison */}
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HashCard
              title="On-Chain Hash"
              subtitle="Fetched from Polygon"
              hash={verifyResult.onChainHash}
              icon={<Globe className="h-5 w-5 text-purple-500" />}
              color="purple"
              onCopy={copyToClipboard}
              copied={copied}
            />
            <HashCard
              title="Recomputed Hash"
              subtitle="From off-chain metadata"
              hash={verifyResult.recomputedHash}
              icon={<Hash className="h-5 w-5 text-blue-500" />}
              color="blue"
              onCopy={copyToClipboard}
              copied={copied}
            />
          </div>

          {/* Traceback: Polygon TX → Entity Reference */}
          {(verifyResult.entityType || verifyResult.entityId) && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <Link2 className="h-4 w-4" />
                Traceback: Polygon TX → Source Record
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded bg-purple-100 px-3 py-1.5 font-mono text-xs text-purple-600">
                  {verifyResult.polygonTxHash?.slice(0, 10)}...{verifyResult.polygonTxHash?.slice(-8)}
                </span>
                <ArrowRight className="h-4 w-4 text-gray-400" />
                <span className="rounded bg-orange-100 px-3 py-1.5 font-mono text-xs text-orange-600">
                  {verifyResult.onChainHash?.slice(0, 16)}...
                </span>
                <ArrowRight className="h-4 w-4 text-gray-400" />
                <span className="rounded bg-blue-100 px-3 py-1.5 text-xs text-blue-600">
                  <span className="font-semibold">{verifyResult.entityType}</span>
                  <span className="mx-1 text-gray-400">:</span>
                  <span className="font-mono">{verifyResult.entityId?.slice(0, 8)}...</span>
                </span>
                <ArrowRight className="h-4 w-4 text-gray-400" />
                <span className="rounded bg-emerald-100 px-3 py-1.5 text-xs text-emerald-600">
                  {verifyResult.metadata ? 'METADATA' : 'NOT FOUND'}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                Entity type and ID are embedded in the Polygon calldata. Every TX is traceable back to its source record.
              </p>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <DetailCard
              icon={<Globe className="h-4 w-4" />}
              label="Polygon TX"
              value={verifyResult.polygonTxHash}
              mono
              onCopy={copyToClipboard}
              copied={copied}
            />
            <DetailCard
              icon={<Server className="h-4 w-4" />}
              label="Block Number"
              value={verifyResult.blockNumber?.toLocaleString() || null}
            />
            <DetailCard
              icon={<Clock className="h-4 w-4" />}
              label="Anchored At"
              value={verifyResult.timestamp ? new Date(verifyResult.timestamp).toLocaleString() : null}
            />
          </div>

          {/* Chain Details */}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <DetailCard
              icon={<Database className="h-4 w-4" />}
              label="Entity Type"
              value={verifyResult.entityType}
            />
            <DetailCard
              icon={<Fingerprint className="h-4 w-4" />}
              label="Entity ID"
              value={verifyResult.entityId}
              mono
              onCopy={copyToClipboard}
              copied={copied}
            />
            <DetailCard
              icon={<Link2 className="h-4 w-4" />}
              label="HyperLedger TX"
              value={verifyResult.multichainTxid}
              mono
              onCopy={copyToClipboard}
              copied={copied}
            />
            <DetailCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Polygon Confirmations"
              value={verifyResult.polygonConfirmations?.toLocaleString() || null}
            />
          </div>

          {/* Explorer Link */}
          {verifyResult.explorerUrl && (
            <div className="mt-4">
              <a
                href={verifyResult.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-600 transition-colors hover:bg-purple-100"
              >
                <Globe className="h-4 w-4" />
                View on PolygonScan (Amoy)
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Dual-Address: Organization + Employee Wallet */}
          {verifyResult.metadata && (
            (() => {
              const meta = verifyResult.metadata as Record<string, any>;
              const orgWallet = meta.wallet_address || meta.org_wallet_address;
              const empWallet = meta.employee_wallet_address || meta.wallet_address_employee;
              const showDual = (verifyResult.entityType === 'payroll' || verifyResult.entityType === 'payroll_entry') && (orgWallet || empWallet);

              return showDual ? (
                <div className="mt-6 rounded-xl border border-purple-200 bg-purple-50 p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-600">
                    <ArrowLeftRight className="h-4 w-4" />
                    Dual-Address Transaction Link
                  </h3>
                  <p className="text-xs text-purple-500 mb-3">
                    This payroll transaction connects two Polygon addresses for verifiable employer-employee linkage.
                  </p>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    {/* Org Address */}
                    <div className="flex-1 rounded-lg border border-purple-200 bg-white p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Building2 className="h-4 w-4 text-purple-600" />
                        <span className="text-xs font-semibold text-purple-700">Organization</span>
                      </div>
                      {orgWallet ? (
                        <code className="block text-xs font-mono text-gray-600 truncate">{orgWallet}</code>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No wallet</span>
                      )}
                    </div>

                    <ArrowLeftRight className="hidden sm:block h-5 w-5 text-purple-400 flex-shrink-0" />

                    {/* Employee Address */}
                    <div className="flex-1 rounded-lg border border-purple-200 bg-white p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Globe className="h-4 w-4 text-purple-600" />
                        <span className="text-xs font-semibold text-purple-700">Employee</span>
                      </div>
                      {empWallet ? (
                        <code className="block text-xs font-mono text-gray-600 truncate">{empWallet}</code>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No wallet</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null;
            })()
          )}

          {/* Inter-Organization Address Relationships */}
          {Object.keys(resolvedAddresses).length > 0 && (
            <div className="mt-6 rounded-xl border border-cyan-200 bg-cyan-50 p-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-600">
                <ArrowLeftRight className="h-4 w-4" />
                Address Relationships
              </h3>
              <div className="space-y-3">
                {Object.entries(resolvedAddresses).map(([addr, resolved]) => (
                  <div key={addr} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
                    {resolved.isDxerOrg ? (
                      <>
                        <Building2 className="h-5 w-5 text-cyan-600" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{resolved.name}</p>
                          <div className="flex items-center gap-2">
                            <code className="text-xs text-gray-400 font-mono">{addr}</code>
                            <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-600">
                              DXER ORG
                            </span>
                          </div>
                        </div>
                        <a
                          href={`https://amoy.polygonscan.com/address/${addr}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-600 hover:text-cyan-500"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </>
                    ) : (
                      <>
                        <Globe className="h-5 w-5 text-gray-400" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-400">External Address</p>
                          <code className="text-xs text-gray-500 font-mono">{addr}</code>
                        </div>
                        <a
                          href={`https://amoy.polygonscan.com/address/${addr}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-500 hover:text-gray-400"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                Addresses found in transaction metadata are resolved against registered DXER organizations.
              </p>
            </div>
          )}

          {/* Metadata Section */}
          {verifyResult.metadata && (
            <div className="mt-6">
              <button
                onClick={() => setShowMetadata(!showMetadata)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
              >
                <HardDrive className="h-4 w-4" />
                Off-Chain Metadata
                {showMetadata ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showMetadata && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <pre className="overflow-x-auto text-xs text-gray-600">
                    {JSON.stringify(verifyResult.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lookup Result */}
      {lookupResult && (
        <div className="mx-auto max-w-6xl px-6 pb-12">
          <h3 className="mb-4 text-lg font-semibold">
            Search Results for <code className="rounded bg-gray-100 px-2 py-1 text-sm text-purple-600">{lookupResult.identifier}</code>
          </h3>

          {lookupResult.matchingRecords.length > 0 && (
            <div className="mb-6">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Matching Records</h4>
              <div className="space-y-3">
                {lookupResult.matchingRecords.map((r, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-600">
                          {r.entityType}
                        </span>
                        <code className="text-sm text-gray-600">{r.entityId}</code>
                      </div>
                      <button
                        onClick={() => {
                          setSearchMode('verify');
                          setEntityType(r.entityType);
                          setEntityId(r.entityId);
                          setIdentifier(r.polygonTxHash || '');
                        }}
                        className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-500"
                      >
                        Verify <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                    {r.polygonTxHash && (
                      <div className="mt-2 flex items-center gap-2">
                        <Globe className="h-3 w-3 text-gray-400" />
                        <code className="text-xs text-gray-500">{r.polygonTxHash}</code>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {lookupResult.anchorJobs.length > 0 && (
            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Anchor Jobs</h4>
              <div className="space-y-3">
                {lookupResult.anchorJobs.map((job) => (
                  <div key={job.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`rounded px-2 py-1 text-xs font-medium ${
                          job.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-yellow-100 text-yellow-600'
                        }`}>
                          {job.status}
                        </span>
                        <span className="text-sm text-gray-600">{job.entityType} / {job.entityId.slice(0, 8)}...</span>
                      </div>
                      <span className="text-xs text-gray-500">{new Date(job.createdAt).toLocaleString()}</span>
                    </div>
                    {job.result?.polygonTxHash && (
                      <div className="mt-2 flex items-center gap-2">
                        <Globe className="h-3 w-3 text-gray-400" />
                        <code className="text-xs text-gray-500">{job.result.polygonTxHash}</code>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {lookupResult.matchingRecords.length === 0 && lookupResult.anchorJobs.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-gray-400" />
              <p className="text-gray-400">No records found for this identifier</p>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!verifyResult && !lookupResult && !error && !loading && (
        <div className="mx-auto max-w-6xl px-6 pb-12">
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
            <Shield className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-500">Enter an identifier to verify</h3>
            <p className="mt-2 max-w-md mx-auto text-sm text-gray-400">
              Paste a Polygon transaction hash, entity ID, or HyperLedger reference to verify data integrity
              against the on-chain proof.
            </p>

            {/* Principle Cards */}
            <div className="mt-8 grid grid-cols-1 gap-4 text-left md:grid-cols-3">
              <PrincipleCard
                icon={<Database className="h-5 w-5 text-blue-500" />}
                title="Data stays off-chain"
                desc="Source records remain in the DXER database"
              />
              <PrincipleCard
                icon={<Fingerprint className="h-5 w-5 text-orange-500" />}
                title="Hash via Multichain"
                desc="SHA-256 hash published to private blockchain stream"
              />
              <PrincipleCard
                icon={<Globe className="h-5 w-5 text-purple-500" />}
                title="Anchored on Polygon"
                desc="Hash stored on Amoy testnet for public immutability"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function FlowStep({ icon, label, desc, color }: { icon: React.ReactNode; label: string; desc: string; color: string }) {
  const colors: Record<string, string> = {
    gray: 'border-gray-200 bg-gray-50',
    purple: 'border-purple-200 bg-purple-50',
    blue: 'border-blue-200 bg-blue-50',
    orange: 'border-orange-200 bg-orange-50',
    green: 'border-emerald-200 bg-emerald-50',
  };
  return (
    <div className={`flex flex-col items-center gap-2 rounded-lg border px-4 py-3 ${colors[color] || colors.gray}`}>
      {icon}
      <span className="text-xs font-semibold text-gray-900">{label}</span>
      <span className="text-[10px] text-gray-400">{desc}</span>
    </div>
  );
}

function HashCard({
  title, subtitle, hash, icon, color, onCopy, copied,
}: {
  title: string; subtitle: string; hash: string | null; icon: React.ReactNode; color: string;
  onCopy: (text: string, label: string) => void; copied: string | null;
}) {
  const borderColor = color === 'purple' ? 'border-purple-200' : 'border-blue-200';
  const bgColor = color === 'purple' ? 'bg-purple-50' : 'bg-blue-50';

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-5`}>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      {hash ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-gray-100 px-3 py-2 font-mono text-xs text-gray-600">{hash}</code>
          <button
            onClick={() => onCopy(hash, title)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
            title="Copy hash"
          >
            {copied === title ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">Not available</p>
      )}
    </div>
  );
}

function DetailCard({
  icon, label, value, mono, onCopy, copied,
}: {
  icon: React.ReactNode; label: string; value: string | null; mono?: boolean;
  onCopy?: (text: string, label: string) => void; copied?: string | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-1 flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      {value ? (
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
          {onCopy && (
            <button
              onClick={() => onCopy(value, label)}
              className="flex-shrink-0 rounded p-1 text-gray-400 hover:text-gray-900"
            >
              {copied === label ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>
      ) : (
        <span className="text-sm text-gray-400 italic">N/A</span>
      )}
    </div>
  );
}

function PrincipleCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2">{icon}</div>
      <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
      <p className="mt-1 text-xs text-gray-500">{desc}</p>
    </div>
  );
}
