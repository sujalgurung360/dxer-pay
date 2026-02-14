import { Router, Request, Response, NextFunction } from 'express';
import { createPayrollSchema, payrollFilterSchema } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { NotFoundError, AppError } from '../lib/errors.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';
import { createPayrollJournal } from '../services/auto-journal.js';
import { Prisma } from '@prisma/client';

export const payrollRoutes = Router();
payrollRoutes.use(authenticate, resolveOrg);

// GET /api/payrolls
payrollRoutes.get('/', requireRole('viewer'), validateQuery(payrollFilterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const q = (req as any).validatedQuery;

      const where: Prisma.payrollsWhereInput = { org_id: authReq.orgId! };
      if (q.status) where.status = q.status;

      const [total, payrolls] = await Promise.all([
        prisma.payrolls.count({ where }),
        prisma.payrolls.findMany({
          where,
          include: { entries: { include: { employee: true } } },
          orderBy: { created_at: q.sortOrder },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);

      res.json({
        success: true,
        data: payrolls.map((p) => ({
          id: p.id,
          periodStart: p.period_start.toISOString().split('T')[0],
          periodEnd: p.period_end.toISOString().split('T')[0],
          payDate: p.pay_date.toISOString().split('T')[0],
          status: p.status,
          totalAmount: Number(p.total_amount),
          currency: p.currency,
          entryCount: p.entries.length,
          multichainTxid: p.multichain_txid,
          polygonTxhash: p.polygon_txhash,
          createdAt: p.created_at.toISOString(),
        })),
        pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
      });
    } catch (err) { next(err); }
  }
);

// GET /api/payrolls/:id
payrollRoutes.get('/:id', requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const payroll = await prisma.payrolls.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
        include: { entries: { include: { employee: true } } },
      });

      if (!payroll) throw new NotFoundError('Payroll', req.params.id);

      res.json({
        success: true,
        data: {
          id: payroll.id,
          periodStart: payroll.period_start.toISOString().split('T')[0],
          periodEnd: payroll.period_end.toISOString().split('T')[0],
          payDate: payroll.pay_date.toISOString().split('T')[0],
          status: payroll.status,
          totalAmount: Number(payroll.total_amount),
          currency: payroll.currency,
          notes: payroll.notes,
          entries: payroll.entries.map((e) => ({
            id: e.id,
            employeeId: e.employee_id,
            employeeName: e.employee.full_name,
            employeeWalletAddress: e.employee.wallet_address,
            amount: Number(e.amount),
          })),
          multichainDataHex: payroll.multichain_data_hex,
          multichainTxid: payroll.multichain_txid,
          polygonTxhash: payroll.polygon_txhash,
          createdAt: payroll.created_at.toISOString(),
        },
      });
    } catch (err) { next(err); }
  }
);

// GET /api/payrolls/:id/export - Export CSV
payrollRoutes.get('/:id/export', requireRole('viewer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const payroll = await prisma.payrolls.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
        include: { entries: { include: { employee: true } } },
      });

      if (!payroll) throw new NotFoundError('Payroll', req.params.id);

      const csv = [
        'Employee,Email,Position,Amount',
        ...payroll.entries.map((e) =>
          `"${e.employee.full_name}","${e.employee.email}","${e.employee.position || ''}",${e.amount}`
        ),
        `,,Total,${payroll.total_amount}`,
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=payroll-${payroll.period_start.toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } catch (err) { next(err); }
  }
);

// POST /api/payrolls - Generate payroll for period
payrollRoutes.post('/', requireRole('admin'), validateBody(createPayrollSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = req.body;

      // Get all active employees
      const employees = await prisma.employees.findMany({
        where: { org_id: authReq.orgId!, is_active: true },
      });

      if (employees.length === 0) {
        throw new AppError(400, 'NO_EMPLOYEES', 'No active employees found');
      }

      // Calculate total
      const totalAmount = employees.reduce((sum, emp) => sum + Number(emp.salary), 0);

      const payroll = await prisma.payrolls.create({
        data: {
          org_id: authReq.orgId!,
          created_by: authReq.userId,
          period_start: new Date(data.periodStart),
          period_end: new Date(data.periodEnd),
          pay_date: new Date(data.payDate),
          total_amount: totalAmount,
          notes: data.notes,
          entries: {
            create: employees.map((emp) => ({
              employee_id: emp.id,
              amount: Number(emp.salary),
            })),
          },
        },
        include: { entries: true },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'create',
        entityType: 'payroll',
        entityId: payroll.id,
        after: { periodStart: data.periodStart, periodEnd: data.periodEnd, totalAmount, employeeCount: employees.length },
        ...getClientInfo(req),
      });

      // Auto-anchor: payroll creation becomes a signed blockchain event
      triggerAutoAnchor({ entityType: 'payroll', entityId: payroll.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'create' });

      res.status(201).json({
        success: true,
        data: { id: payroll.id, totalAmount, entryCount: payroll.entries.length },
      });
    } catch (err) { next(err); }
  }
);

// POST /api/payrolls/:id/complete
payrollRoutes.post('/:id/complete', requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const payroll = await prisma.payrolls.findFirst({
        where: { id: req.params.id, org_id: authReq.orgId! },
      });

      if (!payroll) throw new NotFoundError('Payroll', req.params.id);
      if (payroll.status !== 'draft') throw new AppError(400, 'INVALID_STATUS', 'Payroll must be in draft status');

      const updated = await prisma.payrolls.update({
        where: { id: req.params.id },
        data: { status: 'completed' },
      });

      try {
        await createPayrollJournal(updated, authReq.userId);
      } catch (err) {
        console.error('Failed to create journal entry for payroll:', err);
      }

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'status_change',
        entityType: 'payroll',
        entityId: req.params.id,
        before: { status: 'draft' },
        after: { status: 'completed' },
        ...getClientInfo(req),
      });

      triggerAutoAnchor({ entityType: 'payroll', entityId: req.params.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'status_change' });

      res.json({ success: true, data: { id: req.params.id, status: 'completed' } });
    } catch (err) { next(err); }
  }
);
