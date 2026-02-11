import { Router, Request, Response, NextFunction } from 'express';
import { anchorRecordsSchema } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import {
  anchorRecord,
  dxExplorerVerify,
  verifyAnchor,
  chainsHealthCheck,
} from '../services/anchoring.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { getQueueStatus } from '../services/auto-anchor.js';

export const anchorRoutes = Router();

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK (no auth required)
// ═══════════════════════════════════════════════════════════════

// GET /api/anchoring/health - Check Multichain + Polygon connectivity
anchorRoutes.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await chainsHealthCheck();
    res.json({ success: true, data: health });
  } catch (err) { next(err); }
});

// Entity type to Prisma model mapping — EVERY anchorable entity
const entityModels: Record<string, string> = {
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

// GET /api/anchoring/queue - Auto-anchor queue status
anchorRoutes.get('/queue', async (_req: Request, res: Response) => {
  const status = getQueueStatus();
  res.json({ success: true, data: status });
});

// ═══════════════════════════════════════════════════════════════
// ANCHORING ENDPOINTS (require auth + org)
// ═══════════════════════════════════════════════════════════════

// POST /api/anchoring/anchor - Anchor selected records (admin only)
// Full pipeline: Metadata → HyperLedger Hash → Polygon Anchor
anchorRoutes.post('/anchor',
  authenticate, resolveOrg, requireRole('admin'),
  validateBody(anchorRecordsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { entityType, entityIds } = req.body;

      const modelName = entityModels[entityType];
      if (!modelName) {
        throw new AppError(400, 'INVALID_ENTITY_TYPE', `Entity type ${entityType} is not anchorable`);
      }

      const results = [];

      for (const entityId of entityIds) {
        // Step 1: Retrieve record from DXER backend
        const record = await (prisma as any)[modelName].findFirst({
          where: { id: entityId, org_id: authReq.orgId! },
        });

        if (!record) {
          results.push({ entityId, status: 'error', error: 'Not found' });
          continue;
        }

        // Guard: skip records already anchored on both chains
        if (record.polygon_txhash && record.multichain_txid) {
          results.push({
            entityId,
            status: 'already_anchored',
            polygonTxHash: record.polygon_txhash,
            multichainTxid: record.multichain_txid,
          });
          continue;
        }

        // Step 2-3: Full anchor pipeline (metadata → HyperLedger → Polygon)
        const anchorResult = await anchorRecord(
          { ...record },
          entityType,
          entityId,
        );

        // Step 4: Persist anchor references back to the record
        await (prisma as any)[modelName].update({
          where: { id: entityId },
          data: {
            multichain_data_hex: anchorResult.multichainDataHex,
            multichain_txid: anchorResult.multichainTxid,
            polygon_txhash: anchorResult.polygonTxhash,
          },
        });

        // Store anchor job for audit trail
        await prisma.dxer_anchor_jobs.create({
          data: {
            org_id: authReq.orgId!,
            entity_type: entityType,
            entity_id: entityId,
            status: 'completed',
            payload: {
              metadata: anchorResult.metadata,
              multichainTxid: anchorResult.multichainTxid,
            },
            result: {
              polygonTxHash: anchorResult.polygonTxhash,
              multichainDataHex: anchorResult.multichainDataHex,
              blockNumber: anchorResult.blockNumber,
              explorerUrl: anchorResult.explorerUrl,
            },
          },
        });

        await writeAuditLog({
          orgId: authReq.orgId!,
          userId: authReq.userId,
          action: 'update',
          entityType,
          entityId,
          before: { polygon_txhash: null },
          after: {
            polygon_txhash: anchorResult.polygonTxhash,
            multichain_txid: anchorResult.multichainTxid,
          },
          ...getClientInfo(req),
        });

        results.push({
          entityId,
          status: 'anchored',
          polygonTxHash: anchorResult.polygonTxhash,
          multichainDataHex: anchorResult.multichainDataHex,
          multichainTxid: anchorResult.multichainTxid,
          blockNumber: anchorResult.blockNumber,
          explorerUrl: anchorResult.explorerUrl,
        });
      }

      res.json({ success: true, data: { results } });
    } catch (err) { next(err); }
  }
);

// GET /api/anchoring/verify/:txid - Quick on-chain verification
anchorRoutes.get('/verify/:txid',
  authenticate, resolveOrg, requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const verification = await verifyAnchor(req.params.txid);
      res.json({ success: true, data: verification });
    } catch (err) { next(err); }
  }
);

// GET /api/anchoring/jobs - List anchor jobs
anchorRoutes.get('/jobs',
  authenticate, resolveOrg, requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const jobs = await prisma.dxer_anchor_jobs.findMany({
        where: { org_id: authReq.orgId! },
        orderBy: { created_at: 'desc' },
        take: 50,
      });

      res.json({
        success: true,
        data: jobs.map((j) => ({
          id: j.id,
          entityType: j.entity_type,
          entityId: j.entity_id,
          status: j.status,
          payload: j.payload,
          result: j.result,
          createdAt: j.created_at.toISOString(),
        })),
      });
    } catch (err) { next(err); }
  }
);

// ═══════════════════════════════════════════════════════════════
// DXEXPLORER ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ─── POST /api/anchoring/dxexplorer/verify ────────────────────────
//
// DXEXPLORER verification — matches the diagram exactly:
//
//   Input: Polygon TX hash (e.g. 0x11asdf4sadfsdf4s)
//          OR entityType + entityId
//
//   Flow:
//     1. Fetch Polygon TX → extract hash + entity reference from calldata
//     2. Trace to HyperLedger → confirm hash on private chain
//     3. Trace to DXER database → fetch original {METADATA}
//     4. Recompute hash from current metadata
//     5. Compare → verified or tampered
//
//   Output: { verified, onChainHash, recomputedHash, metadata, ... }
//
// Every hash is deterministic. Every hash can be traced back.
// ───────────────────────────────────────────────────────────────────
anchorRoutes.post('/dxexplorer/verify',
  authenticate, resolveOrg, requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { polygonTxHash, entityType, entityId } = req.body;

      if (!polygonTxHash && !(entityType && entityId)) {
        throw new AppError(400, 'MISSING_PARAMS', 'Provide either polygonTxHash or (entityType + entityId)');
      }

      let txHash = polygonTxHash;
      let record: Record<string, unknown> | null = null;

      // ─── Path A: Start from entityType + entityId ───────────────
      // Look up the record → get its polygon TX hash → then verify on-chain
      if (entityType && entityId) {
        const modelName = entityModels[entityType];
        if (!modelName) {
          throw new AppError(400, 'INVALID_ENTITY_TYPE', `Unknown entity type: ${entityType}`);
        }

        record = await (prisma as any)[modelName].findFirst({
          where: { id: entityId, org_id: authReq.orgId! },
        });

        if (record && (record as any).polygon_txhash) {
          txHash = (record as any).polygon_txhash;
        }
      }

      // ─── Path B: Start from Polygon TX hash ────────────────────
      // The calldata contains the hash + entity reference
      // dxExplorerVerify() will extract entity info from calldata
      // and auto-lookup the record from the database
      // No need to manually search anchor_jobs — it's all in the calldata

      if (!txHash) {
        res.json({
          success: true,
          data: {
            verified: false,
            identifier: entityId || 'unknown',
            polygonTxHash: null,
            onChainHash: null,
            recomputedHash: null,
            entityType: entityType || null,
            entityId: entityId || null,
            metadata: null,
            blockNumber: null,
            timestamp: null,
            error: 'No Polygon transaction hash found. Record may not be anchored yet.',
          },
        });
        return;
      }

      // Run the full DXEXPLORER verification flow
      // dxExplorerVerify handles:
      //   - Extracting hash + entity info from Polygon calldata
      //   - Auto-looking up the record from DB if not provided
      //   - Verifying on Multichain (HyperLedger)
      //   - Recomputing hash and comparing
      const result = await dxExplorerVerify(
        txHash,
        record,
        entityType || '',
        entityId || '',
      );

      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
);

// GET /api/anchoring/recover/:entityType/:entityId - Recover data from MultiChain
// When the Supabase DB record is missing, this endpoint pulls the full metadata
// from the MultiChain private blockchain — the decentralized backup.
anchorRoutes.get('/recover/:entityType/:entityId',
  authenticate, resolveOrg, requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityType, entityId } = req.params;
      const { getStreamItemsByKey } = await import('../lib/multichain.js');

      const streamKey = `${entityType}:${entityId}`;
      const items = await getStreamItemsByKey(streamKey);

      if (items.length === 0) {
        throw new AppError(404, 'NOT_FOUND', `No blockchain records found for ${entityType}:${entityId}`);
      }

      // Return all versions (the full history from MultiChain)
      const versions = items.map((item, index) => {
        const data = item.data as any;
        let fullMetadata: any = null;
        if (data?.fullMetadata) {
          try {
            fullMetadata = typeof data.fullMetadata === 'string'
              ? JSON.parse(data.fullMetadata)
              : data.fullMetadata;
          } catch { /* ignore parse errors */ }
        }

        return {
          version: index + 1,
          hash: data?.hash || null,
          multichainTxid: item.txid,
          blocktime: item.blocktime ? new Date(item.blocktime * 1000).toISOString() : null,
          confirmations: item.confirmations,
          fullMetadata,
          entityType: data?.entityType || entityType,
          entityId: data?.entityId || entityId,
        };
      });

      res.json({
        success: true,
        data: {
          entityType,
          entityId,
          totalVersions: versions.length,
          versions,
          recoveredFromBlockchain: true,
        },
      });
    } catch (err) { next(err); }
  }
);

// GET /api/anchoring/dxexplorer/lookup/:identifier - Lookup by any identifier
// Searches anchor jobs by polygon tx hash, entity ID, or ledger ID
anchorRoutes.get('/dxexplorer/lookup/:identifier',
  authenticate, resolveOrg, requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { identifier } = req.params;

      // Search by polygon tx hash in results
      let jobs = await prisma.dxer_anchor_jobs.findMany({
        where: {
          org_id: authReq.orgId!,
          OR: [
            { entity_id: identifier },
            { result: { path: ['polygonTxHash'], string_contains: identifier } },
          ],
        },
        orderBy: { created_at: 'desc' },
        take: 10,
      });

      // Also look for records with matching polygon_txhash across entity tables
      const matchingRecords: any[] = [];

      for (const [eType, modelName] of Object.entries(entityModels)) {
        try {
          const records = await (prisma as any)[modelName].findMany({
            where: {
              org_id: authReq.orgId!,
              OR: [
                { id: identifier },
                { polygon_txhash: identifier },
                { multichain_txid: identifier },
              ],
            },
            take: 5,
          });

          for (const r of records) {
            matchingRecords.push({
              entityType: eType,
              entityId: r.id,
              polygonTxHash: r.polygon_txhash,
              multichainTxId: r.multichain_txid,
              multichainDataHex: r.multichain_data_hex,
            });
          }
        } catch {
          // Skip if OR clause fails (e.g., column doesn't support the query)
        }
      }

      res.json({
        success: true,
        data: {
          identifier,
          anchorJobs: jobs.map((j) => ({
            id: j.id,
            entityType: j.entity_type,
            entityId: j.entity_id,
            status: j.status,
            payload: j.payload,
            result: j.result,
            createdAt: j.created_at.toISOString(),
          })),
          matchingRecords,
        },
      });
    } catch (err) { next(err); }
  }
);
