import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import {
  generateW2,
  generateAllW2s,
  generate1099NEC,
  generate1120,
  generateDepreciationSchedule,
} from '../services/tax-forms.js';
import { generateTaxPackage } from '../services/tax-package.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export const taxFormsRoutes = Router();

taxFormsRoutes.use(authenticate, resolveOrg);

taxFormsRoutes.get('/w2', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const year = parseInt((req.query.year as string) || '', 10);
    if (!Number.isInteger(year)) throw new AppError(400, 'INVALID_YEAR', 'year query is required (e.g. ?year=2024)');
    const w2s = await generateAllW2s(authReq.orgId!, year);
    res.json(w2s);
  } catch (e) {
    next(e);
  }
});

taxFormsRoutes.get('/w2/:employeeId', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = Array.isArray(req.params.employeeId) ? req.params.employeeId[0] : req.params.employeeId;
    const year = parseInt((req.query.year as string) || '', 10);
    if (!Number.isInteger(year)) throw new AppError(400, 'INVALID_YEAR', 'year query is required');
    if (!employeeId) throw new AppError(400, 'INVALID_PARAM', 'employeeId is required');
    const w2 = await generateW2(employeeId, year);
    res.json(w2);
  } catch (e) {
    next(e);
  }
});

taxFormsRoutes.get('/1099-nec', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const year = parseInt((req.query.year as string) || '', 10);
    if (!Number.isInteger(year)) throw new AppError(400, 'INVALID_YEAR', 'year query is required');
    const forms = await generate1099NEC(authReq.orgId!, year);
    res.json(forms);
  } catch (e) {
    next(e);
  }
});

taxFormsRoutes.get('/1120', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const year = parseInt((req.query.year as string) || '', 10);
    if (!Number.isInteger(year)) throw new AppError(400, 'INVALID_YEAR', 'year query is required');
    const form = await generate1120(authReq.orgId!, year);
    res.json(form);
  } catch (e) {
    next(e);
  }
});

taxFormsRoutes.get('/depreciation-schedule', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const year = parseInt((req.query.year as string) || '', 10);
    if (!Number.isInteger(year)) throw new AppError(400, 'INVALID_YEAR', 'year query is required');
    const schedule = await generateDepreciationSchedule(authReq.orgId!, year);
    res.json(schedule);
  } catch (e) {
    next(e);
  }
});

taxFormsRoutes.post('/generate-package', requireRole('accountant'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const year = parseInt((req.body?.year as string) ?? (req.body?.year as number) ?? '', 10);
    if (!Number.isInteger(year)) throw new AppError(400, 'INVALID_YEAR', 'body.year is required');
    const result = await generateTaxPackage(authReq.orgId!, year, authReq.userId);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

taxFormsRoutes.get('/packages', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const list = await (prisma as any).tax_packages.findMany({
      where: { org_id: authReq.orgId! },
      orderBy: { generated_at: 'desc' },
      take: 10,
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});
