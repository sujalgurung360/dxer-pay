import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { anchorRecord, buildCanonicalMetadata, enrichPayrollEntryMetadata } from './anchoring.js';
import { writeAuditLog } from './audit.js';
import { decryptPrivateKey } from '../lib/wallet-crypto.js';

/**
 * ═══════════════════════════════════════════════════════════════
 * DXER Auto-Anchor Queue
 * ═══════════════════════════════════════════════════════════════
 *
 * Every meaningful business action automatically gets:
 *   1. A deterministic metadata snapshot
 *   2. A Multichain hash (private ledger)
 *   3. A Polygon anchor (public immutability)
 *
 * The queue is non-blocking: API responses return immediately,
 * anchoring happens in the background. Records are updated with
 * blockchain references as they are processed.
 *
 * DXER Principle:
 *   Database = working state
 *   Private blockchain = hash generation + sequencing
 *   Public blockchain = immutable proof
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Entity → Prisma model mapping ───────────────────────────────
// Every entity that can be anchored
export const ANCHORABLE_MODELS: Record<string, string> = {
  expense: 'expenses',
  invoice: 'invoices',
  payroll: 'payrolls',
  production_batch: 'production_batches',
  production_event: 'production_events',
  employee: 'employees',
  customer: 'customers',
  organization_member: 'organization_members',
  payroll_entry: 'payroll_entries',
  audit_log: 'audit_log',
};

// ─── Queue types ──────────────────────────────────────────────────

interface AnchorJob {
  entityType: string;
  entityId: string;
  orgId: string;
  userId: string;
  action: string; // create, update, void, status_change, etc.
  timestamp: number;
  retries: number;
}

// ─── In-memory queue ──────────────────────────────────────────────
const queue: AnchorJob[] = [];
let processing = false;
let totalProcessed = 0;
let totalFailed = 0;

/**
 * Enqueue a record for automatic blockchain anchoring.
 * This is fire-and-forget — the caller doesn't wait.
 */
export function enqueueAnchor(params: {
  entityType: string;
  entityId: string;
  orgId: string;
  userId: string;
  action: string;
}): void {
  const job: AnchorJob = {
    ...params,
    timestamp: Date.now(),
    retries: 0,
  };

  queue.push(job);

  logger.info({
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    queueLength: queue.length,
  }, 'Auto-anchor: job enqueued');

  // Start processing if not already running
  if (!processing) {
    processQueue();
  }
}

/**
 * Process the anchor queue sequentially.
 * Each job goes through the full pipeline: DB → Multichain → Polygon.
 */
async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const job = queue.shift()!;

    try {
      await processJob(job);
      totalProcessed++;
    } catch (err: any) {
      totalFailed++;
      logger.error({
        entityType: job.entityType,
        entityId: job.entityId,
        error: err.message,
        retries: job.retries,
      }, 'Auto-anchor: job failed');

      // Retry up to 3 times with backoff
      if (job.retries < 3) {
        job.retries++;
        queue.push(job); // Re-enqueue at end
        // Brief delay before retrying
        await new Promise((r) => setTimeout(r, 2000 * job.retries));
      } else {
        // Record permanent failure in dxer_anchor_jobs
        try {
          await prisma.dxer_anchor_jobs.create({
            data: {
              org_id: job.orgId,
              entity_type: job.entityType,
              entity_id: job.entityId,
              status: 'failed',
              error: err.message,
              payload: { action: job.action, timestamp: new Date(job.timestamp).toISOString() },
            },
          });
        } catch {
          // Best effort
        }
      }
    }
  }

  processing = false;
}

/**
 * Process a single anchor job.
 * Uses org-specific wallet for Polygon TXs and implements version chain.
 */
async function processJob(job: AnchorJob): Promise<void> {
  const modelName = ANCHORABLE_MODELS[job.entityType];
  if (!modelName) {
    logger.warn({ entityType: job.entityType }, 'Auto-anchor: unknown entity type, skipping');
    return;
  }

  logger.info({
    entityType: job.entityType,
    entityId: job.entityId,
    action: job.action,
  }, 'Auto-anchor: processing');

  // Step 1: Fetch current record from DB
  let record: any;
  try {
    record = await (prisma as any)[modelName].findUnique({
      where: { id: job.entityId },
    });
  } catch {
    record = await (prisma as any)[modelName].findFirst({
      where: { id: job.entityId },
    });
  }

  if (!record) {
    logger.warn({ entityType: job.entityType, entityId: job.entityId }, 'Auto-anchor: record not found');
    return;
  }

  // Guard: skip if already anchored (prevents double-spend on re-queued jobs)
  if (record.polygon_txhash && record.multichain_txid && job.action === 'create') {
    logger.info({ entityType: job.entityType, entityId: job.entityId }, 'Auto-anchor: already anchored, skipping');
    return;
  }

  // Step 1b: Get org's private key for per-org Polygon signing
  let orgPrivateKey: string | undefined;
  try {
    const org = await prisma.organizations.findUnique({
      where: { id: job.orgId },
      select: { wallet_private_key_enc: true, wallet_address: true },
    });
    if (org?.wallet_private_key_enc) {
      orgPrivateKey = decryptPrivateKey(org.wallet_private_key_enc);
      logger.info({
        orgId: job.orgId,
        orgWallet: org.wallet_address,
      }, 'Auto-anchor: using org-specific Polygon wallet');
    }
  } catch (err: any) {
    logger.warn({
      orgId: job.orgId,
      error: err.message,
    }, 'Auto-anchor: could not decrypt org wallet, falling back to master');
  }

  // Step 2: Enrich record for dual-address anchoring (payroll entries)
  let enrichedRecord = { ...record };
  if (job.entityType === 'payroll_entry') {
    try {
      enrichedRecord = await enrichPayrollEntryMetadata(enrichedRecord) as any;
      logger.info({
        entityType: job.entityType,
        entityId: job.entityId,
        hasEmployeeWallet: !!enrichedRecord.employee_wallet_address,
        hasOrgWallet: !!enrichedRecord.org_wallet_address,
      }, 'Auto-anchor: enriched payroll entry with wallet addresses');
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Auto-anchor: could not enrich payroll entry metadata');
    }
  }

  // Step 2b: Version chain — find previous version for this entity
  let versionInfo: { version: number; previousHash: string | null; previousPolygonTx: string | null; changedFields: string[] } = {
    version: 1,
    previousHash: null,
    previousPolygonTx: null,
    changedFields: [],
  };

  try {
    const previousAudit = await prisma.audit_log.findFirst({
      where: {
        org_id: job.orgId,
        entity_type: job.entityType,
        entity_id: job.entityId,
        polygon_txhash: { not: null },
      },
      orderBy: { created_at: 'desc' },
    });

    if (previousAudit) {
      versionInfo.version = (previousAudit.version || 1) + 1;
      versionInfo.previousHash = previousAudit.multichain_data_hex;
      versionInfo.previousPolygonTx = previousAudit.polygon_txhash;

      // Compute changed fields from before/after data
      if (previousAudit.after_data && typeof previousAudit.after_data === 'object') {
        const afterData = previousAudit.after_data as Record<string, any>;
        versionInfo.changedFields = Object.keys(afterData);
      }
    }
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Auto-anchor: could not fetch version chain info');
  }

  // Step 2c: Add version chain metadata to enriched record
  if (versionInfo.version > 1) {
    enrichedRecord._version = versionInfo.version;
    enrichedRecord._previousHash = versionInfo.previousHash;
    enrichedRecord._previousPolygonTx = versionInfo.previousPolygonTx;
  }

  // Step 3: Run the full anchor pipeline (metadata → Multichain → Polygon)
  // Now uses org-specific wallet for Polygon TXs
  const result = await anchorRecord(
    enrichedRecord,
    job.entityType,
    job.entityId,
    orgPrivateKey,
  );

  // Step 3a: Update the entity record with blockchain references
  try {
    await (prisma as any)[modelName].update({
      where: { id: job.entityId },
      data: {
        multichain_data_hex: result.multichainDataHex,
        multichain_txid: result.multichainTxid,
        polygon_txhash: result.polygonTxhash,
      },
    });
  } catch (err: any) {
    logger.warn({
      entityType: job.entityType,
      error: err.message,
    }, 'Auto-anchor: could not update record with chain refs');
  }

  // Step 3b: Update the corresponding audit_log entry with its OWN unique tx hashes
  // AND version chain fields
  try {
    const unlinkedAuditEntry = await prisma.audit_log.findFirst({
      where: {
        org_id: job.orgId,
        entity_type: job.entityType,
        entity_id: job.entityId,
        polygon_txhash: null,
      },
      orderBy: { created_at: 'desc' },
    });

    if (unlinkedAuditEntry) {
      await prisma.audit_log.update({
        where: { id: unlinkedAuditEntry.id },
        data: {
          multichain_data_hex: result.multichainDataHex,
          multichain_txid: result.multichainTxid,
          polygon_txhash: result.polygonTxhash,
          // Version chain fields
          version: versionInfo.version,
          previous_hash: versionInfo.previousHash,
          previous_polygon_tx: versionInfo.previousPolygonTx,
          changed_fields: versionInfo.changedFields,
        },
      });

      logger.info({
        auditLogId: unlinkedAuditEntry.id,
        entityType: job.entityType,
        entityId: job.entityId,
        polygonTxHash: result.polygonTxhash,
        version: versionInfo.version,
        previousPolygonTx: versionInfo.previousPolygonTx,
      }, 'Auto-anchor: audit_log linked with version chain');
    }
  } catch (err: any) {
    logger.warn({
      entityType: job.entityType,
      error: err.message,
    }, 'Auto-anchor: could not link audit_log entry');
  }

  // Step 4: Record the anchor job
  await prisma.dxer_anchor_jobs.create({
    data: {
      org_id: job.orgId,
      entity_type: job.entityType,
      entity_id: job.entityId,
      status: 'completed',
      payload: {
        action: job.action,
        metadata: result.metadata,
        multichainTxid: result.multichainTxid,
        version: versionInfo.version,
        previousHash: versionInfo.previousHash,
        previousPolygonTx: versionInfo.previousPolygonTx,
      },
      result: {
        polygonTxHash: result.polygonTxhash,
        multichainDataHex: result.multichainDataHex,
        blockNumber: result.blockNumber,
        explorerUrl: result.explorerUrl,
        signerAddress: result.signerAddress,
      },
    },
  });

  logger.info({
    entityType: job.entityType,
    entityId: job.entityId,
    polygonTxHash: result.polygonTxhash,
    explorerUrl: result.explorerUrl,
    version: versionInfo.version,
    signerAddress: result.signerAddress,
  }, 'Auto-anchor: ANCHORED');
}

/**
 * Get queue status.
 */
export function getQueueStatus(): {
  queueLength: number;
  processing: boolean;
  totalProcessed: number;
  totalFailed: number;
} {
  return {
    queueLength: queue.length,
    processing,
    totalProcessed,
    totalFailed,
  };
}
