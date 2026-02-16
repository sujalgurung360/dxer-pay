'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import {
  Receipt,
  FileText,
  Users,
  ScrollText,
  Shield,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  Wallet,
  ExternalLink,
  Copy,
  CheckCircle2,
  Link2,
  ArrowUpRight,
  Briefcase,
  TrendingUp,
} from 'lucide-react';
import { formatCurrency } from '@dxer/shared';
import { useUiMode } from '@/lib/ui-mode';

export default function DashboardPage() {
  const { user, currentOrg, refreshUser } = useAuth();
  const [pnl, setPnl] = useState<any | null>(null);
  const [burnRate, setBurnRate] = useState<any | null>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [chainHealth, setChainHealth] = useState<any>(null);
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [anchorJobs, setAnchorJobs] = useState<any[]>([]);
  const [unpaidInvoicesCount, setUnpaidInvoicesCount] = useState<number | null>(null);
  const [flaggedExpenses, setFlaggedExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletCopied, setWalletCopied] = useState(false);
  const [metamaskConnecting, setMetamaskConnecting] = useState(false);
  const [metamaskError, setMetamaskError] = useState('');
  const [uiMode] = useUiMode();

  useEffect(() => {
    if (!currentOrg) return;
    loadDashboard(uiMode === 'advanced');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg, uiMode]);

  async function loadDashboard(loadAnchoring: boolean) {
    setLoading(true);
    try {
      const today = new Date();
      const to = today.toISOString().slice(0, 10);
      const fromDate = new Date(today);
      fromDate.setDate(fromDate.getDate() - 30);
      const from = fromDate.toISOString().slice(0, 10);

      const results = await Promise.allSettled([
        api.accountancy.profitAndLoss({ from, to, basis: 'accrual' }),
        api.accountancy.burnRate({ from, to }),
        api.audit.list({ pageSize: '25' }),
        api.invoices.list({ status: 'sent', pageSize: '1' }),
        api.expenses.list({ filter: 'needs_review', pageSize: '5' }),
      ]);

      const [pnlRes, burnRes, auditRes, unpaidInvRes, flaggedRes] = results;
      if (pnlRes.status === 'fulfilled') setPnl(pnlRes.value.data);
      if (burnRes.status === 'fulfilled') setBurnRate(burnRes.value.data);
      if (auditRes.status === 'fulfilled') setLedger(auditRes.value.data || []);
      if (unpaidInvRes.status === 'fulfilled') setUnpaidInvoicesCount(unpaidInvRes.value.pagination?.total ?? null);
      if (flaggedRes.status === 'fulfilled') setFlaggedExpenses(flaggedRes.value.data || []); else setFlaggedExpenses([]);

      if (loadAnchoring) {
        Promise.all([
          api.anchoring.health(),
          api.anchoring.queue(),
          api.anchoring.jobs(),
        ])
          .then(([healthRes, queueRes, jobsRes]) => {
            setChainHealth(healthRes.data);
            setQueueStatus(queueRes.data);
            setAnchorJobs(jobsRes.data || []);
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load dashboard', err);
    } finally {
      setLoading(false);
    }
  }

  const copyWallet = useCallback(() => {
    if (currentOrg?.walletAddress) {
      navigator.clipboard.writeText(currentOrg.walletAddress);
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 2000);
    }
  }, [currentOrg?.walletAddress]);

  const connectMetamask = useCallback(async () => {
    setMetamaskError('');
    setMetamaskConnecting(true);
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        setMetamaskError('MetaMask not detected.');
        return;
      }
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts?.length) {
        setMetamaskError('No accounts found.');
        return;
      }
      const address = accounts[0];
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x13882' }],
        });
      } catch (sw: any) {
        if (sw.code === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x13882',
                chainName: 'Polygon Amoy Testnet',
                nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
                rpcUrls: ['https://rpc-amoy.polygon.technology'],
                blockExplorerUrls: ['https://amoy.polygonscan.com'],
              },
            ],
          });
        }
      }
      await api.orgs.connectMetamask(address);
      if (refreshUser) await refreshUser();
    } catch (err: any) {
      setMetamaskError(err.message || 'Failed to connect');
    } finally {
      setMetamaskConnecting(false);
    }
  }, [refreshUser]);

  // Derived KPI values (last 30 days)
  const revenue = pnl?.totals?.revenue ?? 0;
  const totalExpenses = (pnl?.totals?.cogs ?? 0) + (pnl?.totals?.expenses ?? 0);
  const netIncome = pnl?.totals?.netIncome ?? revenue - totalExpenses;
  const payrollExpense =
    (pnl?.rows ?? [])
      .filter((r: any) => r.section === 'expense' && (r.code === '6000' || r.code === '6010'))
      .reduce((sum: number, r: any) => sum + r.amount, 0) || 0;
  const cashflowNet = netIncome;
  const queueLength = queueStatus?.queueLength ?? 0;
  const anchorsProcessed = queueStatus?.totalProcessed ?? 0;
  const failedAnchors = queueStatus?.totalFailed ?? 0;

  const lastAnchorJob = anchorJobs[0];
  const lastAnchorHash: string | null =
    lastAnchorJob?.result?.polygonTxHash || lastAnchorJob?.result?.polygonTxhash || null;

  const alerts: string[] = [];
  if (uiMode === 'advanced') {
    if (chainHealth && (!chainHealth.multichain?.connected || !chainHealth.polygon?.connected)) {
      alerts.push('Blockchain connectivity issue');
    }
    if (failedAnchors > 0) {
      alerts.push(`${failedAnchors} failed anchor job${failedAnchors > 1 ? 's' : ''}`);
    }
    if (alerts.length === 0) {
      alerts.push('All systems nominal');
    }
  }

  return (
    <div>
      {/* Page Title */}
      <h1 className="text-4xl font-serif text-gray-900 mb-8">
        {currentOrg?.name || 'Dashboard'}
      </h1>

      {/* Row 1 — KPI strip */}
      <div className="mb-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Revenue (30d)"
          icon={TrendingUp}
          value={formatCurrency(revenue)}
        />
        <KpiCard
          label="Expenses (30d)"
          icon={Receipt}
          value={formatCurrency(totalExpenses)}
        />
        <KpiCard
          label="Payroll (30d)"
          icon={Users}
          value={formatCurrency(payrollExpense)}
        />
        <KpiCard
          label="Cashflow (30d)"
          icon={ArrowUpRight}
          value={formatCurrency(cashflowNet)}
          valueClassName={cashflowNet >= 0 ? 'text-emerald-600' : 'text-red-600'}
        />
        <KpiCard
          label="Unpaid Invoices"
          icon={FileText}
          value={
            unpaidInvoicesCount == null
              ? '—'
              : `${unpaidInvoicesCount} pending`
          }
        />
        {uiMode === 'advanced' && (
          <KpiCard
            label="Chain Queue"
            icon={Shield}
            value={`${queueLength} in queue`}
            helper={anchorsProcessed > 0 ? `${anchorsProcessed} anchored` : undefined}
          />
        )}
      </div>

      {/* Main layout: analytics + ledger + system sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Center column: cashflow + quick actions + ledger */}
        <div className="lg:col-span-9 space-y-6">
          {/* Row 2 — Cashflow vs Quick actions */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Cashflow chart (left) */}
            <div className="card lg:col-span-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-serif text-gray-900">Cashflow (last 30 days)</h2>
                {burnRate && (
                  <span className="text-xs rounded-full bg-surface-100 px-3 py-1 text-gray-500">
                    Burn {formatCurrency(burnRate.daily)} / day
                  </span>
                )}
              </div>
              {loading && !pnl ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  <CashflowBar
                    label="Revenue"
                    value={revenue}
                    max={Math.max(revenue, totalExpenses, 1)}
                    positive
                  />
                  <CashflowBar
                    label="Outflows"
                    value={totalExpenses}
                    max={Math.max(revenue, totalExpenses, 1)}
                  />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Net</span>
                    <span
                      className={
                        cashflowNet >= 0
                          ? 'text-emerald-600 font-medium'
                          : 'text-red-600 font-medium'
                      }
                    >
                      {cashflowNet >= 0 ? '+' : '-'}
                      {formatCurrency(Math.abs(cashflowNet))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Items Need Review + Quick actions (right) */}
            <div className="lg:col-span-4 space-y-4">
            {flaggedExpenses.length > 0 && (
              <div className="card">
                <h2 className="mb-3 text-lg font-serif text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Items Need Review ({flaggedExpenses.length})
                </h2>
                <div className="space-y-2">
                  {flaggedExpenses.slice(0, 5).map((expense: any) => (
                    <Link
                      key={expense.id}
                      href={`/expenses?filter=needs_review`}
                      className="flex items-center justify-between p-3 rounded-xl border border-amber-100 bg-amber-50/50 hover:bg-amber-50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">
                          {expense.description}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatCurrency(expense.amount)} · {(expense.flags?.[0]?.type || 'flag').replace(/_/g, ' ')}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-amber-700">Review</span>
                    </Link>
                  ))}
                  <Link
                    href="/expenses?filter=needs_review"
                    className="block w-full text-center text-sm text-purple-600 hover:text-purple-700 font-medium py-2"
                  >
                    View All Flagged Items
                  </Link>
                </div>
              </div>
            )}
            <div className="card">
              <h2 className="mb-3 text-lg font-serif text-gray-900">Quick actions</h2>
              <div className="space-y-2">
                <Link href="/invoices" className="btn-primary w-full justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    + Invoice
                  </span>
                  <ArrowUpRight className="h-3 w-3 opacity-60" />
                </Link>
                <Link href="/expenses" className="btn-primary w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    + Expense
                  </span>
                  <ArrowUpRight className="h-3 w-3 opacity-60" />
                </Link>
                <Link href="/payroll" className="btn-primary w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    + Payroll Run
                  </span>
                  <ArrowUpRight className="h-3 w-3 opacity-60" />
                </Link>
                <Link href="/accountancy/journals" className="btn-secondary w-full justify-between">
                  <span className="flex items-center gap-2">
                    <ScrollText className="h-4 w-4" />
                    + Journal Entry
                  </span>
                  <ArrowUpRight className="h-3 w-3 opacity-60" />
                </Link>
                <Link
                  href="/accountancy/bank-reconciliation"
                  className="btn-secondary w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Reconcile Bank
                  </span>
                  <ArrowUpRight className="h-3 w-3 opacity-60" />
                </Link>
                {uiMode === 'advanced' && (
                  <Link href="/anchoring" className="btn-secondary w-full justify-between">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Anchor Now
                    </span>
                    <ArrowUpRight className="h-3 w-3 opacity-60" />
                  </Link>
                )}
              </div>
            </div>
            </div>
          </div>

          {/* Row 3 — Ledger / Transactions table */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-serif text-gray-900">Ledger / Transactions</h2>
                <p className="text-xs text-gray-400">
                  Last 25 actions across expenses, invoices, payroll, production, and more.
                </p>
              </div>
              <Link
                href="/audit"
                className="text-xs text-purple-600 hover:text-purple-700 font-medium"
              >
                Open full audit log
              </Link>
            </div>
            {loading && ledger.length === 0 ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : ledger.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activity yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="py-2 pr-3 text-left">Date</th>
                      <th className="py-2 pr-3 text-left">Type</th>
                      <th className="py-2 pr-3 text-left">Counterparty</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2 pr-3 text-left">Status</th>
                      {uiMode === 'advanced' && (
                        <th className="py-2 text-right">Anchor</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.slice(0, 25).map((entry: any) => {
                      const amount = deriveEntryAmount(entry);
                      const amountSigned =
                        amount == null
                          ? null
                          : entry.entityType === 'expense' || entry.entityType === 'payroll'
                            ? -amount
                            : amount;
                      const counterparty = deriveEntryCounterparty(entry);
                      const anchored = entry.integrityStatus === 'anchored';
                      const status =
                        entry.action === 'void'
                          ? 'Voided'
                          : anchored
                            ? 'Posted'
                            : 'Pending';
                      return (
                        <tr key={entry.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="py-2 pr-3 text-xs text-gray-700 whitespace-nowrap capitalize">
                            {entry.entityType.replace(/_/g, ' ')}
                          </td>
                          <td className="py-2 pr-3 text-xs text-gray-700 truncate max-w-[160px]">
                            {counterparty}
                          </td>
                          <td className="py-2 pr-3 text-xs text-right font-mono">
                            {amountSigned == null ? '—' : formatLedgerAmount(amountSigned)}
                          </td>
                          <td className="py-2 pr-3 text-xs whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                                status === 'Voided'
                                  ? 'bg-red-50 text-red-600'
                                  : anchored
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {status === 'Voided' && <AlertTriangle className="h-3 w-3" />}
                              {status === 'Posted' && <ShieldCheck className="h-3 w-3" />}
                              {status === 'Pending' && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              <span className="text-[10px] font-medium uppercase tracking-wide">
                                {status}
                              </span>
                            </span>
                          </td>
                          {uiMode === 'advanced' && (
                            <td className="py-2 text-right">
                              {anchored ? (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                  <ShieldCheck className="h-3 w-3" />
                                  Anchored
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                                  <Shield className="h-3 w-3" />
                                  Pending
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar — Wallet + Chain + Alerts + Queue (advanced mode only) */}
        {uiMode === 'advanced' && (
        <div className="lg:col-span-3 space-y-4">
          {/* Wallet */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-gray-900">Wallet</h3>
            </div>

            {currentOrg?.walletAddress ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-purple-50 p-3">
                  <p className="text-[10px] font-semibold text-purple-400 mb-1 uppercase tracking-wider">
                    Polygon Address
                  </p>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 truncate text-xs font-mono text-purple-800">
                      {currentOrg.walletAddress}
                    </code>
                    <button
                      onClick={copyWallet}
                      className="text-purple-300 hover:text-purple-600 transition-colors"
                    >
                      {walletCopied ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <a
                      href={`https://amoy.polygonscan.com/address/${currentOrg.walletAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-300 hover:text-purple-600 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                {currentOrg.metamaskAddress ? (
                  <div className="rounded-2xl bg-orange-50 p-3">
                    <p className="text-[10px] font-semibold text-orange-400 mb-1 uppercase tracking-wider">
                      MetaMask
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Link2 className="h-3 w-3 text-emerald-500" />
                      <code className="flex-1 truncate text-xs font-mono text-orange-800">
                        {currentOrg.metamaskAddress}
                      </code>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={connectMetamask}
                    disabled={metamaskConnecting}
                    className="btn-primary w-full gap-2 !text-xs"
                  >
                    {metamaskConnecting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wallet className="h-3.5 w-3.5" />
                    )}
                    Connect MetaMask
                  </button>
                )}
                {metamaskError && (
                  <p className="text-xs text-red-500">{metamaskError}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No wallet generated for this organization.</p>
            )}
          </div>

          {/* Chain status */}
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Chain status</h3>
            <div className="space-y-2 text-xs font-medium">
              <div
                className={`flex items-center gap-2 rounded-xl p-2.5 ${
                  chainHealth?.multichain?.connected
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    chainHealth?.multichain?.connected ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
                Multichain
                <span className="ml-auto">
                  {chainHealth?.multichain?.connected ? 'Online' : 'Offline'}
                </span>
              </div>
              <div
                className={`flex items-center gap-2 rounded-xl p-2.5 ${
                  chainHealth?.polygon?.connected
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    chainHealth?.polygon?.connected ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
                Polygon Amoy
                <span className="ml-auto">
                  {chainHealth?.polygon?.connected ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-surface-50 p-2.5 text-gray-600">
                <Shield className="h-3.5 w-3.5 text-purple-500" />
                Last anchor
                <span className="ml-auto truncate text-[11px] font-mono">
                  {lastAnchorHash ? truncateMiddle(lastAnchorHash, 10) : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Queue + Alerts */}
          <div className="card space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Queue</h3>
              <p className="text-xs text-gray-500 mb-2">
                Auto-anchoring jobs in memory.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-surface-50 p-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                    Pending
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {queueLength}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-50 p-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                    Anchored
                  </p>
                  <p className="text-sm font-semibold text-emerald-700">
                    {anchorsProcessed}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-50 p-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                    Failed
                  </p>
                  <p className="text-sm font-semibold text-red-600">
                    {failedAnchors}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Alerts</h3>
              <ul className="space-y-1">
                {alerts.map((msg, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-xs text-gray-700"
                  >
                    {msg.includes('issue') || msg.includes('failed') ? (
                      <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5" />
                    ) : (
                      <ShieldCheck className="h-3 w-3 text-emerald-500 mt-0.5" />
                    )}
                    <span>{msg}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

/* ── Helper components / functions ───────────────────────────── */

function KpiCard({
  label,
  value,
  icon: Icon,
  valueClassName,
  helper,
}: {
  label: string;
  value: string;
  icon: any;
  valueClassName?: string;
  helper?: string;
}) {
  return (
    <div className="card !p-3 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
        <Icon className="h-3.5 w-3.5 text-gray-300" />
      </div>
      <p className={`text-sm font-semibold text-gray-900 ${valueClassName || ''}`}>{value}</p>
      {helper && <p className="text-[11px] text-gray-400">{helper}</p>}
    </div>
  );
}

function CashflowBar({
  label,
  value,
  max,
  positive,
}: {
  label: string;
  value: number;
  max: number;
  positive?: boolean;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const width = `${Math.max(5, ratio * 100)}%`;
  const barClass = positive ? 'bg-emerald-500' : 'bg-gray-800';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span className="font-mono">{formatCurrency(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
        <div className={`h-full rounded-full ${barClass}`} style={{ width }} />
      </div>
    </div>
  );
}

function deriveEntryAmount(entry: any): number | null {
  const after = entry.after || {};
  if (entry.entityType === 'expense' && typeof after.amount === 'number') {
    return after.amount;
  }
  if (entry.entityType === 'invoice' && typeof after.total === 'number') {
    return after.total;
  }
  if (entry.entityType === 'payroll' && typeof after.totalAmount === 'number') {
    return after.totalAmount;
  }
  return null;
}

function deriveEntryCounterparty(entry: any): string {
  const after = entry.after || {};
  return (
    after.customerName ||
    after.customer_name ||
    after.vendorName ||
    after.vendor_name ||
    after.employeeName ||
    after.employee_name ||
    after.counterparty ||
    entry.userName ||
    '-'
  );
}

function formatLedgerAmount(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function truncateMiddle(value: string, visible = 8): string {
  if (!value || value.length <= visible * 2) return value;
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

