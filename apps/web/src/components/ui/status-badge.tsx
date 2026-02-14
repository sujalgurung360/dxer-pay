'use client';

import clsx from 'clsx';

const statusStyles: Record<string, string> = {
  // Expenses
  pending: 'badge-yellow',
  approved: 'badge-green',
  rejected: 'badge-red',
  voided: 'badge-gray',
  // Invoices
  draft: 'badge-gray',
  sent: 'badge-blue',
  paid: 'badge-green',
  void: 'badge-red',
  // Payroll
  processing: 'badge-yellow',
  completed: 'badge-green',
  // Production
  planned: 'badge-gray',
  in_progress: 'badge-blue',
  cancelled: 'badge-red',
  // Anchor
  confirmed: 'badge-green',
  not_found: 'badge-red',
  // General
  active: 'badge-green',
  inactive: 'badge-gray',
};

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || 'badge-gray';
  return (
    <span className={style}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
