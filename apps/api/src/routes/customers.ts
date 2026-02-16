import { Router, Request, Response, NextFunction } from 'express';
import { createCustomerSchema, updateCustomerSchema, paginationSchema } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { NotFoundError } from '../lib/errors.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';

export const customerRoutes = Router();
customerRoutes.use(authenticate, resolveOrg);

// GET /api/customers
customerRoutes.get('/', requireRole('viewer'), validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const q = (req as any).validatedQuery;

      const where: any = { org_id: authReq.orgId! };
      if (q.search) where.name = { contains: q.search, mode: 'insensitive' };

      const [total, customers] = await Promise.all([
        prisma.customers.count({ where }),
        prisma.customers.findMany({
          where,
          orderBy: { created_at: q.sortOrder },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);

      res.json({
        success: true,
        data: customers.map((c) => ({
          id: c.id, name: c.name, email: c.email, phone: c.phone,
          address: c.address, taxId: c.tax_id,
          createdAt: c.created_at.toISOString(),
          multichainTxid: c.multichain_txid,
          polygonTxhash: c.polygon_txhash,
        })),
        pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
      });
    } catch (err) { next(err); }
  }
);

// POST /api/customers
customerRoutes.post('/', requireRole('accountant'), validateBody(createCustomerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const customer = await prisma.customers.create({
        data: { org_id: authReq.orgId!, ...req.body },
      });
      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'create',
        entityType: 'customer',
        entityId: customer.id,
        after: { name: customer.name, email: customer.email },
        ...getClientInfo(req),
      });
      triggerAutoAnchor({ entityType: 'customer', entityId: customer.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'create' });
      res.status(201).json({ success: true, data: { id: customer.id } });
    } catch (err) { next(err); }
  }
);

// PUT /api/customers/:id
customerRoutes.put('/:id', requireRole('accountant'), validateBody(updateCustomerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
      const existing = await prisma.customers.findFirst({
        where: { id, org_id: authReq.orgId! },
      });
      if (!existing) throw new NotFoundError('Customer', id);

      const updated = await prisma.customers.update({
        where: { id },
        data: req.body,
      });
      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'update',
        entityType: 'customer',
        entityId: updated.id,
        before: { name: existing.name, email: existing.email },
        after: { name: updated.name, email: updated.email },
        ...getClientInfo(req),
      });
      triggerAutoAnchor({ entityType: 'customer', entityId: updated.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'update' });
      res.json({ success: true, data: { id: updated.id } });
    } catch (err) { next(err); }
  }
);
