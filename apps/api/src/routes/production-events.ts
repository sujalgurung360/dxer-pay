import { Router, Request, Response, NextFunction } from 'express';
import { createProductionEventSchema } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError } from '../lib/errors.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';

export const productionEventRoutes = Router();
productionEventRoutes.use(authenticate, resolveOrg);

// POST /api/production-events
productionEventRoutes.post('/', requireRole('accountant'), validateBody(createProductionEventSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = req.body;

      // Verify batch belongs to org
      const batch = await prisma.production_batches.findFirst({
        where: { id: data.batchId, org_id: authReq.orgId! },
      });
      if (!batch) throw new NotFoundError('Production Batch', data.batchId);

      const event = await prisma.production_events.create({
        data: {
          org_id: authReq.orgId!,
          batch_id: data.batchId,
          created_by: authReq.userId,
          event_type: data.eventType,
          description: data.description,
          metadata: data.metadata,
        },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'create',
        entityType: 'production_event',
        entityId: event.id,
        after: { batchId: data.batchId, eventType: data.eventType },
        ...getClientInfo(req),
      });

      triggerAutoAnchor({ entityType: 'production_event', entityId: event.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'create' });

      res.status(201).json({ success: true, data: { id: event.id } });
    } catch (err) { next(err); }
  }
);

// GET /api/production-events?batchId=xxx
productionEventRoutes.get('/', requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { batchId } = req.query;

      const where: any = { org_id: authReq.orgId! };
      if (batchId) where.batch_id = batchId;

      const events = await prisma.production_events.findMany({
        where,
        orderBy: { created_at: 'asc' },
      });

      res.json({
        success: true,
        data: events.map((e) => ({
          id: e.id,
          batchId: e.batch_id,
          eventType: e.event_type,
          description: e.description,
          metadata: e.metadata,
          createdBy: e.created_by,
          createdAt: e.created_at.toISOString(),
          multichainTxid: e.multichain_txid,
          polygonTxhash: e.polygon_txhash,
        })),
      });
    } catch (err) { next(err); }
  }
);
