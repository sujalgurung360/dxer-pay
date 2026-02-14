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
import { AppError } from '../lib/errors.js';

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

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

