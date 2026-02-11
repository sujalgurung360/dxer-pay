import { Router, Request, Response, NextFunction } from 'express';
import { createBatchSchema, updateBatchSchema, batchFilterSchema } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { NotFoundError } from '../lib/errors.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';
import { Prisma } from '@prisma/client';

export const batchRoutes = Router();
batchRoutes.use(authenticate, resolveOrg);

// GET /api/production-batches
batchRoutes.get('/', requireRole('viewer'), validateQuery(batchFilterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const q = (req as any).validatedQuery;

      const where: Prisma.production_batchesWhereInput = { org_id: authReq.orgId! };
      if (q.status) where.status = q.status;
      if (q.search) where.name = { contains: q.search, mode: 'insensitive' };

      const [total, batches] = await Promise.all([
        prisma.production_batches.count({ where }),
        prisma.production_batches.findMany({
          where,
          include: { _count: { select: { events: true, expenses: true } } },
          orderBy: { created_at: q.sortOrder },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);

      res.json({
        success: true,
        data: batches.map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          status: b.status,
          plannedStartDate: b.planned_start_date?.toISOString().split('T')[0] || null,
          plannedEndDate: b.planned_end_date?.toISOString().split('T')[0] || null,
          actualStartDate: b.actual_start_date?.toISOString().split('T')[0] || null,
          actualEndDate: b.actual_end_date?.toISOString().split('T')[0] || null,
          eventCount: b._count.events,
          expenseCount: b._count.expenses,
          multichainTxid: b.multichain_txid,
          polygonTxhash: b.polygon_txhash,
          createdAt: b.created_at.toISOString(),
        })),
        pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
      });
    } catch (err) { next(err); }
  }
);

// GET /api/production-batches/:id
batchRoutes.get('/:id', requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const batch = await prisma.production_batches.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
        include: {
          events: { orderBy: { created_at: 'asc' } },
          expenses: { orderBy: { created_at: 'desc' } },
        },
      });

      if (!batch) throw new NotFoundError('Production Batch', req.params.id);

      res.json({
        success: true,
        data: {
          id: batch.id,
          name: batch.name,
          description: batch.description,
          status: batch.status,
          plannedStartDate: batch.planned_start_date?.toISOString().split('T')[0] || null,
          plannedEndDate: batch.planned_end_date?.toISOString().split('T')[0] || null,
          actualStartDate: batch.actual_start_date?.toISOString().split('T')[0] || null,
          actualEndDate: batch.actual_end_date?.toISOString().split('T')[0] || null,
          multichainDataHex: batch.multichain_data_hex,
          multichainTxid: batch.multichain_txid,
          polygonTxhash: batch.polygon_txhash,
          events: batch.events.map((e) => ({
            id: e.id,
            eventType: e.event_type,
            description: e.description,
            metadata: e.metadata,
            createdAt: e.created_at.toISOString(),
          })),
          expenses: batch.expenses.map((e) => ({
            id: e.id,
            description: e.description,
            amount: Number(e.amount),
            category: e.category,
            date: e.date.toISOString().split('T')[0],
          })),
          createdAt: batch.created_at.toISOString(),
        },
      });
    } catch (err) { next(err); }
  }
);

// POST /api/production-batches
batchRoutes.post('/', requireRole('accountant'), validateBody(createBatchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = req.body;

      const batch = await prisma.production_batches.create({
        data: {
          org_id: authReq.orgId!,
          created_by: authReq.userId,
          name: data.name,
          description: data.description,
          planned_start_date: data.plannedStartDate ? new Date(data.plannedStartDate) : null,
          planned_end_date: data.plannedEndDate ? new Date(data.plannedEndDate) : null,
        },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'create',
        entityType: 'production_batch',
        entityId: batch.id,
        after: data,
        ...getClientInfo(req),
      });

      triggerAutoAnchor({ entityType: 'production_batch', entityId: batch.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'create' });

      res.status(201).json({ success: true, data: { id: batch.id } });
    } catch (err) { next(err); }
  }
);

// PUT /api/production-batches/:id
batchRoutes.put('/:id', requireRole('accountant'), validateBody(updateBatchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const existing = await prisma.production_batches.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
      });
      if (!existing) throw new NotFoundError('Production Batch', req.params.id);

      const data = req.body;
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.status !== undefined) {
        updateData.status = data.status;
        if (data.status === 'in_progress' && !existing.actual_start_date) {
          updateData.actual_start_date = new Date();
        }
        if (data.status === 'completed') {
          updateData.actual_end_date = new Date();
        }
      }

      await prisma.production_batches.update({
        where: { id: req.params.id },
        data: updateData,
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'update',
        entityType: 'production_batch',
        entityId: req.params.id,
        before: { status: existing.status, name: existing.name },
        after: data,
        ...getClientInfo(req),
      });

      triggerAutoAnchor({ entityType: 'production_batch', entityId: req.params.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'update' });

      res.json({ success: true, data: { id: req.params.id } });
    } catch (err) { next(err); }
  }
);
