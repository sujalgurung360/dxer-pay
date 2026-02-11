'use client';

import Link from 'next/link';
import { Shield, ShieldCheck, ShieldAlert, ShieldX, Loader2, ExternalLink } from 'lucide-react';

type IntegrityStatus = 'verified' | 'tampered' | 'anchored' | 'pending';

interface AnchorBadgeProps {
  polygonTxHash?: string | null;
  multichainTxId?: string | null;
  entityType?: string;
  entityId?: string;
  integrityStatus?: IntegrityStatus;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function AnchorBadge({
  polygonTxHash, multichainTxId, entityType, entityId,
  integrityStatus, size = 'sm', showLabel = false,
}: AnchorBadgeProps) {
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  const explorerLink = polygonTxHash
    ? `/dxexplorer?tx=${encodeURIComponent(polygonTxHash)}&verify=true`
    : entityType && entityId
      ? `/dxexplorer?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&verify=true`
      : null;

  if (integrityStatus === 'verified') {
    return (
      <Link href={explorerLink || '/dxexplorer'} className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-500 transition-colors group">
        <ShieldCheck className={iconSize} />
        {showLabel ? <span className="text-xs font-medium group-hover:underline">Verified</span> : <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </Link>
    );
  }
  if (integrityStatus === 'tampered') {
    return (
      <Link href={explorerLink || '/dxexplorer'} className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-500 transition-colors group">
        <ShieldX className={iconSize} />
        {showLabel ? <span className="text-xs font-medium group-hover:underline">Tampered</span> : <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </Link>
    );
  }
  if (integrityStatus === 'anchored') {
    return (
      <Link href={explorerLink || '/dxexplorer'} className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-500 transition-colors group">
        <Shield className={`${iconSize} fill-purple-100`} />
        {showLabel ? <span className="text-xs font-medium group-hover:underline">Anchored</span> : <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </Link>
    );
  }
  if (polygonTxHash && multichainTxId) {
    return (
      <Link href={explorerLink || '/dxexplorer'} className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-500 transition-colors group">
        <Shield className={`${iconSize} fill-purple-100`} />
        {showLabel ? <span className="text-xs font-medium group-hover:underline">Anchored</span> : <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </Link>
    );
  }
  if (polygonTxHash || multichainTxId) {
    const partialLink = polygonTxHash ? `/dxexplorer?tx=${encodeURIComponent(polygonTxHash)}&verify=true` : null;
    const badge = (
      <span className={`inline-flex items-center gap-1.5 text-amber-500 ${partialLink ? 'hover:text-amber-400 cursor-pointer' : ''}`}>
        <Loader2 className={`${iconSize} animate-spin`} />
        {showLabel && <span className="text-xs font-medium">Anchoring...</span>}
      </span>
    );
    return partialLink ? <Link href={partialLink}>{badge}</Link> : badge;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-300">
      <Shield className={iconSize} />
      {showLabel && <span className="text-xs font-medium">Pending</span>}
    </span>
  );
}

interface AnchorDetailProps {
  polygonTxHash?: string | null;
  multichainTxId?: string | null;
  multichainDataHex?: string | null;
  entityType?: string;
  entityId?: string;
  integrityStatus?: IntegrityStatus;
}

export function AnchorDetail({
  polygonTxHash, multichainTxId, multichainDataHex,
  entityType, entityId, integrityStatus,
}: AnchorDetailProps) {
  const isAnchored = polygonTxHash || multichainTxId;
  const isVerified = integrityStatus === 'verified';
  const isTampered = integrityStatus === 'tampered';
  const polygonScanUrl = polygonTxHash ? `https://amoy.polygonscan.com/tx/${polygonTxHash}` : null;
  const dxExplorerUrl = polygonTxHash
    ? `/dxexplorer?tx=${encodeURIComponent(polygonTxHash)}&verify=true`
    : entityType && entityId
      ? `/dxexplorer?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&verify=true`
      : '/dxexplorer';

  const panelStyle = isTampered ? 'border-red-200 bg-red-50' : isVerified ? 'border-emerald-200 bg-emerald-50' : isAnchored ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-gray-50';

  return (
    <div className={`rounded-2xl border p-4 ${panelStyle}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isTampered ? (
            <><ShieldX className="h-5 w-5 text-red-600" /><h4 className="font-semibold text-red-800 font-serif">Integrity Failure</h4></>
          ) : isVerified ? (
            <><ShieldCheck className="h-5 w-5 text-emerald-600" /><h4 className="font-semibold text-emerald-800 font-serif">Integrity Verified</h4></>
          ) : isAnchored ? (
            <><Shield className="h-5 w-5 text-purple-600 fill-purple-100" /><h4 className="font-semibold text-purple-800 font-serif">Blockchain Anchored</h4></>
          ) : (
            <><ShieldAlert className="h-5 w-5 text-gray-400" /><h4 className="font-semibold text-gray-600 font-serif">Pending Anchor</h4></>
          )}
        </div>
        {isAnchored && (
          <Link href={dxExplorerUrl} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
            isTampered ? 'bg-red-600 hover:bg-red-500' : isVerified ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-purple-600 hover:bg-purple-500'
          }`}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {isTampered ? 'Investigate' : 'Verify in DXEXPLORER'}
          </Link>
        )}
      </div>
      {isTampered && (
        <div className="mb-3 p-2.5 bg-red-100 border border-red-200 rounded-xl">
          <p className="text-sm text-red-800 font-medium">Warning: Data does not match the anchored proof.</p>
        </div>
      )}
      {isAnchored ? (
        <div className="space-y-2 text-sm">
          {polygonTxHash && (
            <div>
              <span className="text-gray-500 font-medium">Polygon TX: </span>
              <Link href={dxExplorerUrl} className="text-purple-600 hover:underline font-mono text-xs break-all">{polygonTxHash}</Link>
            </div>
          )}
          {multichainTxId && (
            <div>
              <span className="text-gray-500 font-medium">Multichain TX: </span>
              <span className="font-mono text-xs text-gray-700 break-all">{multichainTxId}</span>
            </div>
          )}
          {multichainDataHex && (
            <div>
              <span className="text-gray-500 font-medium">Data Hex: </span>
              <span className="font-mono text-xs text-gray-700 break-all">{multichainDataHex.slice(0, 64)}...</span>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            {polygonScanUrl && (
              <a href={polygonScanUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-500">
                <ExternalLink className="h-3 w-3" /> PolygonScan
              </a>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Queued for blockchain anchoring.</p>
      )}
    </div>
  );
}
