'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { Plus, Trash2, Loader2 } from 'lucide-react';

const ACCOUNTS = [
  { code: '1000', name: 'Bank: Operating' },
  { code: '1100', name: 'Accounts Receivable' },
  { code: '2000', name: 'Accounts Payable' },
  { code: '2100', name: 'Payroll Liabilities' },
  { code: '4000', name: 'Revenue' },
  { code: '6000', name: 'Salary Expense' },
  { code: '6200', name: 'Software' },
  { code: '6400', name: 'Office Supplies' },
  { code: '6999', name: 'Miscellaneous' },
];

interface DraftLine {
  accountCode: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
}

export default function JournalsPage() {
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { accountCode: '', debitAmount: 0, creditAmount: 0, description: '' },
    { accountCode: '', debitAmount: 0, creditAmount: 0, description: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);

  const totalDebits = lines.reduce((sum, l) => sum + (l.debitAmount || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (l.creditAmount || 0), 0);
  const balanced = Math.abs(totalDebits - totalCredits) < 0.01;
  const hasAmount = totalDebits > 0 && totalCredits > 0;

  const loadEntries = async () => {
    try {
      const list = await api.journalEntries.list({ limit: '50' } as any);
      setEntries(Array.isArray(list) ? list : []);
    } catch {
      setEntries([]);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  function addLine() {
    setLines([...lines, { accountCode: '', debitAmount: 0, creditAmount: 0, description: '' }]);
  }

  function removeLine(index: number) {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
    }
  }

  function updateLine(index: number, field: keyof DraftLine, value: string | number) {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'debitAmount' && Number(value) > 0) updated[index].creditAmount = 0;
    if (field === 'creditAmount' && Number(value) > 0) updated[index].debitAmount = 0;
    setLines(updated);
  }

  async function handleSave() {
    if (!balanced || !hasAmount) {
      setError('Entry must balance: debits must equal credits');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.journalEntries.create({
        entryDate,
        description: description || 'Manual entry',
        lines: lines
          .filter((l) => (l.debitAmount || 0) > 0 || (l.creditAmount || 0) > 0)
          .map((l) => ({
            accountCode: l.accountCode,
            debitAmount: l.debitAmount || undefined,
            creditAmount: l.creditAmount || undefined,
            description: l.description || undefined,
          })),
      });
      setSuccess(true);
      setDescription('');
      setLines([
        { accountCode: '', debitAmount: 0, creditAmount: 0, description: '' },
        { accountCode: '', debitAmount: 0, creditAmount: 0, description: '' },
      ]);
      loadEntries();
    } catch (err: any) {
      setError(err?.message || 'Failed to save journal entry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journals & Adjustments"
        description="Create manual journal entries and view posted entries"
        actions={<AccountancyAddButtons />}
      />

      <Card>
        <CardHeader>
          <CardTitle>New Journal Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Adjusting entry for..."
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-medium">Lines</h4>
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="mr-1 h-4 w-4" />
                Add Line
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="flex flex-wrap gap-2 items-center">
                  <Select
                    value={line.accountCode}
                    onValueChange={(v) => updateLine(index, 'accountCode', v)}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNTS.map((acc) => (
                        <SelectItem key={acc.code} value={acc.code}>
                          {acc.code} - {acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Debit"
                    value={line.debitAmount || ''}
                    onChange={(e) =>
                      updateLine(index, 'debitAmount', parseFloat(e.target.value) || 0)
                    }
                    className="w-32"
                  />

                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Credit"
                    value={line.creditAmount || ''}
                    onChange={(e) =>
                      updateLine(index, 'creditAmount', parseFloat(e.target.value) || 0)
                    }
                    className="w-32"
                  />

                  <Input
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => updateLine(index, 'description', e.target.value)}
                    className="flex-1 min-w-[120px]"
                  />

                  {lines.length > 2 && (
                    <Button size="sm" variant="ghost" onClick={() => removeLine(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="space-y-1">
              <div className="flex gap-4 text-sm">
                <span>
                  Total Debits: <strong>${totalDebits.toFixed(2)}</strong>
                </span>
                <span>
                  Total Credits: <strong>${totalCredits.toFixed(2)}</strong>
                </span>
              </div>
              {!balanced && (
                <p className="text-sm text-red-600">
                  Entry doesn&apos;t balance (difference: $
                  {Math.abs(totalDebits - totalCredits).toFixed(2)})
                </p>
              )}
              {balanced && hasAmount && (
                <p className="text-sm text-green-600">Entry is balanced</p>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && (
                <p className="text-sm text-green-600">Journal entry created successfully</p>
              )}
            </div>

            <Button
              onClick={handleSave}
              disabled={!balanced || !hasAmount || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Journal Entry'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Journal Entries</CardTitle>
          <p className="text-sm text-muted-foreground">
            System-generated and manual journal entries
          </p>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No journal entries yet. Create one above or approve expenses, create invoices, or
              complete payroll to generate entries.
            </p>
          ) : (
            <div className="space-y-3">
              {entries.slice(0, 20).map((entry: any) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {entry.entry_number} — {entry.description || 'No description'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.entry_date).toLocaleDateString()} • {entry.reference_type || 'manual'} •{' '}
                      {entry.status}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {(entry.lines || []).length} lines
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
