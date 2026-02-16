import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/error-handler.js';
import { authRoutes } from './routes/auth.js';
import { orgRoutes } from './routes/organizations.js';
import { expenseRoutes } from './routes/expenses.js';
import { invoiceRoutes } from './routes/invoices.js';
import { customerRoutes } from './routes/customers.js';
import { employeeRoutes } from './routes/employees.js';
import { payrollRoutes } from './routes/payrolls.js';
import { batchRoutes } from './routes/production-batches.js';
import { productionEventRoutes } from './routes/production-events.js';
import { auditRoutes } from './routes/audit-log.js';
import { anchorRoutes } from './routes/anchoring.js';
import { accountancyRoutes } from './routes/accountancy.js';
import { ocrRoutes } from './routes/ocr.js';
import { taxFormsRoutes } from './routes/tax-forms.js';
import { journalEntryRoutes } from './routes/journal-entries.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { hiringRoutes } from './routes/hiring.js';
import { healthRoutes } from './routes/health.js';

export function createApp() {
  const app = express();

  // Vercel (and most production deployments) run behind a proxy. This makes
  // express-rate-limit and IP detection behave correctly with X-Forwarded-For.
  app.set('trust proxy', 1);

  // API responses should not be ETag-cached; conditional requests can return 304.
  app.set('etag', false);

  // ─── Global Middleware ───────────────────────────
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return callback(null, true);
      const allowed = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://onedollarpage.com',
        'https://www.onedollarpage.com',
        'https://nepalethereum.cor',
        'https://www.nepalethereum.cor',
        process.env.CORS_ORIGIN,
      ].filter(Boolean);
      if (allowed.includes(origin) || origin.endsWith('.trycloudflare.com') || origin.endsWith('.vercel.app') || origin.endsWith('.nepalethereum.cor')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));

  // Never cache API responses. Prevents conditional 304s that can break clients.
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // Rate limiting on auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  });

  // General rate limiter
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth', authLimiter);
  app.use('/api', generalLimiter);

  // ─── Routes ──────────────────────────────────────
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/organizations', orgRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/payrolls', payrollRoutes);
  app.use('/api/production-batches', batchRoutes);
  app.use('/api/production-events', productionEventRoutes);
  app.use('/api/audit-log', auditRoutes);
  app.use('/api/anchoring', anchorRoutes);
  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/hiring', hiringRoutes);
  app.use('/api/accountancy', accountancyRoutes);
  app.use('/api/tax', taxFormsRoutes);
  app.use('/api/journal-entries', journalEntryRoutes);
  app.use('/api/ocr', ocrRoutes);

  // ─── Error Handler ───────────────────────────────
  app.use(errorHandler);

  return app;
}
