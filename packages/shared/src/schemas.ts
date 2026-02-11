import { z } from 'zod';
import {
  ORG_ROLES, EXPENSE_STATUSES, INVOICE_STATUSES,
  PAYROLL_STATUSES, BATCH_STATUSES, EXPENSE_CATEGORIES,
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
} from './constants';

// ─── Common ──────────────────────────────────────
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const uuidSchema = z.string().uuid();

// ─── Auth ────────────────────────────────────────
export const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required').max(200),
});

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Profile ─────────────────────────────────────
export const profileUpdateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

// ─── Organization ────────────────────────────────
export const createOrgSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(200),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(ORG_ROLES),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(ORG_ROLES),
});

// ─── Expense ─────────────────────────────────────
export const createExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3).default('USD'),
  category: z.enum(EXPENSE_CATEGORIES),
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  tags: z.array(z.string().max(50)).max(10).default([]),
  notes: z.string().max(2000).optional(),
  productionBatchId: z.string().uuid().optional().nullable(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const expenseFilterSchema = paginationSchema.extend({
  status: z.enum(EXPENSE_STATUSES).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
});

// ─── Invoice ─────────────────────────────────────
export const invoiceLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  amount: z.number().min(0),
});

export const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  invoiceNumber: z.string().min(1).max(50).optional(),
  dueDate: z.string(),
  currency: z.string().length(3).default('USD'),
  lineItems: z.array(invoiceLineItemSchema).min(1, 'At least one line item is required'),
  notes: z.string().max(2000).optional(),
  taxRate: z.number().min(0).max(100).default(0),
});

export const updateInvoiceSchema = createInvoiceSchema.partial();

export const invoiceFilterSchema = paginationSchema.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  customerId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// ─── Customer ────────────────────────────────────
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  taxId: z.string().max(50).optional().nullable(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

// ─── Employee ────────────────────────────────────
export const createEmployeeSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  position: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  salary: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  startDate: z.string(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

// ─── Payroll ─────────────────────────────────────
export const createPayrollSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  payDate: z.string(),
  notes: z.string().max(2000).optional(),
});

export const payrollFilterSchema = paginationSchema.extend({
  status: z.enum(PAYROLL_STATUSES).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// ─── Production ──────────────────────────────────
export const createBatchSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  plannedStartDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
});

export const updateBatchSchema = createBatchSchema.partial().extend({
  status: z.enum(BATCH_STATUSES).optional(),
});

export const createProductionEventSchema = z.object({
  batchId: z.string().uuid(),
  eventType: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const batchFilterSchema = paginationSchema.extend({
  status: z.enum(BATCH_STATUSES).optional(),
});

// ─── Anchoring ───────────────────────────────────
export const anchorRecordsSchema = z.object({
  entityType: z.string(),
  entityIds: z.array(z.string().uuid()).min(1).max(50),
});

// ─── Audit Log Filter ────────────────────────────
export const auditLogFilterSchema = paginationSchema.extend({
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
