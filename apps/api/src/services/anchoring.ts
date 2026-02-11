import { createHash } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import {
  publishToStream,
  getStreamItemsByKey,
  ensureStream,
  multichainHealthCheck,
} from '../lib/multichain.js';
import {
  submitHashToPolygon,
  getPolygonTransaction,
  parseDxerCalldata,
  polygonHealthCheck,
} from '../lib/polygon.js';
import type { AnchorPayload, AnchorResult, AnchorVerification } from '@dxer/shared';

/**
 * ═══════════════════════════════════════════════════════════════
 * DXEXPLORER Anchoring Service — REAL CHAIN INTEGRATION
 * ═══════════════════════════════════════════════════════════════
 *
 * Architecture:
 *
 *   DXER Platform ──► Multichain (Private) ──► Polygon (Public)
 *   (Backend/DB)      (Hash Generation)        (Immutable Anchor)
 *
 *   DXEXPLORER verifies by:
 *     1. Fetch on-chain hash from Polygon tx calldata
 *     2. Fetch off-chain metadata from DXER backend
 *     3. Recompute hash locally (SHA-256)
 *     4. Compare recomputed hash with on-chain hash
 *
 * Core principle:
 *   - Data stays off-chain (DXER database)
 *   - Hash generated & stored on Multichain (private/permissioned)
 *   - Hash anchored on Polygon for public immutability
 *   - DXEXPLORER = verification bridge
 * ═══════════════════════════════════════════════════════════════
 */

let streamInitialized = false;

/**
 * Initialize the Multichain stream on first use.
 */
async function initStream(): Promise<void> {
  if (streamInitialized) return;
  try {
    await ensureStream();
    streamInitialized = true;
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Could not initialize Multichain stream - will retry on next anchor');
  }
}

// ─── Step 1: Build Deterministic Metadata ─────────────────────────

/**
 * Assemble deterministic metadata payload from a record.
 * Canonical JSON: sorted keys, no randomness, no whitespace variance.
 *
 * For payroll_entry entities, includes the employee's wallet address
 * to create a dual-address blockchain record linking org ↔ employee.
 */
export function buildCanonicalMetadata(
  record: Record<string, unknown>,
  entityType: string,
  entityId: string,
): string {
  // Strip blockchain/audit fields that shouldn't be part of the canonical form
  const {
    created_at, updated_at,
    multichain_data_hex, multichain_txid, polygon_txhash,
    // Also strip encrypted private keys — never anchor secrets
    wallet_private_key_enc,
    ...cleanRecord
  } = record;

  const canonical = {
    entityType,
    entityId,
    data: Object.keys(cleanRecord)
      .sort()
      .reduce((acc: Record<string, unknown>, key) => {
        const val = cleanRecord[key];
        if (val instanceof Date) acc[key] = val.toISOString();
        else if (typeof val === 'bigint') acc[key] = val.toString();
        else if (val !== null && typeof val === 'object' && 'toNumber' in (val as any)) acc[key] = Number(val);
        else acc[key] = val;
        return acc;
      }, {}),
  };

  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Enrich a payroll entry record with employee and org wallet addresses
 * for dual-address blockchain anchoring.
 */
export async function enrichPayrollEntryMetadata(
  record: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { prisma } = await import('../lib/prisma.js');
  const enriched = { ...record };

  // Add employee wallet address if available
  if (record.employee_id) {
    try {
      const employee = await prisma.employees.findUnique({
        where: { id: record.employee_id as string },
        select: { wallet_address: true },
      });
      if (employee?.wallet_address) {
        enriched.employee_wallet_address = employee.wallet_address;
      }
    } catch {
      // Best effort — don't fail anchoring if lookup fails
    }
  }

  // Add org wallet address if payroll has org_id
  if (record.payroll_id) {
    try {
      const payroll = await prisma.payrolls.findUnique({
        where: { id: record.payroll_id as string },
        include: { organization: { select: { wallet_address: true } } },
      });
      if (payroll?.organization?.wallet_address) {
        enriched.org_wallet_address = payroll.organization.wallet_address;
      }
    } catch {
      // Best effort
    }
  }

  return enriched;
}

// ─── Step 2: Multichain Hash Generation ───────────────────────────

/**
 * Generate SHA-256 hash from canonical metadata and publish to Multichain.
 *
 * Flow: metadata → SHA-256 → publish to Multichain stream → return hash + txid
 */
export async function multichainPublishHash(
  metadata: string,
  entityType: string,
  entityId: string,
): Promise<{ hash: string; multichainTxid: string }> {
  await initStream();

  // Generate SHA-256 hash
  const hash = createHash('sha256').update(metadata).digest('hex');
  const streamKey = `${entityType}:${entityId}`;

  logger.info({ entityType, entityId, hash }, 'Multichain: publishing hash');

  // Publish hash + FULL metadata to Multichain stream
  // This makes MultiChain the source of truth — data can be recovered
  // even if the primary database (Supabase) is completely wiped
  const multichainTxid = await publishToStream(streamKey, hash, {
    entityType,
    entityId,
    metadataLength: metadata.length,
    fullMetadata: metadata,  // <-- FULL canonical metadata stored on-chain
  });

  logger.info({ hash, multichainTxid }, 'Multichain: hash published');

  return { hash, multichainTxid };
}

// ─── Step 3: Polygon Anchoring ────────────────────────────────────

/**
 * Anchor hash on Polygon blockchain.
 * Submits as calldata in a 0-value self-transfer.
 * Uses org-specific wallet if private key provided.
 */
export async function polygonAnchorHash(
  hash: string,
  entityType: string,
  entityId: string,
  orgPrivateKey?: string,
): Promise<{
  polygonTxHash: string;
  blockNumber: number;
  dataHex: string;
  explorerUrl: string;
  signerAddress: string;
}> {
  logger.info({ hash, entityType, entityId }, 'Polygon: anchoring hash');

  const result = await submitHashToPolygon(hash, entityType, entityId, orgPrivateKey);

  logger.info({
    polygonTxHash: result.polygonTxHash,
    blockNumber: result.blockNumber,
    explorerUrl: result.explorerUrl,
    signerAddress: result.signerAddress,
  }, 'Polygon: hash anchored');

  return {
    polygonTxHash: result.polygonTxHash,
    blockNumber: result.blockNumber,
    dataHex: result.dataHex,
    explorerUrl: result.explorerUrl,
    signerAddress: result.signerAddress,
  };
}

// ─── Full Anchor Pipeline ─────────────────────────────────────────

/**
 * Complete anchoring flow:
 *   1. Build canonical metadata from record
 *   2. SHA-256 hash → Multichain (private ledger) + full metadata storage
 *   3. Hash → Polygon (public blockchain) using org-specific wallet if available
 *   4. Return all transaction references
 *
 * @param orgPrivateKey - Optional decrypted org private key for per-org Polygon signing
 */
export async function anchorRecord(
  record: Record<string, unknown>,
  entityType: string,
  entityId: string,
  orgPrivateKey?: string,
): Promise<{
  multichainDataHex: string;
  multichainTxid: string;
  polygonTxhash: string;
  metadata: string;
  blockNumber: number;
  explorerUrl: string;
  signerAddress?: string;
}> {
  // Step 1: Build deterministic metadata from the record
  // This is the {METADATA} in the diagram
  const metadata = buildCanonicalMetadata(record, entityType, entityId);
  logger.info({ entityType, entityId, metadataLength: metadata.length }, 'Anchor pipeline: starting');

  // Step 2: Send metadata to HyperLedger (Multichain) → generates hash
  // Full metadata is stored on MultiChain for recoverability
  const { hash, multichainTxid } = await multichainPublishHash(metadata, entityType, entityId);

  // Step 3: Send the hash to Polygon → immutable public anchor
  // Uses org-specific wallet if provided, otherwise master wallet
  const polygon = await polygonAnchorHash(hash, entityType, entityId, orgPrivateKey);

  logger.info({
    entityType,
    entityId,
    hash,
    multichainTxid,
    polygonTxHash: polygon.polygonTxHash,
    blockNumber: polygon.blockNumber,
    explorerUrl: polygon.explorerUrl,
    signerAddress: polygon.signerAddress,
  }, 'Anchor pipeline: COMPLETE');

  return {
    multichainDataHex: hash,
    multichainTxid,
    polygonTxhash: polygon.polygonTxHash,
    metadata,
    blockNumber: polygon.blockNumber,
    explorerUrl: polygon.explorerUrl,
    signerAddress: polygon.signerAddress,
  };
}

// ─── DXEXPLORER Verification ──────────────────────────────────────

export interface DXExplorerResult {
  verified: boolean;
  identifier: string;
  polygonTxHash: string | null;
  /** The SHA-256 hash read from the Polygon calldata (on-chain truth) */
  onChainHash: string | null;
  /** The SHA-256 hash recomputed from current DB record */
  recomputedHash: string | null;
  /** The entity type extracted from Polygon calldata */
  entityType: string | null;
  /** The entity ID extracted from Polygon calldata */
  entityId: string | null;
  /** The full metadata of the off-chain record */
  metadata: Record<string, unknown> | null;
  blockNumber: number | null;
  timestamp: string | null;
  explorerUrl: string | null;
  multichainTxid: string | null;
  multichainConfirmations: number | null;
  polygonConfirmations: number | null;
  /** Whether data was recovered from MultiChain (private blockchain) */
  recoveredFromBlockchain: boolean;
  error?: string;
}

/**
 * ═══════════════════════════════════════════════════════════════
 * DXEXPLORER Full Verification Flow (matches diagram exactly)
 * ═══════════════════════════════════════════════════════════════
 *
 * Input: Polygon TX hash  (e.g. #11asdf4sadfsdf4s)
 *
 * Step 1: Fetch Polygon transaction
 *         → Read calldata: 0x + DXER + HASH + |entityType|entityId|
 *         → Extract: SHA-256 hash, entity type, entity ID
 *
 * Step 2: Trace back to HyperLedger (Multichain)
 *         → Query stream by entityType:entityId
 *         → Confirm hash was published on private chain
 *
 * Step 3: Trace back to DXER database
 *         → Fetch the actual record using entity type + ID
 *         → This is the off-chain {METADATA}
 *
 * Step 4: Recompute hash from current metadata
 *         → buildCanonicalMetadata() → SHA-256
 *
 * Step 5: Compare
 *         → recomputed hash vs on-chain hash
 *         → Match = VERIFIED (data is authentic)
 *         → Mismatch = TAMPERED (data was altered after anchoring)
 *
 * Result: Polygon TX hash → on-chain hash → entity reference →
 *         off-chain metadata → recomputed hash → verified/tampered
 *
 * Every hash can be traced back. Nothing is random.
 * ═══════════════════════════════════════════════════════════════
 */
export async function dxExplorerVerify(
  polygonTxHash: string,
  currentRecord: Record<string, unknown> | null,
  entityType: string,
  entityId: string,
): Promise<DXExplorerResult> {
  logger.info({ polygonTxHash, entityType, entityId }, 'DXEXPLORER: starting verification');

  // ─── Step 1: Fetch Polygon TX and extract embedded data ─────────
  const polygonTx = await getPolygonTransaction(polygonTxHash);

  if (!polygonTx) {
    return {
      verified: false,
      identifier: polygonTxHash,
      polygonTxHash,
      onChainHash: null,
      recomputedHash: null,
      entityType: entityType || null,
      entityId: entityId || null,
      metadata: null,
      blockNumber: null,
      timestamp: null,
      explorerUrl: null,
      multichainTxid: null,
      multichainConfirmations: null,
      polygonConfirmations: null,
      error: 'Transaction not found on Polygon. The hash may be invalid, or the transaction has not been confirmed yet.',
    };
  }

  const onChainHash = polygonTx.extractedHash;
  const explorerUrl = polygonTx.explorerUrl;

  // Use entity info extracted from Polygon calldata if not already provided
  // This is the key traceback: Polygon TX → entity type + entity ID
  const resolvedEntityType = entityType || polygonTx.extractedEntityType || 'unknown';
  const resolvedEntityId = entityId || polygonTx.extractedEntityId || 'unknown';

  logger.info({
    onChainHash,
    resolvedEntityType,
    resolvedEntityId,
    calldataEntityType: polygonTx.extractedEntityType,
    calldataEntityId: polygonTx.extractedEntityId,
  }, 'DXEXPLORER: extracted data from Polygon calldata');

  // ─── Step 2: Verify on HyperLedger (Multichain) ────────────────
  let multichainTxid: string | null = null;
  let multichainConfirmations: number | null = null;
  try {
    // Look up the private chain record using the entity reference from calldata
    const streamKey = `${resolvedEntityType}:${resolvedEntityId}`;
    const items = await getStreamItemsByKey(streamKey);
    if (items.length > 0) {
      const latestItem = items[items.length - 1];
      multichainTxid = latestItem.txid;
      multichainConfirmations = latestItem.confirmations;

      // Verify the hash on Multichain matches the hash on Polygon
      const multichainHash = (latestItem.data as any)?.hash;
      if (multichainHash && onChainHash && multichainHash !== onChainHash) {
        logger.warn({
          multichainHash,
          onChainHash,
        }, 'DXEXPLORER: Multichain hash does not match Polygon hash!');
      }
    }

    // Also check from the record if it has a multichain_txid
    if (!multichainTxid && currentRecord && (currentRecord as any).multichain_txid) {
      multichainTxid = (currentRecord as any).multichain_txid;
    }
  } catch (err: any) {
    logger.warn({ error: err.message }, 'DXEXPLORER: Multichain verification skipped');
  }

  // ─── Step 3: Fetch off-chain record (if not already provided) ───
  if (!currentRecord && resolvedEntityType !== 'unknown' && resolvedEntityId !== 'unknown') {
    // The entity type + ID were extracted from Polygon calldata
    // Now trace back to the original database record
    const { ANCHORABLE_MODELS } = await import('../services/auto-anchor.js');
    const modelName = ANCHORABLE_MODELS[resolvedEntityType];
    if (modelName) {
      try {
        currentRecord = await (prisma as any)[modelName].findUnique({
          where: { id: resolvedEntityId },
        });
        logger.info({
          resolvedEntityType,
          resolvedEntityId,
          found: !!currentRecord,
        }, 'DXEXPLORER: traced back to database record from Polygon calldata');
      } catch {
        try {
          currentRecord = await (prisma as any)[modelName].findFirst({
            where: { id: resolvedEntityId },
          });
        } catch {
          // Record not found
        }
      }
    }
  }

  // ─── Step 3b: If DB record missing, RECOVER from MultiChain ─────
  let recoveredFromBlockchain = false;
  if (!currentRecord) {
    logger.info({
      resolvedEntityType,
      resolvedEntityId,
    }, 'DXEXPLORER: DB record not found — attempting MultiChain recovery');

    try {
      const streamKey = `${resolvedEntityType}:${resolvedEntityId}`;
      const items = await getStreamItemsByKey(streamKey);
      if (items.length > 0) {
        const latestItem = items[items.length - 1];
        const mcData = latestItem.data as any;

        // Check if full metadata was stored on MultiChain
        if (mcData?.fullMetadata) {
          try {
            const recovered = JSON.parse(
              typeof mcData.fullMetadata === 'string' ? mcData.fullMetadata : JSON.stringify(mcData.fullMetadata)
            );
            currentRecord = recovered.data || recovered;
            recoveredFromBlockchain = true;
            logger.info({
              resolvedEntityType,
              resolvedEntityId,
            }, 'DXEXPLORER: RECOVERED full metadata from MultiChain!');
          } catch {
            logger.warn('DXEXPLORER: Could not parse fullMetadata from MultiChain');
          }
        }
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, 'DXEXPLORER: MultiChain recovery failed');
    }
  }

  if (!currentRecord) {
    return {
      verified: false,
      identifier: polygonTxHash,
      polygonTxHash,
      onChainHash,
      recomputedHash: null,
      entityType: resolvedEntityType,
      entityId: resolvedEntityId,
      metadata: null,
      blockNumber: polygonTx.blockNumber,
      timestamp: polygonTx.timestamp ? new Date(polygonTx.timestamp * 1000).toISOString() : null,
      explorerUrl,
      multichainTxid,
      multichainConfirmations,
      polygonConfirmations: polygonTx.confirmations,
      recoveredFromBlockchain: false,
      error: `Off-chain record not found in DXER backend (${resolvedEntityType}:${resolvedEntityId}). Cannot verify integrity — record may have been deleted. MultiChain recovery also found no full metadata.`,
    };
  }

  // ─── Step 4: Recompute hash from current off-chain metadata ─────
  let recomputedHash: string;
  if (recoveredFromBlockchain) {
    // When recovered from MultiChain, the metadata IS the canonical form
    // We need to hash the canonical metadata string, not reconstruct from record
    // Try to reconstruct canonical metadata from recovered data
    const recomputedMetadata = buildCanonicalMetadata(currentRecord, resolvedEntityType, resolvedEntityId);
    recomputedHash = createHash('sha256').update(recomputedMetadata).digest('hex');
  } else {
    const recomputedMetadata = buildCanonicalMetadata(currentRecord, resolvedEntityType, resolvedEntityId);
    recomputedHash = createHash('sha256').update(recomputedMetadata).digest('hex');
  }

  // ─── Step 5: Compare — this is the moment of truth ──────────────
  const verified = onChainHash !== null && recomputedHash === onChainHash;

  logger.info({
    verified,
    onChainHash,
    recomputedHash,
    match: verified,
    entityType: resolvedEntityType,
    entityId: resolvedEntityId,
    polygonConfirmations: polygonTx.confirmations,
    multichainConfirmations,
    recoveredFromBlockchain,
  }, 'DXEXPLORER: verification complete');

  return {
    verified,
    identifier: polygonTxHash,
    polygonTxHash,
    onChainHash,
    recomputedHash,
    entityType: resolvedEntityType,
    entityId: resolvedEntityId,
    metadata: currentRecord as Record<string, unknown>,
    blockNumber: polygonTx.blockNumber,
    timestamp: polygonTx.timestamp ? new Date(polygonTx.timestamp * 1000).toISOString() : null,
    explorerUrl,
    multichainTxid,
    multichainConfirmations,
    polygonConfirmations: polygonTx.confirmations,
    recoveredFromBlockchain,
    error: verified
      ? undefined
      : 'INTEGRITY FAILURE: Recomputed hash does not match on-chain hash. Data may have been tampered with after anchoring.',
  };
}

// ─── Health Check ─────────────────────────────────────────────────

export async function chainsHealthCheck(): Promise<{
  multichain: { connected: boolean; chainName: string; blocks: number };
  polygon: { connected: boolean; network: string; blockNumber: number; balance: string; walletAddress: string };
}> {
  const [mc, pg] = await Promise.all([
    multichainHealthCheck(),
    polygonHealthCheck(),
  ]);
  return { multichain: mc, polygon: pg };
}

// ─── Legacy compatibility ─────────────────────────────────────────

export function buildAnchorPayload(record: Record<string, unknown>): AnchorPayload {
  const metadata = buildCanonicalMetadata(
    record,
    (record.entityType as string) || 'unknown',
    (record.id as string) || 'unknown',
  );
  return {
    entityType: (record.entityType as string) || 'unknown',
    entityId: (record.id as string) || 'unknown',
    dataHash: createHash('sha256').update(metadata).digest('hex'),
    timestamp: new Date().toISOString(),
  };
}

export async function submitAnchor(payload: AnchorPayload): Promise<AnchorResult> {
  const result = await anchorRecord(
    { id: payload.entityId, entityType: payload.entityType },
    payload.entityType,
    payload.entityId,
  );
  return {
    multichainDataHex: result.multichainDataHex,
    multichainTxid: result.multichainTxid,
    polygonTxhash: result.polygonTxhash,
  };
}

export async function verifyAnchor(txid: string): Promise<AnchorVerification> {
  // Check if it's a Polygon TX hash
  if (txid.startsWith('0x') && txid.length === 66) {
    const polygonTx = await getPolygonTransaction(txid);
    return {
      txid,
      status: polygonTx ? 'confirmed' : 'not_found',
      confirmations: polygonTx?.confirmations || 0,
      timestamp: polygonTx?.timestamp
        ? new Date(polygonTx.timestamp * 1000).toISOString()
        : null,
    };
  }

  // Otherwise check Multichain
  try {
    const { getTransaction } = await import('../lib/multichain.js');
    const mcTx = await getTransaction(txid);
    return {
      txid,
      status: mcTx ? 'confirmed' : 'not_found',
      confirmations: mcTx?.confirmations || 0,
      timestamp: mcTx?.blocktime
        ? new Date(mcTx.blocktime * 1000).toISOString()
        : null,
    };
  } catch {
    return {
      txid,
      status: 'not_found',
      confirmations: 0,
      timestamp: null,
    };
  }
}
