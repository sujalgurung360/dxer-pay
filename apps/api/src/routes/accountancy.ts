import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import {
  computeTrialBalanceForOrg,
  computeProfitAndLossForOrg,
  computeGeneralLedgerForOrg,
  computeArAgingForOrg,
  computeApAgingForOrg,
  computeBurnRateForOrg,
} from '../services/accountancy.js';
import { runMonthEndChecks, closePeriod, reopenPeriod } from '../services/month-end-close.js';
import { generatePLSummary } from '../services/report-summary.js';
import { executeNLQuery } from '../services/nl-query.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export const accountancyRoutes = Router();

accountancyRoutes.use(authenticate, resolveOrg);

// GET /api/accountancy/trial-balance?from=YYYY-MM-DD&to=YYYY-MM-DD&basis=accrual|cash
accountancyRoutes.get(
  '/trial-balance',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { from, to, basis } = req.query as {
        from?: string;
        to?: string;
        basis?: 'accrual' | 'cash';
      };

      if (!from || !to) {
        throw new AppError(400, 'INVALID_PERIOD', 'from and to query params are required (YYYY-MM-DD)');
      }

      const basisValue: 'accrual' | 'cash' = basis === 'cash' ? 'cash' : 'accrual';

      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        throw new AppError(400, 'INVALID_PERIOD', 'from and to must be valid dates (YYYY-MM-DD)');
      }

      const result = await computeTrialBalanceForOrg({
        orgId: authReq.orgId!,
        from: fromDate,
        to: toDate,
        basis: basisValue,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/accountancy/general-ledger?from=YYYY-MM-DD&to=YYYY-MM-DD&basis=accrual|cash&accountCode=XXXX
accountancyRoutes.get(
  '/general-ledger',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { from, to, basis, accountCode } = req.query as {
        from?: string;
        to?: string;
        basis?: 'accrual' | 'cash';
        accountCode?: string;
      };

      if (!from || !to) {
        throw new AppError(400, 'INVALID_PERIOD', 'from and to query params are required (YYYY-MM-DD)');
      }

      const basisValue: 'accrual' | 'cash' = basis === 'cash' ? 'cash' : 'accrual';
      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        throw new AppError(400, 'INVALID_PERIOD', 'from and to must be valid dates (YYYY-MM-DD)');
      }

      const result = await computeGeneralLedgerForOrg({
        orgId: authReq.orgId!,
        from: fromDate,
        to: toDate,
        basis: basisValue,
        accountCode,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/accountancy/ar-aging?asOf=YYYY-MM-DD
accountancyRoutes.get(
  '/ar-aging',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { asOf } = req.query as { asOf?: string };
      const date = asOf ? new Date(asOf) : new Date();

      if (Number.isNaN(date.getTime())) {
        throw new AppError(400, 'INVALID_DATE', 'asOf must be a valid date (YYYY-MM-DD)');
      }

      const result = await computeArAgingForOrg(authReq.orgId!, date);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/accountancy/ap-aging?asOf=YYYY-MM-DD
accountancyRoutes.get(
  '/ap-aging',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { asOf } = req.query as { asOf?: string };
      const date = asOf ? new Date(asOf) : new Date();

      if (Number.isNaN(date.getTime())) {
        throw new AppError(400, 'INVALID_DATE', 'asOf must be a valid date (YYYY-MM-DD)');
      }

      const result = await computeApAgingForOrg(authReq.orgId!, date);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/accountancy/burn-rate?from=YYYY-MM-DD&to=YYYY-MM-DD
accountancyRoutes.get(
  '/burn-rate',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { from, to } = req.query as { from?: string; to?: string };

      if (!from || !to) {
        throw new AppError(400, 'INVALID_PERIOD', 'from and to query params are required (YYYY-MM-DD)');
      }

      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        throw new AppError(400, 'INVALID_PERIOD', 'from and to must be valid dates (YYYY-MM-DD)');
      }

      const result = await computeBurnRateForOrg({
        orgId: authReq.orgId!,
        from: fromDate,
        to: toDate,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);
// GET /api/accountancy/profit-and-loss?from=YYYY-MM-DD&to=YYYY-MM-DD&basis=accrual|cash
accountancyRoutes.get(
  '/profit-and-loss',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { from, to, basis } = req.query as {
        from?: string;
        to?: string;
        basis?: 'accrual' | 'cash';
      };

      if (!from || !to) {
        throw new AppError(400, 'INVALID_PERIOD', 'from and to query params are required (YYYY-MM-DD)');
      }

      const basisValue: 'accrual' | 'cash' = basis === 'cash' ? 'cash' : 'accrual';

      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        throw new AppError(400, 'INVALID_PERIOD', 'from and to must be valid dates (YYYY-MM-DD)');
      }

      const result = await computeProfitAndLossForOrg({
        orgId: authReq.orgId!,
        from: fromDate,
        to: toDate,
        basis: basisValue,
      });

      const summary = await generatePLSummary({
        orgName: (authReq as any).orgName || 'Organization',
        period: `${from} to ${to}`,
        totalRevenue: result.totals.revenue,
        totalExpenses: result.totals.expenses + result.totals.cogs,
        netIncome: result.totals.netIncome,
        topExpenses: (result.rows || [])
          .filter((r: any) => r.section === 'expense')
          .slice(0, 5)
          .map((r: any) => ({ name: r.name, amount: r.amount })),
        daysCount: Math.ceil((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
      });

      res.json({
        success: true,
        data: { ...result, summary: summary.summary, insights: summary.insights },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/accountancy/month-end-check?year=YYYY&month=M
accountancyRoutes.get(
  '/month-end-check',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const year = parseInt(req.query.year as string, 10);
      const month = parseInt(req.query.month as string, 10);
      const y = Number.isNaN(year) ? new Date().getFullYear() : year;
      const m = Number.isNaN(month) ? new Date().getMonth() + 1 : month;

      if (!authReq.orgId) {
        throw new AppError(403, 'NO_ORG', 'Organization context required');
      }

      const result = await runMonthEndChecks(authReq.orgId, y, m);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/accountancy/month-end-check (body: year, month) - kept for backward compatibility
accountancyRoutes.post(
  '/month-end-check',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { year, month } = req.body as { year?: number; month?: number };
      const y = year ?? new Date().getFullYear();
      const m = month ?? new Date().getMonth() + 1;
      if (!authReq.orgId) throw new AppError(403, 'NO_ORG', 'Organization context required');
      const result = await runMonthEndChecks(authReq.orgId, y, m);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/accountancy/close-period
accountancyRoutes.post(
  '/close-period',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { year, month, force } = req.body as { year?: number; month?: number; force?: boolean };
      const y = year ?? new Date().getFullYear();
      const m = month ?? new Date().getMonth() + 1;
      if (!authReq.orgId || !authReq.userId) {
        throw new AppError(403, 'NO_ORG', 'Organization context required');
      }
      const result = await closePeriod(authReq.orgId, y, m, authReq.userId, !!force);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Close failed' });
    }
  }
);

// POST /api/accountancy/reopen-period
accountancyRoutes.post(
  '/reopen-period',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { year, month, reason } = req.body as { year?: number; month?: number; reason?: string };
      const y = year ?? new Date().getFullYear();
      const m = month ?? new Date().getMonth() + 1;
      if (!authReq.orgId || !authReq.userId) {
        throw new AppError(403, 'NO_ORG', 'Organization context required');
      }
      const result = await reopenPeriod(authReq.orgId, y, m, authReq.userId, reason || 'Reopened for corrections');
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Reopen failed' });
    }
  }
);

// GET /api/accountancy/period-status?year=YYYY&month=M
accountancyRoutes.get(
  '/period-status',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const year = parseInt(req.query.year as string, 10);
      const month = parseInt(req.query.month as string, 10);
      if (!authReq.orgId || Number.isNaN(year) || Number.isNaN(month)) {
        throw new AppError(400, 'INVALID_PARAMS', 'year and month required');
      }
      const period = await prisma.accounting_periods.findUnique({
        where: {
          org_id_year_month_period_type: {
            org_id: authReq.orgId,
            year,
            month,
            period_type: 'month',
          },
        },
      });
      res.json({ success: true, data: period });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/accountancy/period-history?year=YYYY&month=M
accountancyRoutes.get(
  '/period-history',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const year = parseInt(req.query.year as string, 10);
      const month = parseInt(req.query.month as string, 10);
      if (!authReq.orgId || Number.isNaN(year) || Number.isNaN(month)) {
        throw new AppError(400, 'INVALID_PARAMS', 'year and month required');
      }
      const period = await prisma.accounting_periods.findUnique({
        where: {
          org_id_year_month_period_type: {
            org_id: authReq.orgId,
            year,
            month,
            period_type: 'month',
          },
        },
      });
      if (!period) {
        return res.json({ success: true, data: { period: null, checks: [], history: [] } });
      }
      const checks = await prisma.period_close_checks.findMany({
        where: { period_id: period.id },
        orderBy: { created_at: 'desc' },
      });
      const history = [
        period.closed_at && { action: 'closed', by: period.closed_by, at: period.closed_at, blockchain: period.polygon_txhash },
        period.reopened_at && { action: 'reopened', by: period.reopened_by, at: period.reopened_at, reason: period.reopen_reason },
      ].filter(Boolean);
      res.json({ success: true, data: { period, checks, history } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/accountancy/query - Natural language query
accountancyRoutes.post(
  '/query',
  requireRole('accountant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { question } = req.body as { question?: string };

      if (!question || typeof question !== 'string') {
        throw new AppError(400, 'INVALID_BODY', 'question (string) is required');
      }
      if (!authReq.orgId) {
        throw new AppError(403, 'NO_ORG', 'Organization context required');
      }

      const result = await executeNLQuery(authReq.orgId, question);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

