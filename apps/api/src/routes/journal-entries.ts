import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, resolveOrg, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { createJournalEntry, voidJournalEntry, getJournalEntries } from '../services/journal-entries.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export const journalEntryRoutes = Router();

journalEntryRoutes.use(authenticate, resolveOrg);

// GET /api/journal-entries
journalEntryRoutes.get('/', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { startDate, endDate, accountCode, referenceType, status } = req.query;
    const entries = await getJournalEntries(authReq.orgId!, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      accountCode: accountCode as string,
      referenceType: referenceType as string,
      status: status as string,
      limit: 100,
    });
    res.json(entries);
  } catch (e) {
    next(e);
  }
});

// POST /api/journal-entries
journalEntryRoutes.post('/', requireRole('accountant'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { entryDate, description, lines } = req.body;
    if (!entryDate || !lines || !Array.isArray(lines)) {
      throw new AppError(400, 'INVALID_BODY', 'entryDate and lines[] are required');
    }
    const entry = await createJournalEntry({
      orgId: authReq.orgId!,
      entryDate: new Date(entryDate),
      description: description || '',
      referenceType: 'manual',
      lines,
      createdBy: authReq.userId,
    });
    res.status(201).json(entry);
  } catch (e) {
    next(e);
  }
});

// POST /api/journal-entries/:id/void
journalEntryRoutes.post('/:id/void', requireRole('accountant'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { reason } = req.body;
    if (!id) throw new AppError(400, 'INVALID_PARAM', 'id is required');
    if (!reason || typeof reason !== 'string') {
      throw new AppError(400, 'INVALID_BODY', 'reason is required');
    }
    await voidJournalEntry(id, authReq.userId, reason);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// GET /api/journal-entries/:id
journalEntryRoutes.get('/:id', requireRole('viewer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const entry = await (prisma as any).journal_entries?.findFirst({
      where: { id, org_id: authReq.orgId! },
      include: {
        lines: { orderBy: { line_number: 'asc' } },
      },
    });
    if (!entry) throw new AppError(404, 'NOT_FOUND', 'Journal entry not found');
    res.json(entry);
  } catch (e) {
    next(e);
  }
});
