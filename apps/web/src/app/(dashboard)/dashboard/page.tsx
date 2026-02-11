'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import {
  Receipt, FileText, Users, Factory, ScrollText, Shield, ShieldCheck,
  Loader2, AlertTriangle, Wallet, ExternalLink, Copy, CheckCircle2,
  Link2, Calendar, Clock, ArrowUpRight, Briefcase, Building2,
  Mail, MapPin, TrendingUp, Globe, Phone, Search, Filter, Plus,
} from 'lucide-react';
import { formatCurrency } from '@dxer/shared';

/** Map employee index to their photo */
const EMPLOYEE_PHOTOS = ['/employee-1.png', '/employee-2.png', '/employee-3.png'];
function getEmployeePhoto(index: number): string {
  return EMPLOYEE_PHOTOS[index % EMPLOYEE_PHOTOS.length];
}

export default function DashboardPage() {
  const { user, currentOrg, refreshUser } = useAuth();
  const [stats, setStats] = useState({
    expenses: { total: 0, amount: 0 },
    invoices: { total: 0, amount: 0 },
    payrolls: { total: 0, amount: 0 },
    batches: { total: 0 },
    auditEntries: { total: 0 },
  });
  const [recentAudit, setRecentAudit] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [chainHealth, setChainHealth] = useState<any>(null);
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [walletCopied, setWalletCopied] = useState(false);
  const [metamaskConnecting, setMetamaskConnecting] = useState(false);
  const [metamaskError, setMetamaskError] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  useEffect(() => {
    if (!currentOrg) return;
    loadDashboard();
  }, [currentOrg]);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [expRes, invRes, payRes, batchRes, auditRes] = await Promise.all([
        api.expenses.list({ pageSize: '1' }),
        api.invoices.list({ pageSize: '1' }),
        api.payrolls.list({ pageSize: '1' }),
        api.batches.list({ pageSize: '1' }),
        api.audit.list({ pageSize: '8' }),
      ]);
      setStats({
        expenses: { total: expRes.pagination.total, amount: expRes.data.reduce((s: number, e: any) => s + e.amount, 0) },
        invoices: { total: invRes.pagination.total, amount: invRes.data.reduce((s: number, i: any) => s + i.total, 0) },
        payrolls: { total: payRes.pagination.total, amount: payRes.data.reduce((s: number, p: any) => s + p.totalAmount, 0) },
        batches: { total: batchRes.pagination.total },
        auditEntries: { total: auditRes.pagination.total },
      });
      setRecentAudit(auditRes.data);
      try {
        const empRes = await api.employees.list({ pageSize: '10' });
        setEmployees(empRes.data || []);
        if (empRes.data?.length > 0) setSelectedEmployee({ ...empRes.data[0], _photoIndex: 0 });
      } catch {}
      try {
        const [healthRes, queueRes] = await Promise.all([api.anchoring.health(), api.anchoring.queue()]);
        setChainHealth(healthRes.data);
        setQueueStatus(queueRes.data);
      } catch {}
    } catch (err) { console.error('Failed to load dashboard', err); }
    finally { setLoading(false); }
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
      if (!ethereum) { setMetamaskError('MetaMask not detected.'); return; }
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts?.length) { setMetamaskError('No accounts found.'); return; }
      const address = accounts[0];
      try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x13882' }] });
      } catch (sw: any) {
        if (sw.code === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: '0x13882', chainName: 'Polygon Amoy Testnet', nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 }, rpcUrls: ['https://rpc-amoy.polygon.technology'], blockExplorerUrls: ['https://amoy.polygonscan.com'] }],
          });
        }
      }
      await api.orgs.connectMetamask(address);
      if (refreshUser) await refreshUser();
    } catch (err: any) { setMetamaskError(err.message || 'Failed to connect'); }
    finally { setMetamaskConnecting(false); }
  }, [refreshUser]);

  const today = new Date();
  const monthName = today.toLocaleString('default', { month: 'long' });
  const year = today.getFullYear();
  const daysInMonth = new Date(year, today.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, today.getMonth(), 1).getDay();
  const adjustedFirst = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < adjustedFirst; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const totalRecords = stats.expenses.total + stats.invoices.total;

  return (
    <div>
      {/* Page Title — Crextio style serif */}
      <h1 className="text-4xl font-serif text-gray-900 mb-8">
        {currentOrg?.name || 'Dashboard'}
      </h1>

      {/* ─── 3-Column Layout ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ──── LEFT: Employee List (Crextio style) ──────── */}
        <div className="lg:col-span-3 space-y-4">
          {loading ? (
            <div className="card flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
            </div>
          ) : employees.length === 0 ? (
            <div className="card text-center py-12">
              <Users className="mx-auto h-10 w-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400 mb-2">No employees yet</p>
              <Link href="/payroll" className="text-sm text-purple-600 font-semibold hover:text-purple-700">
                Add employees
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {employees.map((emp: any, idx: number) => (
                <button
                  key={emp.id}
                  onClick={() => setSelectedEmployee({ ...emp, _photoIndex: idx })}
                  className={`w-full flex items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                    selectedEmployee?.id === emp.id
                      ? 'bg-white border border-purple-100 shadow-card-md'
                      : 'hover:bg-white hover:shadow-card'
                  }`}
                >
                  {/* Circular photo avatar */}
                  <div className="h-11 w-11 overflow-hidden rounded-full ring-2 ring-purple-100 flex-shrink-0">
                    <Image
                      src={getEmployeePhoto(idx)}
                      alt={emp.fullName || 'Employee'}
                      width={44}
                      height={44}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{emp.fullName}</p>
                    <p className="truncate text-xs text-gray-400">{emp.position || emp.department || 'Employee'}</p>
                  </div>
                  {/* Progress bar — Crextio style */}
                  <div className="w-16 flex-shrink-0">
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-gray-800" style={{ width: `${60 + (emp.fullName?.charCodeAt(0) || 0) % 40}%` }} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Chain Status */}
          {chainHealth && (
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Chain Status</h3>
              <div className="space-y-2">
                <div className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-medium ${
                  chainHealth.multichain?.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                }`}>
                  <div className={`h-2 w-2 rounded-full ${chainHealth.multichain?.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  Multichain
                  <span className="ml-auto">{chainHealth.multichain?.connected ? 'Online' : 'Offline'}</span>
                </div>
                <div className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-medium ${
                  chainHealth.polygon?.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                }`}>
                  <div className={`h-2 w-2 rounded-full ${chainHealth.polygon?.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  Polygon Amoy
                  <span className="ml-auto">{chainHealth.polygon?.connected ? 'Online' : 'Offline'}</span>
                </div>
                {queueStatus && (
                  <div className="flex items-center gap-2 rounded-xl bg-purple-50 p-2.5 text-xs font-medium text-purple-700">
                    <div className="h-2 w-2 rounded-full bg-purple-500" />
                    Queue
                    <span className="ml-auto">{queueStatus.totalProcessed} anchored</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ──── CENTER: Toolbar + Stats + Calendar + Activity ─ */}
        <div className="lg:col-span-6 space-y-6">
          {/* Toolbar row — Crextio style with icons + search */}
          <div className="card !p-4">
            <div className="flex items-center gap-3">
              <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-100 text-gray-400 hover:text-purple-600 transition-colors">
                <Clock className="h-4 w-4" />
              </button>
              <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-100 text-gray-400 hover:text-purple-600 transition-colors">
                <TrendingUp className="h-4 w-4" />
              </button>
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input type="text" placeholder="Search" className="w-full rounded-xl border border-gray-100 bg-surface-50 pl-9 pr-4 py-2 text-sm text-gray-600 placeholder:text-gray-300 focus:border-purple-300 focus:ring-1 focus:ring-purple-100 transition-all" />
              </div>
              <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-100 text-gray-400 hover:text-purple-600 transition-colors">
                <Filter className="h-4 w-4" />
              </button>
              <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-100 text-gray-400 hover:text-purple-600 transition-colors">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Stats summary — Crextio style large number + status bars */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-3xl font-serif text-gray-900">
                  {stats.auditEntries.total} events <span className="text-gray-300">/</span>{' '}
                  <span className="text-purple-600">{formatCurrency(stats.expenses.amount + stats.invoices.amount)}</span>
                </p>
              </div>
              <span className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-gray-500">
                {monthName} <ChevronIcon />
              </span>
            </div>

            {/* Status bars — Crextio exact style */}
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs text-gray-400 w-16">Records</span>
              <span className="text-xs text-gray-400 w-16 text-center">Payrolls</span>
              <span className="text-xs text-gray-400 w-16 text-center">Batches</span>
            </div>
            <div className="flex gap-2 mb-6">
              <div className="flex-[3] rounded-full bg-purple-500 py-2.5 px-4 text-center">
                <span className="text-sm font-semibold text-white">{totalRecords} records</span>
              </div>
              <div className="flex-1 rounded-full bg-gray-800 py-2.5 px-4 text-center">
                <span className="text-sm font-semibold text-white">{stats.payrolls.total} payrolls</span>
              </div>
              <div className="flex-1 rounded-full bg-amber-400 py-2.5 px-4 text-center">
                <span className="text-sm font-semibold text-white">{stats.batches.total} batches</span>
              </div>
            </div>

            {/* Mini Calendar — Crextio exact style */}
            <div className="grid grid-cols-7 gap-0 text-center">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className={`text-xs font-semibold py-2 ${d === 'Sat' || d === 'Sun' ? 'text-purple-500' : 'text-gray-400'}`}>
                  {d}
                </div>
              ))}
              {calendarDays.map((day, i) => {
                const isToday = day === today.getDate();
                const isWeekend = (i % 7 === 5) || (i % 7 === 6);
                return (
                  <div
                    key={i}
                    className={`py-3 text-sm font-medium transition-colors relative ${
                      !day ? '' :
                      isToday ? '' :
                      isWeekend ? 'text-purple-400' :
                      'text-gray-700 hover:bg-surface-100 rounded-xl cursor-pointer'
                    }`}
                  >
                    {isToday && day ? (
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white font-semibold shadow-purple">
                        {day}
                      </span>
                    ) : (
                      day || ''
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-serif text-gray-900">Recent Activity</h2>
              <Link href="/audit" className="text-sm text-purple-600 hover:text-purple-700 font-medium">View all</Link>
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-purple-500" /></div>
            ) : recentAudit.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activity yet.</p>
            ) : (
              <div className="space-y-1">
                {recentAudit.map((entry: any) => (
                  <div key={entry.id} className="flex items-center gap-3 rounded-2xl p-3 hover:bg-surface-50 transition-colors">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                      entry.action === 'create' ? 'bg-emerald-50 text-emerald-600' :
                      entry.action === 'update' || entry.action === 'status_change' ? 'bg-blue-50 text-blue-600' :
                      entry.action === 'void' ? 'bg-red-50 text-red-500' :
                      'bg-gray-50 text-gray-400'
                    }`}>
                      {entry.action === 'create' ? <ArrowUpRight className="h-3.5 w-3.5" /> :
                       entry.action === 'void' ? <AlertTriangle className="h-3.5 w-3.5" /> :
                       <TrendingUp className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        <span className="capitalize">{entry.action.replace(/_/g, ' ')}</span>{' '}
                        <span className="text-gray-400">{entry.entityType.replace(/_/g, ' ')}</span>
                      </p>
                      <p className="text-xs text-gray-400">{entry.userName}</p>
                    </div>
                    <span className="text-xs text-gray-300 flex-shrink-0">
                      {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ──── RIGHT: Selected Employee Profile ──────── */}
        <div className="lg:col-span-3 space-y-6">
          {/* Employee Profile Card — changes on click */}
          {selectedEmployee ? (
            <div className="card !p-0 overflow-hidden">
              {/* Large photo avatar — centered, Crextio style */}
              <div className="flex justify-center pt-8 pb-4">
                <div className="h-28 w-28 overflow-hidden rounded-3xl ring-4 ring-purple-100 shadow-card-lg">
                  <Image
                    src={getEmployeePhoto(selectedEmployee._photoIndex ?? 0)}
                    alt={selectedEmployee.fullName || 'Employee'}
                    width={112}
                    height={112}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="text-center pb-4">
                <h3 className="text-xl font-serif text-gray-900">{selectedEmployee.fullName}</h3>
                <p className="text-sm text-gray-400">{selectedEmployee.position || selectedEmployee.department || 'Employee'}</p>
              </div>

              {/* Basic Information — Crextio dotted rows */}
              <div className="px-6 pb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Basic Information</h4>
                <div className="space-y-0">
                  <DottedInfoRow icon={Building2} label="Department" value={selectedEmployee.department || 'N/A'} />
                  <DottedInfoRow icon={Phone} label="Phone number" value={selectedEmployee.phone || 'N/A'} />
                  <DottedInfoRow icon={Mail} label="E-Mail" value={selectedEmployee.email || 'N/A'} />
                  <DottedInfoRow icon={Briefcase} label="Position" value={selectedEmployee.position || 'N/A'} />
                  <DottedInfoRow icon={MapPin} label="Status" value={selectedEmployee.status === 'active' ? 'Active' : selectedEmployee.status || 'Active'} />
                  <DottedInfoRow icon={Clock} label="Hired" value={selectedEmployee.hireDate ? new Date(selectedEmployee.hireDate).toLocaleDateString() : 'N/A'} />
                </div>
              </div>

              {/* Documents — Crextio style */}
              <div className="px-6 pb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Documents</h4>
                <div className="flex gap-3">
                  <button className="flex-1 flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-surface-50 p-3 hover:border-purple-200 hover:bg-purple-50 transition-all group">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-semibold text-gray-800 group-hover:text-purple-700">Resume</p>
                      <p className="text-[10px] text-gray-400">PDF</p>
                    </div>
                  </button>
                  <button className="flex-1 flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-surface-50 p-3 hover:border-purple-200 hover:bg-purple-50 transition-all group">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50">
                      <Users className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-semibold text-gray-800 group-hover:text-purple-700">Open Teams</p>
                      <p className="text-[10px] text-gray-400">Chat</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Statistics — Crextio style */}
              <div className="px-6 pb-6">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Statistics</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Records created</span>
                    <span className="text-sm font-semibold text-gray-800">{Math.floor(10 + (selectedEmployee.fullName?.charCodeAt(0) || 0) % 30)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-purple-500" style={{ width: `${40 + (selectedEmployee.fullName?.charCodeAt(0) || 0) % 50}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Anchored actions</span>
                    <span className="text-sm font-semibold text-gray-800">{Math.floor(5 + (selectedEmployee.fullName?.charCodeAt(1) || 0) % 15)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${30 + (selectedEmployee.fullName?.charCodeAt(1) || 0) % 40}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Fallback: show logged-in user when no employee selected */
            <div className="card !p-0 overflow-hidden">
              <div className="flex justify-center pt-8 pb-4">
                <div className="h-28 w-28 overflow-hidden rounded-3xl ring-4 ring-purple-100 shadow-card-lg">
                  <Image
                    src="/profile-photo.png"
                    alt={user?.fullName || 'Profile'}
                    width={112}
                    height={112}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="text-center pb-4">
                <h3 className="text-xl font-serif text-gray-900">{user?.fullName || 'User'}</h3>
                <p className="text-sm text-gray-400">{currentOrg?.role || 'Member'}</p>
              </div>
              <div className="px-6 pb-6">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Basic Information</h4>
                <div className="space-y-0">
                  <DottedInfoRow icon={Building2} label="Organization" value={currentOrg?.name || 'N/A'} />
                  <DottedInfoRow icon={Mail} label="E-Mail" value={user?.email || ''} />
                  <DottedInfoRow icon={Briefcase} label="Role" value={currentOrg?.role || 'N/A'} />
                </div>
              </div>
            </div>
          )}

          {/* Wallet Card */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-gray-900">Polygon Wallet</h3>
            </div>

            {currentOrg?.walletAddress ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-purple-50 p-3">
                  <p className="text-[10px] font-semibold text-purple-400 mb-1 uppercase tracking-wider">DXER Address</p>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 truncate text-xs font-mono text-purple-800">
                      {currentOrg.walletAddress}
                    </code>
                    <button onClick={copyWallet} className="text-purple-300 hover:text-purple-600 transition-colors">
                      {walletCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a href={`https://amoy.polygonscan.com/address/${currentOrg.walletAddress}`} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-purple-600 transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                {currentOrg.metamaskAddress ? (
                  <div className="rounded-2xl bg-orange-50 p-3">
                    <p className="text-[10px] font-semibold text-orange-400 mb-1 uppercase tracking-wider">MetaMask</p>
                    <div className="flex items-center gap-1.5">
                      <Link2 className="h-3 w-3 text-emerald-500" />
                      <code className="flex-1 truncate text-xs font-mono text-orange-800">
                        {currentOrg.metamaskAddress}
                      </code>
                    </div>
                  </div>
                ) : (
                  <button onClick={connectMetamask} disabled={metamaskConnecting} className="btn-primary w-full gap-2 !text-xs">
                    {metamaskConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                    Connect MetaMask
                  </button>
                )}
                {metamaskError && <p className="text-xs text-red-500">{metamaskError}</p>}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No wallet generated.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helper Components ────────────────────────── */

function ChevronIcon() {
  return <span className="text-gray-300 ml-1">&#9662;</span>;
}

/** Crextio-style dotted info row */
function DottedInfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="info-row">
      <span className="info-label">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="info-dots" />
      <span className="info-value">{value}</span>
    </div>
  );
}
