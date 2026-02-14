import { z } from 'zod';
import type {
  OrgRole, ExpenseStatus, InvoiceStatus,
  PayrollStatus, BatchStatus, AuditAction, AuditEntityType, ExpenseCategory,
} from './constants';
import type {
  signUpSchema, signInSchema, createOrgSchema, createExpenseSchema,
  createInvoiceSchema, createCustomerSchema, createEmployeeSchema,
  createPayrollSchema, createBatchSchema, createProductionEventSchema,
  invoiceLineItemSchema, paginationSchema,
} from './schemas';

// ─── Base ────────────────────────────────────────
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Auth ────────────────────────────────────────
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// ─── Profile ─────────────────────────────────────
export interface Profile extends BaseEntity {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
}

// ─── Organization ────────────────────────────────
export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  ownerId: string;
}

export interface OrganizationMember extends BaseEntity {
  orgId: string;
  userId: string;
  role: OrgRole;
  profile?: Profile;
}

export type CreateOrgInput = z.infer<typeof createOrgSchema>;

// ─── Expense ─────────────────────────────────────
export interface Expense extends BaseEntity {
  orgId: string;
  createdBy: string;
  description: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  status: ExpenseStatus;
  date: string;
  tags: string[];
  notes: string | null;
  receiptUrl: string | null;
  productionBatchId: string | null;
  // Blockchain anchoring
  multichainDataHex: string | null;
  multichainTxid: string | null;
  polygonTxhash: string | null;
}

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

// ─── Invoice ─────────────────────────────────────
export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice extends BaseEntity {
  orgId: string;
  createdBy: string;
  customerId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  dueDate: string;
  currency: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  lineItems: InvoiceLineItem[];
  customer?: Customer;
  // Blockchain anchoring
  multichainDataHex: string | null;
  multichainTxid: string | null;
  polygonTxhash: string | null;
}

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>;

// ─── Customer ────────────────────────────────────
export interface Customer extends BaseEntity {
  orgId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
}

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ─── Employee ────────────────────────────────────
export interface Employee extends BaseEntity {
  orgId: string;
  fullName: string;
  email: string;
  position: string | null;
  department: string | null;
  salary: number;
  currency: string;
  startDate: string;
  isActive: boolean;
}

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

// ─── Payroll ─────────────────────────────────────
export interface Payroll extends BaseEntity {
  orgId: string;
  createdBy: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: PayrollStatus;
  totalAmount: number;
  currency: string;
  notes: string | null;
  entries: PayrollEntry[];
  // Blockchain anchoring
  multichainDataHex: string | null;
  multichainTxid: string | null;
  polygonTxhash: string | null;
}

export interface PayrollEntry {
  id: string;
  payrollId: string;
  employeeId: string;
  amount: number;
  employee?: Employee;
}

export type CreatePayrollInput = z.infer<typeof createPayrollSchema>;

// ─── Production ──────────────────────────────────
export interface ProductionBatch extends BaseEntity {
  orgId: string;
  createdBy: string;
  name: string;
  description: string | null;
  status: BatchStatus;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  events?: ProductionEvent[];
  // Blockchain anchoring
  multichainDataHex: string | null;
  multichainTxid: string | null;
  polygonTxhash: string | null;
}

export interface ProductionEvent extends BaseEntity {
  orgId: string;
  batchId: string;
  createdBy: string;
  eventType: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type CreateProductionEventInput = z.infer<typeof createProductionEventSchema>;

// ─── Device Identity ─────────────────────────────
export interface DeviceIdentity extends BaseEntity {
  orgId: string;
  deviceName: string;
  publicKey: string;
  isActive: boolean;
  lastSeenAt: string | null;
}

// ─── Content Address ─────────────────────────────
export interface ContentAddress extends BaseEntity {
  orgId: string;
  entityType: string;
  entityId: string;
  hashAlgorithm: string;
  hashValue: string;
}

// ─── Audit Log ───────────────────────────────────
export interface AuditLogEntry extends BaseEntity {
  orgId: string;
  userId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  profile?: Profile;
}

// ─── Pagination ──────────────────────────────────
export type PaginationParams = z.infer<typeof paginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ─── API Response ────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─── Anchoring ───────────────────────────────────
export interface AnchorPayload {
  entityType: string;
  entityId: string;
  dataHash: string;
  timestamp: string;
}

export interface AnchorResult {
  multichainDataHex: string;
  multichainTxid: string;
  polygonTxhash: string;
}

export interface AnchorVerification {
  txid: string;
  status: 'confirmed' | 'pending' | 'not_found';
  confirmations: number;
  timestamp: string | null;
}
