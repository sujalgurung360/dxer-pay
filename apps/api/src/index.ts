import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './lib/logger.js';
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

const app = express();
const PORT = parseInt(process.env.API_PORT || '4000', 10);

// ─── Global Middleware ───────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:3000',
      'http://localhost:3001', // Next.js dev server (alternate port)
      process.env.CORS_ORIGIN,
    ].filter(Boolean);
    if (allowed.includes(origin) || origin.endsWith('.trycloudflare.com')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
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

// ─── Start Server ────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'DXER API server started');
});

export default app;
