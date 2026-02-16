import { Router, Request, Response, NextFunction } from 'express';
import { createEmployeeSchema, updateEmployeeSchema, paginationSchema } from '@dxer/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { NotFoundError } from '../lib/errors.js';
import { writeAuditLog, getClientInfo } from '../services/audit.js';
import { triggerAutoAnchor } from '../middleware/auto-anchor.js';

export const employeeRoutes = Router();
employeeRoutes.use(authenticate, resolveOrg);

// GET /api/employees
employeeRoutes.get('/', requireRole('viewer'), validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const q = (req as any).validatedQuery;

      const where: any = { org_id: authReq.orgId! };
      // Only show employees who have completed onboarding (or were created directly)
      // Employees in the hiring pipeline should only appear in the Hiring page
      where.OR = [
        { onboarding_status: 'completed' },
        { onboarding_status: 'draft' }, // directly created employees (not via hiring)
      ];
      if (q.search) where.full_name = { contains: q.search, mode: 'insensitive' };

      const [total, employees] = await Promise.all([
        prisma.employees.count({ where }),
        prisma.employees.findMany({
          where,
          orderBy: { created_at: q.sortOrder },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);

      res.json({
        success: true,
        data: employees.map((e) => ({
          id: e.id, fullName: e.full_name, email: e.email,
          position: e.position, department: e.department,
          salary: Number(e.salary), currency: e.currency,
          startDate: e.start_date.toISOString().split('T')[0],
          isActive: e.is_active,
          walletAddress: e.wallet_address,
          onboardingStatus: e.onboarding_status,
          createdAt: e.created_at.toISOString(),
          multichainTxid: e.multichain_txid,
          polygonTxhash: e.polygon_txhash,
        })),
        pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
      });
    } catch (err) { next(err); }
  }
);

// POST /api/employees
employeeRoutes.post('/', requireRole('admin'), validateBody(createEmployeeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const data = req.body;

      const employee = await prisma.employees.create({
        data: {
          org_id: authReq.orgId!,
          full_name: data.fullName,
          email: data.email,
          position: data.position,
          department: data.department,
          salary: data.salary,
          currency: data.currency,
          start_date: new Date(data.startDate),
        },
      });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'create',
        entityType: 'employee',
        entityId: employee.id,
        after: data,
        ...getClientInfo(req),
      });

      triggerAutoAnchor({ entityType: 'employee', entityId: employee.id, orgId: authReq.orgId!, userId: authReq.userId, action: 'create' });

      res.status(201).json({ success: true, data: { id: employee.id } });
    } catch (err) { next(err); }
  }
);

// PUT /api/employees/:id
employeeRoutes.put('/:id', requireRole('admin'), validateBody(updateEmployeeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
      const existing = await prisma.employees.findFirst({
        where: { id, org_id: authReq.orgId! },
      });
      if (!existing) throw new NotFoundError('Employee', id);

      const data = req.body;
      const updateData: any = {};
      if (data.fullName !== undefined) updateData.full_name = data.fullName;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.position !== undefined) updateData.position = data.position;
      if (data.department !== undefined) updateData.department = data.department;
      if (data.salary !== undefined) updateData.salary = data.salary;
      if (data.currency !== undefined) updateData.currency = data.currency;
      if (data.startDate !== undefined) updateData.start_date = new Date(data.startDate);

      await prisma.employees.update({ where: { id }, data: updateData });

      await writeAuditLog({
        orgId: authReq.orgId!,
        userId: authReq.userId,
        action: 'update',
        entityType: 'employee',
        entityId: id,
        before: { fullName: existing.full_name, salary: Number(existing.salary) },
        after: data,
        ...getClientInfo(req),
      });

      triggerAutoAnchor({ entityType: 'employee', entityId: id, orgId: authReq.orgId!, userId: authReq.userId, action: 'update' });

      res.json({ success: true, data: { id } });
    } catch (err) { next(err); }
  }
);
