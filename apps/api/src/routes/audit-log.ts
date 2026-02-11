import { Router, Request, Response, NextFunction } from 'express';
import { auditLogFilterSchema } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { Prisma } from '@prisma/client';

export const auditRoutes = Router();
auditRoutes.use(authenticate, resolveOrg);

// Entity type → Prisma model mapping (for fallback anchor lookup)
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
};

// GET /api/audit-log
auditRoutes.get('/', requireRole('viewer'), validateQuery(auditLogFilterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const q = (req as any).validatedQuery;

      const where: Prisma.audit_logWhereInput = { org_id: authReq.orgId! };
      if (q.entityType) where.entity_type = q.entityType;
      if (q.action) where.action = q.action;
      if (q.userId) where.user_id = q.userId;
      if (q.dateFrom || q.dateTo) {
        where.created_at = {};
        if (q.dateFrom) (where.created_at as any).gte = new Date(q.dateFrom);
        if (q.dateTo) (where.created_at as any).lte = new Date(q.dateTo);
      }

      const [total, logs] = await Promise.all([
        prisma.audit_log.count({ where }),
        prisma.audit_log.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);

      // Get profile names for user IDs
      const userIds = [...new Set(logs.map((l) => l.user_id))];
      const profiles = await prisma.profiles.findMany({
        where: { user_id: { in: userIds } },
      });
      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

      // ─── Fallback: for old audit_log entries without their own tx hashes,
      //     look up the entity's anchor status ────────────────────────────
      const needsFallback = logs.filter(
        (l) => !l.polygon_txhash && !l.multichain_txid
      );
      const entityGroups = new Map<string, Set<string>>();
      for (const log of needsFallback) {
        const modelName = entityModels[log.entity_type];
        if (modelName) {
          if (!entityGroups.has(log.entity_type)) {
            entityGroups.set(log.entity_type, new Set());
          }
          entityGroups.get(log.entity_type)!.add(log.entity_id);
        }
      }

      // Batch fetch entity anchor status for fallback
      const entityAnchorMap = new Map<string, { multichain_txid: string | null; polygon_txhash: string | null }>();
      if (entityGroups.size > 0) {
        await Promise.all(
          Array.from(entityGroups.entries()).map(async ([entityType, entityIds]) => {
            const modelName = entityModels[entityType];
            if (!modelName) return;
            try {
              const records = await (prisma as any)[modelName].findMany({
                where: { id: { in: Array.from(entityIds) } },
                select: { id: true, multichain_txid: true, polygon_txhash: true },
              });
              for (const r of records) {
                entityAnchorMap.set(`${entityType}:${r.id}`, {
                  multichain_txid: r.multichain_txid,
                  polygon_txhash: r.polygon_txhash,
                });
              }
            } catch {
              // Model might not have anchor columns — skip
            }
          })
        );
      }

      res.json({
        success: true,
        data: logs.map((l) => {
          // PRIMARY: use audit_log's own anchor fields (unique per action)
          let txid = l.multichain_txid;
          let txhash = l.polygon_txhash;

          // FALLBACK: for old entries, use entity's current anchor
          if (!txid && !txhash) {
            const fallback = entityAnchorMap.get(`${l.entity_type}:${l.entity_id}`);
            if (fallback) {
              txid = fallback.multichain_txid;
              txhash = fallback.polygon_txhash;
            }
          }

          // Determine integrity status
          // - 'anchored': this specific action has its own blockchain proof
          // - 'pending': not yet on blockchain
          // Full verification (verified/tampered) happens in DXEXPLORER
          const integrityStatus = (txid && txhash) ? 'anchored' : 'pending';

          return {
            id: l.id,
            userId: l.user_id,
            userName: profileMap.get(l.user_id)?.full_name || 'Unknown',
            action: l.action,
            entityType: l.entity_type,
            entityId: l.entity_id,
            before: l.before_data,
            after: l.after_data,
            ipAddress: l.ip_address,
            // Per-action unique blockchain references
            multichainTxid: txid ?? null,
            polygonTxhash: txhash ?? null,
            // Version chain fields
            version: l.version || 1,
            previousHash: l.previous_hash,
            previousPolygonTx: l.previous_polygon_tx,
            changedFields: l.changed_fields || [],
            // Status
            integrityStatus,
            createdAt: l.created_at.toISOString(),
          };
        }),
        pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
      });
    } catch (err) { next(err); }
  }
);
