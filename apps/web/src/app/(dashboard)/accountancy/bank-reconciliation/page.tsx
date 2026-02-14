'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';

const BANK_ACCOUNTS = [
  { code: '1000', name: 'Bank: Operating' },
];

export default function BankReconciliationPage() {
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [accountCode, setAccountCode] = useState('1000');
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(isoToday);

  return (
    <div>
      <PageHeader
        title="Bank Reconciliation"
        description="Shell for reconciling bank statements against DXER ledger balances"
        actions={<AccountancyAddButtons />}
      />

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-100 bg-surface-50 px-4 py-3">
        <div>
          <label className="label mb-1">Bank account</label>
          <select
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            className="input-field"
          >
            {BANK_ACCOUNTS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="label mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field" />
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Bank Statement Lines</h2>
          <p className="mb-3 text-xs text-gray-400">
            Upload or paste statement lines here. In a later phase this will be populated automatically
            from the Documents Inbox and support matching to ledger transactions.
          </p>
          <textarea
            className="input-field h-40 text-xs"
            placeholder="Paste CSV or statement lines here for manual reconciliation..."
          />
        </div>
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Ledger Transactions</h2>
          <p className="mb-3 text-xs text-gray-400">
            This panel will show journal lines for the selected bank account and period. For now it acts
            as a placeholder for manual reconciliation notes.
          </p>
          <textarea
            className="input-field h-40 text-xs"
            placeholder="Use this area to note matches, outstanding items, and adjustments..."
          />
        </div>
      </div>
    </div>
  );
}

