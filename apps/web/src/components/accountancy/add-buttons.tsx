'use client';

import { useRouter } from 'next/navigation';

export function AccountancyAddButtons() {
  const router = useRouter();

  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="btn-secondary !px-3 !py-1 text-xs"
        onClick={() => router.push('/expenses')}
      >
        + Expense
      </button>
      <button
        type="button"
        className="btn-secondary !px-3 !py-1 text-xs"
        onClick={() => router.push('/invoices')}
      >
        + Invoice
      </button>
      <button
        type="button"
        className="btn-secondary !px-3 !py-1 text-xs"
        onClick={() => router.push('/payroll')}
      >
        + Payroll
      </button>
    </div>
  );
}

