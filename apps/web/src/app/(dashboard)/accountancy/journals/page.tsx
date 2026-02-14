'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';

interface DraftLine {
  id: number;
  accountCode: string;
  description: string;
  debit: string;
  credit: string;
}

export default function JournalsPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { id: 1, accountCode: '', description: '', debit: '', credit: '' },
    { id: 2, accountCode: '', description: '', debit: '', credit: '' },
  ]);

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);

  const handleLineChange = (id: number, field: keyof DraftLine, value: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { id: prev.length + 1, accountCode: '', description: '', debit: '', credit: '' }]);
  };

  return (
    <div>
      <PageHeader
        title="Journals & Adjustments"
        description="Shell for manual journal entries and adjustments"
        actions={<AccountancyAddButtons />}
      />

      <div className="card mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">New Journal Entry (shell)</h2>
        <p className="mb-3 text-xs text-gray-400">
          This form lets an accountant express complex manual adjustments in a structured way.
          Persistence and posting logic can be wired in a later iteration.
        </p>
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="label">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field mt-1" />
          </div>
          <div>
            <label className="label">Reference</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="input-field mt-1"
              placeholder="e.g. ADJ-001"
            />
          </div>
          <div>
            <label className="label">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field mt-1"
              placeholder="Year-end accrual, reclassification, etc."
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-gray-100 bg-surface-50 text-gray-400">
              <tr>
                <th className="px-3 py-2 font-normal">Account Code</th>
                <th className="px-3 py-2 font-normal">Line Description</th>
                <th className="px-3 py-2 text-right font-normal">Debit</th>
                <th className="px-3 py-2 text-right font-normal">Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-t border-gray-50">
                  <td className="px-3 py-1.5">
                    <input
                      className="input-field h-7 text-[11px]"
                      placeholder="e.g. 6400"
                      value={line.accountCode}
                      onChange={(e) => handleLineChange(line.id, 'accountCode', e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input-field h-7 text-[11px]"
                      placeholder="memo"
                      value={line.description}
                      onChange={(e) => handleLineChange(line.id, 'description', e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      className="input-field h-7 text-right text-[11px]"
                      type="number"
                      step="0.01"
                      value={line.debit}
                      onChange={(e) => handleLineChange(line.id, 'debit', e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      className="input-field h-7 text-right text-[11px]"
                      type="number"
                      step="0.01"
                      value={line.credit}
                      onChange={(e) => handleLineChange(line.id, 'credit', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-100 bg-surface-50">
                <td className="px-3 py-1.5 text-xs text-gray-500" colSpan={2}>
                  Totals
                </td>
                <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-800">
                  {totalDebit.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-800">
                  {totalCredit.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <button type="button" onClick={addLine} className="text-purple-600 hover:text-purple-700">
            + Add line
          </button>
          <span>
            Difference:{' '}
            <span className={totalDebit === totalCredit ? 'text-emerald-600' : 'text-red-600'}>
              {(totalDebit - totalCredit).toFixed(2)}
            </span>
          </span>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Existing Journals (placeholder)</h2>
        <p className="text-xs text-gray-400">
          In a later phase this table will list both system-generated and manual journal entries. For now
          it serves as a visual placeholder for where an accountant will review postings.
        </p>
      </div>
    </div>
  );
}

