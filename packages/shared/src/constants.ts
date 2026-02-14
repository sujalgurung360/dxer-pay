// Organization roles
export const ORG_ROLES = ['owner', 'admin', 'accountant', 'viewer'] as const;
export type OrgRole = typeof ORG_ROLES[number];

// Role hierarchy (higher index = more permissions)
export const ROLE_HIERARCHY: Record<OrgRole, number> = {
  viewer: 0,
  accountant: 1,
  admin: 2,
  owner: 3,
};

// Expense statuses
export const EXPENSE_STATUSES = ['pending', 'approved', 'rejected', 'voided'] as const;
export type ExpenseStatus = typeof EXPENSE_STATUSES[number];

// Invoice statuses
export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

// Payroll statuses
export const PAYROLL_STATUSES = ['draft', 'processing', 'completed', 'voided'] as const;
export type PayrollStatus = typeof PAYROLL_STATUSES[number];

// Production batch statuses
export const BATCH_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
export type BatchStatus = typeof BATCH_STATUSES[number];

// Audit actions
export const AUDIT_ACTIONS = ['create', 'update', 'void', 'delete', 'status_change'] as const;
export type AuditAction = typeof AUDIT_ACTIONS[number];

// Audit entity types
export const AUDIT_ENTITY_TYPES = [
  'expense', 'invoice', 'payroll', 'production_batch',
  'production_event', 'employee', 'customer', 'organization',
  'organization_member',
] as const;
export type AuditEntityType = typeof AUDIT_ENTITY_TYPES[number];

// Expense categories
export const EXPENSE_CATEGORIES = [
  'travel', 'meals', 'supplies', 'equipment', 'software',
  'services', 'utilities', 'rent', 'marketing', 'other',
] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
