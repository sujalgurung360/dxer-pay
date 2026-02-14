import type { OrgRole } from './constants';
import { ROLE_HIERARCHY } from './constants';

/**
 * Check if a role has at least the required permission level
 */
export function hasRole(userRole: OrgRole, requiredRole: OrgRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Generate a slug from a string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Format date for display
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Generate invoice number with prefix and zero-padded sequence
 */
export function generateInvoiceNumber(sequence: number, prefix: string = 'INV'): string {
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Calculate invoice totals
 */
export function calculateInvoiceTotals(
  lineItems: { quantity: number; unitPrice: number }[],
  taxRate: number = 0,
) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return { subtotal: round2(subtotal), taxAmount: round2(taxAmount), total: round2(total) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
