'use client';

import { PageHeader } from '@/components/ui/page-header';

export default function BudgetVsActualPage() {
  return (
    <div>
      <PageHeader
        title="Budget vs Actual"
        description="Shell for comparing actual results to budgeted figures"
      />
      <div className="card">
        <p className="text-xs text-gray-400">
          This page will show variances between budgeted and actual results once budgeting data is
          available. For now it serves as a placeholder in the accountancy structure.
        </p>
      </div>
    </div>
  );
}

