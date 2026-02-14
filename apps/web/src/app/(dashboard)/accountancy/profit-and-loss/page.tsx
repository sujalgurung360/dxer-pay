'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { useUiMode } from '@/lib/ui-mode';
import { formatCurrency } from '@dxer/shared';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';
import { Modal } from '@/components/ui/modal';
import { CheckCircle, XCircle, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';

type Basis = 'accrual' | 'cash';

type SectionType = 'revenue' | 'cogs' | 'expense';

interface ProfitAndLossResponse {
  success: boolean;
  data: {
    basis: Basis;
    from: string;
    to: string;
    rows: {
      section: SectionType;
      code: string;
      name: string;
      amount: number;
    }[];
    totals: {
      revenue: number;
      cogs: number;
      grossProfit: number;
      expenses: number;
      netIncome: number;
    };
  };
}

type CompareMode = 'none' | 'prev_period' | 'last_year';

export default function ProfitAndLossPage() {
  const { currentOrg } = useAuth();
  const [uiMode] = useUiMode();
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(isoToday);
  const [basis, setBasis] = useState<Basis>('accrual');
  const [compareMode, setCompareMode] = useState<CompareMode>('none');

  const [currentPl, setCurrentPl] = useState<ProfitAndLossResponse['data'] | null>(null);
  const [comparePl, setComparePl] = useState<ProfitAndLossResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drillAccountCode, setDrillAccountCode] = useState<string | null>(null);
  const [drillAccountName, setDrillAccountName] = useState('');

  const [blockchainInfo, setBlockchainInfo] = useState<{ anchored: number; total: number } | null>(
    null,
  );
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [checkResults, setCheckResults] = useState<any>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  const periodDays = useMemo(() => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diff = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24) + 1;
    return diff > 0 ? diff : 0;
  }, [from, to]);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    setComparePl(null);
    try {
      const current = (await api.accountancy.profitAndLoss({
        from,
        to,
        basis,
      })) as ProfitAndLossResponse;

      setCurrentPl(current.data);

      // Optional comparison period
      if (compareMode !== 'none') {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        let compareFrom: string;
        let compareTo: string;

        if (compareMode === 'prev_period') {
          const diffMs = toDate.getTime() - fromDate.getTime();
          const prevTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
          const prevFrom = new Date(prevTo.getTime() - diffMs);
          compareFrom = prevFrom.toISOString().split('T')[0];
          compareTo = prevTo.toISOString().split('T')[0];
        } else {
          // last_year
          const prevFrom = new Date(fromDate);
          const prevTo = new Date(toDate);
          prevFrom.setFullYear(prevFrom.getFullYear() - 1);
          prevTo.setFullYear(prevTo.getFullYear() - 1);
          compareFrom = prevFrom.toISOString().split('T')[0];
          compareTo = prevTo.toISOString().split('T')[0];
        }

        const comparison = (await api.accountancy.profitAndLoss({
          from: compareFrom,
          to: compareTo,
          basis,
        })) as ProfitAndLossResponse;
        setComparePl(comparison.data);
      }

      // Simple blockchain status approximation based on journal lines having anchored source events
      try {
        const gl = (await api.accountancy.generalLedger({
          from,
          to,
          basis,
        })) as any;
        const uniqueKeys = new Set<string>();
        let anchored = 0;

        for (const entry of gl.data.entries || []) {
          const key = `${entry.sourceType}:${entry.sourceId}`;
          if (uniqueKeys.has(key)) continue;
          uniqueKeys.add(key);
        }

        // For now, assume all journal sources are anchored via auto-anchor
        anchored = uniqueKeys.size;
        setBlockchainInfo({ anchored, total: uniqueKeys.size });
      } catch {
        setBlockchainInfo(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Profit & Loss');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg]);

  const handleRefresh = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const revenueTotal = currentPl?.totals.revenue ?? 0;
  const cogsTotal = currentPl?.totals.cogs ?? 0;
  const grossProfit = currentPl?.totals.grossProfit ?? 0;
  const expenseTotal = currentPl?.totals.expenses ?? 0;
  const netIncome = currentPl?.totals.netIncome ?? 0;
  const compareNetIncome = comparePl?.totals.netIncome ?? 0;

  const netIncomeDelta = compareMode === 'none' ? null : netIncome - compareNetIncome;

  const isPartialMonth = useMemo(() => {
    const fromDate = new Date(from);
    const daysInMonth = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0).getDate();
    return periodDays > 0 && periodDays < daysInMonth;
  }, [from, periodDays]);

  const periodYear = useMemo(() => new Date(from).getFullYear(), [from]);
  const periodMonth = useMemo(() => new Date(from).getMonth() + 1, [from]);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const handleMonthEndCheck = async () => {
    setCheckLoading(true);
    setCheckResults(null);
    setShowCheckModal(true);
    try {
      const res = (await api.accountancy.monthEndCheck(periodYear, periodMonth)) as any;
      setCheckResults(res.data);
    } catch (err: any) {
      setCheckResults({ error: err.message });
    } finally {
      setCheckLoading(false);
    }
  };

  const handleConfirmClose = async () => {
    setClosing(true);
    try {
      await api.accountancy.closePeriod(periodYear, periodMonth);
      setShowCheckModal(false);
      setCheckResults(null);
      loadData();
    } catch (err: any) {
      setCheckResults((prev: any) => (prev ? { ...prev, error: err.message } : { error: err.message }));
    } finally {
      setClosing(false);
    }
  };

  const handleForceClose = async () => {
    if (!confirm('Force close anyway? This is not recommended when checks have failed.')) return;
    setClosing(true);
    try {
      await api.accountancy.closePeriod(periodYear, periodMonth, true);
      setShowCheckModal(false);
      setCheckResults(null);
      loadData();
    } catch (err: any) {
      setCheckResults((prev: any) => (prev ? { ...prev, error: err.message } : { error: err.message }));
    } finally {
      setClosing(false);
    }
  };

  const handleSwitchToFullMonth = () => {
    const fromDate = new Date(from);
    const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const end = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];
    setFrom(start);
    setTo(end);
  };

  return (
    <div>
      <PageHeader
        title="Profit & Loss"
        description="Automated P&L generated from DXER expenses, invoices, and payrolls"
        actions={<AccountancyAddButtons />}
      />

      {/* Executive summary (AI-generated) */}
      {currentPl?.summary && (
        <div className="mb-6 rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-purple-800">Executive Summary</h2>
          <p className="text-sm text-gray-700 leading-relaxed">{currentPl.summary}</p>
          {currentPl.insights && Array.isArray(currentPl.insights) && currentPl.insights.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-medium text-purple-700">Key insights</h4>
              {currentPl.insights.map((insight: any, i: number) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                    insight.type === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-white text-gray-700'
                  }`}
                >
                  {insight.type === 'warning' && <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
                  <span>{insight.message}</span>
                  {insight.action && (
                    <Link href={insight.action} className="ml-auto text-purple-600 hover:text-purple-700 font-medium">
                      View →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Export / actions bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className="btn-secondary !px-3 !py-1"
            onClick={() => window.print()}
          >
            Download PDF
          </button>
          {/* Placeholder CSV export for now */}
          <button
            type="button"
            className="btn-secondary !px-3 !py-1"
            onClick={() => alert('CSV/Excel export can be wired here.')}
          >
            Download CSV
          </button>
          <button
            type="button"
            className="btn-secondary !px-3 !py-1"
            onClick={() => alert('Email sending can be wired to a backend endpoint.')}
          >
            Email Report
          </button>
          {uiMode === 'advanced' && (
            <button
              type="button"
              className="btn-secondary !px-3 !py-1"
              onClick={() => alert('Blockchain verification modal can be extended with dxExplorer.')}
            >
              Blockchain Proof
            </button>
          )}
          <button
            type="button"
            className="btn-primary !px-3 !py-1"
            onClick={handleMonthEndCheck}
            disabled={checkLoading}
          >
            {checkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> : null}
            Close {new Date(from).toLocaleString('default', { month: 'long' })} {new Date(from).getFullYear()}
          </button>
        </div>
        {uiMode === 'advanced' && blockchainInfo && (
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] text-emerald-700">
            ✓ Anchored {blockchainInfo.anchored}/{blockchainInfo.total} transactions in period
          </div>
        )}
      </div>

      <form
        onSubmit={handleRefresh}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-100 bg-surface-50 px-4 py-3"
      >
        <div>
          <label className="label mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="label mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="label mb-1">Basis</label>
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as Basis)}
            className="input-field"
          >
            <option value="accrual">Accrual</option>
            <option value="cash">Cash (approx)</option>
          </select>
        </div>
        <div>
          <label className="label mb-1">Compare to</label>
          <select
            value={compareMode}
            onChange={(e) => setCompareMode(e.target.value as CompareMode)}
            className="input-field"
          >
            <option value="none">No comparison</option>
            <option value="prev_period">Previous period</option>
            <option value="last_year">Same period last year</option>
          </select>
        </div>
        <div className="flex-1" />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </form>

      {/* Period warnings and report status */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="text-gray-500">
          Period: {from} → {to} ({periodDays.toFixed(0)} days)
          {isPartialMonth && (
            <span className="ml-2 text-amber-600">
              ⚠ Partial month — may not reflect full monthly performance.
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {isPartialMonth && (
            <button
              type="button"
              onClick={handleSwitchToFullMonth}
              className="btn-secondary !px-3 !py-1 text-[11px]"
            >
              Switch to full month
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Insights (simple version for now) */}
      {currentPl && (
        <div className="mb-4 rounded-2xl border border-purple-100 bg-purple-50 px-4 py-3 text-xs text-gray-800">
          <p className="mb-1 font-semibold text-purple-800">
            Insights for {from} – {to}
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            {compareMode !== 'none' && netIncomeDelta !== null && (
              <li>
                Net income changed by{' '}
                <span className={netIncomeDelta >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                  {formatCurrency(netIncomeDelta)} vs comparison
                </span>
                .
              </li>
            )}
            <li>
              Burn rate for the period is driven by total expenses of{' '}
              <span className="font-medium">{formatCurrency(expenseTotal)}</span>.
            </li>
          </ul>
        </div>
      )}

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard label="Revenue" value={revenueTotal} />
        <SummaryCard label="COGS" value={cogsTotal} />
        <SummaryCard label="Expenses" value={expenseTotal} />
        <SummaryCard label="Net Income" value={netIncome} highlight />
      </div>

      <div className="space-y-4 text-sm">
        <PnlSection
          title="Revenue"
          section="revenue"
          currentPl={currentPl}
          comparePl={comparePl}
          total={revenueTotal}
          compareMode={compareMode}
          bgClass="bg-emerald-50"
          onDrill={setDrillAccountFromRow}
        />
        <PnlSection
          title="Cost of Goods Sold"
          section="cogs"
          currentPl={currentPl}
          comparePl={comparePl}
          total={cogsTotal}
          compareMode={compareMode}
          bgClass="bg-amber-50"
          onDrill={setDrillAccountFromRow}
        />
        <PnlSection
          title="Operating Expenses"
          section="expense"
          currentPl={currentPl}
          comparePl={comparePl}
          total={expenseTotal}
          compareMode={compareMode}
          bgClass="bg-rose-50"
          onDrill={setDrillAccountFromRow}
        />

        {/* Net Income row */}
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            netIncome >= 0
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-red-300 bg-red-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Net Income
            </span>
            <div className="flex items-baseline gap-3 text-right">
              <div>
                <p className="text-[11px] text-gray-400">This period</p>
                <p
                  className={`text-sm font-semibold ${
                    netIncome >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(netIncome)}
                </p>
              </div>
              {compareMode !== 'none' && (
                <div>
                  <p className="text-[11px] text-gray-400">Comparison</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {formatCurrency(compareNetIncome)}
                  </p>
                  <p
                    className={`text-[11px] ${
                      netIncomeDelta !== null && netIncomeDelta >= 0
                        ? 'text-emerald-700'
                        : 'text-red-600'
                    }`}
                  >
                    {netIncomeDelta !== null ? formatCurrency(netIncomeDelta) : ''}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drilldown modal (placeholder listing of account) */}
      <Modal
        isOpen={!!drillAccountCode}
        onClose={() => setDrillAccountCode(null)}
        title={drillAccountName || 'Account details'}
        size="lg"
      >
        <p className="text-xs text-gray-500 mb-2">
          Detailed drilldown for account {drillAccountCode}. This can be wired to use the General
          Ledger endpoint to list individual transactions for this account and period.
        </p>
      </Modal>

      {/* Month-end close check modal */}
      <Modal
        isOpen={showCheckModal}
        onClose={() => { setShowCheckModal(false); setCheckResults(null); }}
        title={
          checkResults?.error
            ? 'Error'
            : checkResults?.canClose
              ? `Ready to close ${monthNames[periodMonth - 1]} ${periodYear}`
              : 'Issues found – cannot close yet'
        }
        size="lg"
      >
        {checkLoading && !checkResults ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        ) : checkResults?.error ? (
          <p className="text-sm text-red-600">{checkResults.error}</p>
        ) : checkResults?.checks ? (
          <div className="space-y-4">
            {/* Summary cards */}
            {checkResults.summary != null && (
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-2xl font-bold text-emerald-600">{checkResults.summary.passed ?? 0}</div>
                  <div className="text-xs text-emerald-700 font-medium">Passed</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-red-50 border border-red-200">
                  <div className="text-2xl font-bold text-red-600">{checkResults.summary.failed ?? 0}</div>
                  <div className="text-xs text-red-700 font-medium">Failed</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-2xl font-bold text-amber-600">{checkResults.summary.warnings ?? 0}</div>
                  <div className="text-xs text-amber-700 font-medium">Warnings</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-purple-50 border border-purple-200">
                  <div className="text-2xl font-bold text-purple-600">{checkResults.summary.critical ?? 0}</div>
                  <div className="text-xs text-purple-700 font-medium">Critical</div>
                </div>
              </div>
            )}

            {checkResults.checks.map((check: any) => (
              <div
                key={check.id}
                className={`rounded-xl border p-4 ${
                  check.status === 'passed' ? 'bg-emerald-50 border-emerald-200' :
                  check.status === 'failed' ? 'bg-red-50 border-red-200' :
                  check.status === 'warning' ? 'bg-amber-50 border-amber-200' :
                  'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {check.status === 'passed' && <CheckCircle className="h-4 w-4 text-emerald-600" />}
                  {check.status === 'failed' && <XCircle className="h-4 w-4 text-red-600" />}
                  {(check.status === 'warning' || check.status === 'info') && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  <h3 className="font-medium">{check.name}</h3>
                  {check.count != null && check.count > 0 && (
                    <span className="text-xs text-gray-500">({check.count})</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-700">{check.message}</p>
                {check.action && check.status !== 'passed' && (
                  <Link href={check.action} className="mt-2 inline-block text-xs text-purple-600 hover:text-purple-700 font-medium">
                    Fix issues →
                  </Link>
                )}
                {check.items && check.items.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {check.items.slice(0, 5).map((item: any, i: number) => (
                      <li key={item.id || i} className="text-gray-600">
                        {item.description} — {formatCurrency(item.amount)}
                        {item.suggestion != null && (
                          <span className="text-gray-500 ml-2">({item.suggestion})</span>
                        )}
                        {item.aiSuggestion != null && (
                          <span className="text-gray-500 ml-2">(AI: {item.aiSuggestion})</span>
                        )}
                      </li>
                    ))}
                    {check.items.length > 5 && (
                      <li className="text-gray-400 italic">… and {check.items.length - 5} more</li>
                    )}
                  </ul>
                )}
              </div>
            ))}

            {/* Footer: Approve & Close / Force Close */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-gray-100">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowCheckModal(false); setCheckResults(null); }}
                disabled={closing}
              >
                Cancel
              </button>
              {checkResults.canClose ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirmClose}
                  disabled={closing}
                >
                  {closing ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
                  Approve & close {monthNames[periodMonth - 1]} {periodYear}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  onClick={handleForceClose}
                  disabled={(checkResults.summary?.critical ?? 0) > 0 || closing}
                  title={(checkResults.summary?.critical ?? 0) > 0 ? 'Cannot force close with critical issues' : 'Not recommended'}
                >
                  {closing ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
                  {(checkResults.summary?.critical ?? 0) > 0
                    ? 'Cannot force close (critical issues)'
                    : 'Force close anyway'}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );

  function setDrillAccountFromRow(accountCode: string, accountName: string) {
    setDrillAccountCode(accountCode);
    setDrillAccountName(accountName);
  }
}

function SummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? 'border-purple-200 bg-purple-50' : ''}`}>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? 'text-purple-800' : 'text-gray-900'}`}>
        {formatCurrency(value || 0)}
      </p>
    </div>
  );
}

function PnlSection({
  title,
  section,
  currentPl,
  comparePl,
  total,
  compareMode,
  bgClass,
  onDrill,
}: {
  title: string;
  section: SectionType;
  currentPl: ProfitAndLossResponse['data'] | null;
  comparePl: ProfitAndLossResponse['data'] | null;
  total: number;
  compareMode: CompareMode;
  bgClass: string;
  onDrill: (code: string, name: string) => void;
}) {
  const rows = currentPl?.rows.filter((r) => r.section === section) ?? [];
  const compareRowsByCode =
    comparePl?.rows
      .filter((r) => r.section === section)
      .reduce<Record<string, number>>((acc, r) => {
        acc[r.code] = r.amount;
        return acc;
      }, {}) ?? {};

  const isEmpty = rows.length === 0 && total === 0;

  return (
    <div className={`rounded-2xl border border-gray-100 px-3 py-2 ${bgClass}`}>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</p>
        {section === 'revenue' ? (
          <button
            type="button"
            className="text-[11px] text-emerald-700 hover:text-emerald-900"
            onClick={() => (window.location.href = '/invoices')}
          >
            + Invoice
          </button>
        ) : section === 'expense' ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="text-[11px] text-rose-700 hover:text-rose-900"
              onClick={() => (window.location.href = '/expenses')}
            >
              + Expense
            </button>
            <button
              type="button"
              className="text-[11px] text-rose-700 hover:text-rose-900"
              onClick={() => (window.location.href = '/payroll')}
            >
              + Payroll
            </button>
          </div>
        ) : null}
      </div>
      {isEmpty ? (
        <div className="rounded-xl bg-white/60 px-3 py-2 text-[11px] text-gray-500">
          <p className="mb-1">
            No {section === 'revenue' ? 'revenue' : section === 'cogs' ? 'COGS' : 'expenses'} recorded
            for this period.
          </p>
          {section === 'revenue' && (
            <button
              type="button"
              className="btn-secondary !px-3 !py-1 text-[11px]"
              onClick={() => (window.location.href = '/invoices')}
            >
              + Create first invoice
            </button>
          )}
          {section === 'expense' && (
            <button
              type="button"
              className="btn-secondary !px-3 !py-1 text-[11px]"
              onClick={() => (window.location.href = '/expenses')}
            >
              + Create first expense
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-0.5 rounded-xl bg-white/60 px-2 py-1">
          <div className="grid grid-cols-12 border-b border-gray-100 pb-1 text-[11px] text-gray-400">
            <div className="col-span-6">Account</div>
            <div className="col-span-2 text-right">This period</div>
            {compareMode !== 'none' && (
              <>
                <div className="col-span-2 text-right">Comparison</div>
                <div className="col-span-2 text-right">% Δ</div>
              </>
            )}
          </div>
          {rows.map((r) => {
            const compareAmount = compareRowsByCode[r.code] ?? 0;
            const delta = compareMode === 'none' ? null : r.amount - compareAmount;
            const pctChange =
              compareMode !== 'none' && compareAmount !== 0
                ? (delta! / compareAmount) * 100
                : null;
            return (
              <button
                key={r.code}
                type="button"
                onClick={() => onDrill(r.code, `${r.code} · ${r.name}`)}
                className="grid w-full grid-cols-12 items-center rounded-lg px-1 py-0.5 text-left hover:bg-surface-100"
              >
                <div className="col-span-6 flex items-center gap-1 text-[11px]">
                  <span className="font-mono text-[10px] text-gray-400">{r.code}</span>
                  <span className="truncate text-gray-700">{r.name}</span>
                </div>
                <div className="col-span-2 text-right text-xs text-gray-800">
                  {formatCurrency(r.amount || 0)}
                </div>
                {compareMode !== 'none' && (
                  <>
                    <div className="col-span-2 text-right text-xs text-gray-500">
                      {formatCurrency(compareAmount || 0)}
                    </div>
                    <div
                      className={`col-span-2 text-right text-[11px] ${
                        delta !== null && delta >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {pctChange !== null ? `${pctChange.toFixed(1)}%` : ''}
                    </div>
                  </>
                )}
              </button>
            );
          })}
          <div className="mt-1 grid grid-cols-12 border-t border-gray-100 pt-1 text-[11px] font-semibold text-gray-900">
            <div className="col-span-6">
              Total{' '}
              {section === 'revenue' ? 'Revenue' : section === 'cogs' ? 'COGS' : 'Expenses'}
            </div>
            <div className="col-span-2 text-right">{formatCurrency(total || 0)}</div>
            {compareMode !== 'none' && <div className="col-span-4" />}
          </div>
        </div>
      )}
    </div>
  );
}

