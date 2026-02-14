import { Router, Request, Response, NextFunction } from 'express';
import { createExpenseSchema, updateExpenseSchema, expenseFilterSchema } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';
import { detectAnomalies } from '../services/anomaly-detection.js';
import { createExpenseJournal } from '../services/auto-journal.js';
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
      if (q.filter === 'needs_review') where.needs_review = true;
      if (q.filter === 'missing_receipts') {
        where.receipt_url = null;
        (where as any).amount = { ...((where as any).amount || {}), gte: 75 };
      }
      if (q.filter === 'uncategorized') where.category = 'other';

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
          flags: (e as any).flags ?? null,
          needsReview: (e as any).needs_review ?? false,
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
          flags: (expense as any).flags ?? null,
          needsReview: (expense as any).needs_review ?? false,
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

      const createData: any = {
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
        receipt_url: data.receiptUrl,
      };
      if (data.status) createData.status = data.status;
      const expense = await prisma.expenses.create({ data: createData });

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

      // Anomaly detection
      let anomalies: any[] = [];
      try {
        anomalies = await detectAnomalies({
          id: expense.id,
          description: data.description,
          amount: data.amount,
          date: new Date(data.date),
          orgId: authReq.orgId!,
          notes: data.notes,
          receipt_url: data.receiptUrl ?? expense.receipt_url,
        });
        if (anomalies.length > 0) {
          try {
            await prisma.expenses.update({
              where: { id: expense.id },
              data: { flags: anomalies as any, needs_review: true },
            });
          } catch {
            // Columns may not exist yet; anomalies still returned in response
          }
        }
      } catch {
        // Ignore anomaly detection errors
      }

      if (expense.status === 'approved') {
        try {
          await createExpenseJournal(expense, authReq.userId);
        } catch (err) {
          console.error('Failed to create journal entry for expense:', err);
        }
      }

      res.status(201).json({
        success: true,
        data: {
          id: expense.id,
          ...(anomalies.length > 0 && { anomalies, needsReview: true }),
        },
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
      if (data.receiptUrl !== undefined) updateData.receipt_url = data.receiptUrl;
      if (data.status !== undefined) updateData.status = data.status;

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

      if (data.status === 'approved') {
        try {
          await createExpenseJournal(updated, authReq.userId);
        } catch (err) {
          console.error('Failed to create journal entry for expense:', err);
        }
      }

      res.json({ success: true, data: { id: updated.id } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/expenses/:id/mark-reviewed
expenseRoutes.post('/:id/mark-reviewed', requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const existing = await prisma.expenses.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
      });
      if (!existing) throw new NotFoundError('Expense', req.params.id);
      const reviewedTag = `reviewed:${authReq.userId}:${new Date().toISOString()}`;
      const tags = [...(existing.tags || []), reviewedTag];
      const updated = await prisma.expenses.update({
        where: { id: req.params.id },
        data: { needs_review: false, flags: null, tags, status: 'approved' },
      });
      try {
        await createExpenseJournal(updated, authReq.userId);
      } catch (err) {
        console.error('Failed to create journal entry for expense:', err);
      }
      res.json({ success: true, data: { id: req.params.id } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/expenses/:id/fix-amount
expenseRoutes.post('/:id/fix-amount', requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params;
      const { newAmount } = req.body || {};
      const existing = await prisma.expenses.findFirst({
        where: { id, org_id: authReq.orgId! },
      });
      if (!existing) throw new NotFoundError('Expense', id);
      if (existing.status === 'voided') throw new ForbiddenError('Cannot edit voided expense');

      const amount = Number(newAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new ForbiddenError('Valid newAmount is required');
      }

      const tags = [...(existing.tags || []), `amount_corrected:${new Date().toISOString()}`];
      await prisma.expenses.update({
        where: { id },
        data: { amount, needs_review: false, flags: null, tags },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'update',
        entityType: 'expense',
        entityId: id,
        before: { amount: Number(existing.amount) },
        after: { amount },
        ...getClientInfo(req),
      });

      res.json({ success: true, data: { id, amount } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/expenses/:id/convert-to-asset
expenseRoutes.post('/:id/convert-to-asset', requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { id } = req.params;
      const { usefulLife = 5, category } = req.body || {};
      const expense = await prisma.expenses.findFirst({
        where: { id, org_id: authReq.orgId! },
      });
      if (!expense) throw new NotFoundError('Expense', id);
      if (expense.status === 'voided') throw new ForbiddenError('Cannot convert voided expense');

      const asset = await prisma.fixed_assets.create({
        data: {
          org_id: authReq.orgId!,
          name: expense.description,
          description: `Converted from expense: ${expense.description}`,
          purchase_date: expense.date,
          cost: expense.amount,
          useful_life_years: Number(usefulLife) || 5,
          depreciation_method: 'straight_line',
        },
      });

      const tags = [...(expense.tags || []), `asset:${asset.id}`, 'reviewed:asset'];
      await prisma.expenses.update({
        where: { id },
        data: {
          category: 'equipment',
          tags,
          needs_review: false,
          flags: null,
        },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'update',
        entityType: 'expense',
        entityId: id,
        after: { convertedToAsset: asset.id, usefulLife },
        ...getClientInfo(req),
      });

      res.json({
        success: true,
        data: {
          asset: {
            id: asset.id,
            name: asset.name,
            cost: Number(asset.cost),
            usefulLifeYears: asset.useful_life_years,
          },
          expenseId: id,
        },
      });
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
