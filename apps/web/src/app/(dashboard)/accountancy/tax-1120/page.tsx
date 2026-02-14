'use client';

import { PageHeader } from '@/components/ui/page-header';

export default function Tax1120Page() {
  return (
    <div>
      <PageHeader
        title="Form 1120 / Schedule C"
        description="Shell for corporate/individual tax return pre-fill from accounting data"
      />
      <div className="card">
        <p className="text-xs text-gray-400">
          This page will eventually map Income Statement and Balance Sheet lines into the appropriate
          tax form fields (e.g. Line 1a revenue, Line 2 COGS, Line 12 salaries, etc.). For now it is a
          structural placeholder where the pre-filled tax form UI will live.
        </p>
      </div>
    </div>
  );
}

