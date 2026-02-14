import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const healthRoutes = Router();

healthRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, data: { status: 'healthy', timestamp: new Date().toISOString() } });
  } catch {
    res.status(503).json({ success: false, error: { code: 'UNHEALTHY', message: 'Database unreachable' } });
  }
});
