import { Router, Request, Response, NextFunction } from 'express';
import { createExpenseSchema, updateExpenseSchema, expenseFilterSchema } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';
import { Prisma } from '@prisma/client';

export const expenseRoutes = Router();
expenseRoutes.use(authenticate, resolveOrg);

// GET /api/expenses
expenseRoutes.get('/', requireRole('viewer'), validateQuery(expenseFilterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const q = (req as any).validatedQuery;

      const where: Prisma.expensesWhereInput = { org_id: authReq.orgId! };
      if (q.status) where.status = q.status;
      if (q.category) where.category = q.category;
      if (q.search) where.description = { contains: q.search, mode: 'insensitive' };
      if (q.dateFrom || q.dateTo) {
        where.date = {};
        if (q.dateFrom) (where.date as any).gte = new Date(q.dateFrom);
        if (q.dateTo) (where.date as any).lte = new Date(q.dateTo);
      }
      if (q.minAmount || q.maxAmount) {
        where.amount = {};
        if (q.minAmount) (where.amount as any).gte = q.minAmount;
        if (q.maxAmount) (where.amount as any).lte = q.maxAmount;
      }

      const [total, expenses] = await Promise.all([
        prisma.expenses.count({ where }),
        prisma.expenses.findMany({
          where,
          orderBy: { [q.sortBy || 'created_at']: q.sortOrder },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);

      res.json({
        success: true,
        data: expenses.map((e) => ({
          id: e.id,
          description: e.description,
          amount: Number(e.amount),
          currency: e.currency,
          category: e.category,
          status: e.status,
          date: e.date.toISOString().split('T')[0],
          tags: e.tags,
          notes: e.notes,
          receiptUrl: e.receipt_url,
          productionBatchId: e.production_batch_id,
          multichainTxid: e.multichain_txid,
          polygonTxhash: e.polygon_txhash,
          createdBy: e.created_by,
          createdAt: e.created_at.toISOString(),
          updatedAt: e.updated_at.toISOString(),
        })),
        pagination: {
          page: q.page,
          pageSize: q.pageSize,
          total,
          totalPages: Math.ceil(total / q.pageSize),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/expenses/export - Export CSV
expenseRoutes.get('/export', requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const expenses = await prisma.expenses.findMany({
        where: { org_id: authReq.orgId! },
        orderBy: { date: 'desc' },
      });

      const csv = [
        'ID,Date,Description,Amount,Currency,Category,Status,Tags,Notes',
        ...expenses.map((e) =>
          `${e.id},${e.date.toISOString().split('T')[0]},"${e.description}",${e.amount},${e.currency},${e.category},${e.status},"${e.tags.join(';')}","${e.notes || ''}"`
        ),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/expenses/:id
expenseRoutes.get('/:id', requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const expense = await prisma.expenses.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
      });

      if (!expense) throw new NotFoundError('Expense', req.params.id);

      res.json({
        success: true,
        data: {
          id: expense.id,
          description: expense.description,
          amount: Number(expense.amount),
          currency: expense.currency,
          category: expense.category,
          status: expense.status,
          date: expense.date.toISOString().split('T')[0],
          tags: expense.tags,
          notes: expense.notes,
          receiptUrl: expense.receipt_url,
          productionBatchId: expense.production_batch_id,
          multichainDataHex: expense.multichain_data_hex,
          multichainTxid: expense.multichain_txid,
          polygonTxhash: expense.polygon_txhash,
          createdBy: expense.created_by,
          createdAt: expense.created_at.toISOString(),
          updatedAt: expense.updated_at.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/expenses
expenseRoutes.post('/', requireRole('viewer'), validateBody(createExpenseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = req.body;

      const expense = await prisma.expenses.create({
        data: {
          org_id: authReq.orgId!,
          created_by: authReq.userId,
          description: data.description,
          amount: data.amount,
          currency: data.currency,
          category: data.category,
          date: new Date(data.date),
          tags: data.tags || [],
          notes: data.notes,
          production_batch_id: data.productionBatchId,
        },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'create',
        entityType: 'expense',
        entityId: expense.id,
        after: data,
        ...getClientInfo(req),
      });

      // Auto-anchor: expense creation becomes a signed blockchain event
      triggerAutoAnchor({ entityType: 'expense', entityId: expense.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'create' });

      res.status(201).json({
        success: true,
        data: { id: expense.id },
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/expenses/:id
expenseRoutes.put('/:id', requireRole('accountant'), validateBody(updateExpenseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const existing = await prisma.expenses.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
      });

      if (!existing) throw new NotFoundError('Expense', req.params.id);
      if (existing.status === 'voided') throw new ForbiddenError('Cannot edit a voided expense');

      const data = req.body;
      const updateData: any = {};
      if (data.description !== undefined) updateData.description = data.description;
      if (data.amount !== undefined) updateData.amount = data.amount;
      if (data.currency !== undefined) updateData.currency = data.currency;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.date !== undefined) updateData.date = new Date(data.date);
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.productionBatchId !== undefined) updateData.production_batch_id = data.productionBatchId;

      const updated = await prisma.expenses.update({
        where: { id: req.params.id },
        data: updateData,
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'update',
        entityType: 'expense',
        entityId: req.params.id,
        before: { amount: Number(existing.amount), description: existing.description },
        after: data,
        ...getClientInfo(req),
      });

      // Auto-anchor: expense update becomes a signed blockchain event
      triggerAutoAnchor({ entityType: 'expense', entityId: updated.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'update' });

      res.json({ success: true, data: { id: updated.id } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/expenses/:id/void
expenseRoutes.post('/:id/void', requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const existing = await prisma.expenses.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
      });

      if (!existing) throw new NotFoundError('Expense', req.params.id);
      if (existing.status === 'voided') throw new ForbiddenError('Expense already voided');

      await prisma.expenses.update({
        where: { id: req.params.id },
        data: { status: 'voided' },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'void',
        entityType: 'expense',
        entityId: req.params.id,
        before: { status: existing.status },
        after: { status: 'voided' },
        ...getClientInfo(req),
      });

      // Auto-anchor: voiding becomes a signed blockchain event
      triggerAutoAnchor({ entityType: 'expense', entityId: req.params.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'void' });

      res.json({ success: true, data: { id: req.params.id, status: 'voided' } });
    } catch (err) {
      next(err);
    }
  }
);
