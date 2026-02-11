'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, Send, Loader2, CheckCircle2, Clock,
  Shield, FileText, Wallet, User, Mail, Briefcase,
  Building2, DollarSign, Copy, ExternalLink, RefreshCw,
  AlertCircle, ChevronDown, ChevronUp, Link2, ShieldCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type OnboardingStatus = 'invited' | 'registered' | 'verified' | 'contract_signed' | 'completed';

type PipelineEmployee = {
  id: string;
  fullName: string;
  email: string;
  position: string | null;
  department: string | null;
  salary: number;
  currency: string;
  onboardingStatus: OnboardingStatus;
  walletAddress: string | null;
  isActive: boolean;
  inviteExpiresAt: string | null;
  contractSignedAt: string | null;
  polygonTxhash: string | null;
  createdAt: string;
};

const STATUS_CONFIG: Record<OnboardingStatus, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  invited: {
    label: 'Invited',
    icon: <Mail className="h-3.5 w-3.5" />,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  registered: {
    label: 'Registered',
    icon: <User className="h-3.5 w-3.5" />,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  verified: {
    label: 'ID Verified',
    icon: <Shield className="h-3.5 w-3.5" />,
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
  contract_signed: {
    label: 'Contract Signed',
    icon: <FileText className="h-3.5 w-3.5" />,
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
};

export default function HiringPage() {
  const { currentOrg } = useAuth();
  const [pipeline, setPipeline] = useState<PipelineEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [generatingWallet, setGeneratingWallet] = useState<string | null>(null);

  // Invite form fields
  const [invEmail, setInvEmail] = useState('');
  const [invFullName, setInvFullName] = useState('');
  const [invPosition, setInvPosition] = useState('');
  const [invDepartment, setInvDepartment] = useState('');
  const [invSalary, setInvSalary] = useState('');
  const [invCurrency, setInvCurrency] = useState('USD');

  // Last created onboarding URL
  const [onboardingUrl, setOnboardingUrl] = useState('');

  const loadPipeline = useCallback(async () => {
    try {
      const res = await api.hiring.pipeline();
      setPipeline(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load hiring pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setInviting(true);

    try {
      const res = await api.hiring.invite({
        email: invEmail,
        fullName: invFullName,
        position: invPosition || undefined,
        department: invDepartment || undefined,
        salary: invSalary ? parseFloat(invSalary) : undefined,
        currency: invCurrency,
      });

      setOnboardingUrl(res.data.onboardingUrl);
      if (res.data.emailSent) {
        setSuccess(`Invitation email sent to ${invEmail}! The employee will receive the onboarding link in their inbox.`);
      } else {
        setSuccess(`Invite created for ${invEmail}, but email delivery is not configured (SMTP not set up). Share the onboarding link below manually.`);
      }

      // Reset form
      setInvEmail('');
      setInvFullName('');
      setInvPosition('');
      setInvDepartment('');
      setInvSalary('');
      setShowInviteForm(false);

      // Reload pipeline
      await loadPipeline();
    } catch (err: any) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleGenerateWallet = async (employeeId: string) => {
    setGeneratingWallet(employeeId);
    try {
      await api.hiring.generateWallet(employeeId);
      await loadPipeline();
      setSuccess('Wallet generated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to generate wallet');
    } finally {
      setGeneratingWallet(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const isAdmin = currentOrg?.role === 'owner' || currentOrg?.role === 'admin';

  // Group by status for pipeline visualization
  const statusOrder: OnboardingStatus[] = ['invited', 'registered', 'verified', 'contract_signed', 'completed'];
  const statusCounts = statusOrder.reduce((acc, status) => {
    acc[status] = pipeline.filter((e) => e.onboardingStatus === status).length;
    return acc;
  }, {} as Record<OnboardingStatus, number>);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-gray-900">Hiring</h1>
          <p className="mt-1 text-sm text-gray-400">Invite employees and track their onboarding progress</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setLoading(true); loadPipeline(); }}
            className="btn-secondary gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowInviteForm(!showInviteForm)}
              className="btn-primary gap-1.5"
            >
              <UserPlus className="h-4 w-4" />
              Invite Employee
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-600 font-medium flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {success && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-600 font-medium flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {success}
          <button onClick={() => setSuccess('')} className="ml-auto text-emerald-400 hover:text-emerald-600">&times;</button>
        </div>
      )}

      {/* Onboarding URL after invite */}
      {onboardingUrl && (
        <div className="card border-2 border-purple-200 bg-purple-50/50">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-semibold text-purple-700">Employee Onboarding Link</span>
          </div>
          <p className="text-xs text-purple-500 mb-2">Copy and share this link with the employee, or check their email if SMTP is configured:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl bg-white px-3 py-2 font-mono text-xs text-gray-600 border border-purple-100">
              {onboardingUrl}
            </code>
            <button
              onClick={() => copyToClipboard(onboardingUrl, 'url')}
              className="rounded-lg p-2 text-purple-500 hover:bg-purple-100 transition-colors"
            >
              {copied === 'url' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Invite Form */}
      {showInviteForm && isAdmin && (
        <div className="card">
          <h2 className="text-lg font-serif text-gray-900 mb-4 flex items-center gap-2">
            <Send className="h-5 w-5 text-purple-500" />
            Send Employee Invitation
          </h2>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Full Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={invFullName}
                  onChange={(e) => setInvFullName(e.target.value)}
                  className="input-field mt-1.5"
                  placeholder="Jane Smith"
                  required
                />
              </div>
              <div>
                <label className="label">Email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={invEmail}
                  onChange={(e) => setInvEmail(e.target.value)}
                  className="input-field mt-1.5"
                  placeholder="jane@example.com"
                  required
                />
              </div>
              <div>
                <label className="label">Position</label>
                <input
                  type="text"
                  value={invPosition}
                  onChange={(e) => setInvPosition(e.target.value)}
                  className="input-field mt-1.5"
                  placeholder="Software Engineer"
                />
              </div>
              <div>
                <label className="label">Department</label>
                <input
                  type="text"
                  value={invDepartment}
                  onChange={(e) => setInvDepartment(e.target.value)}
                  className="input-field mt-1.5"
                  placeholder="Engineering"
                />
              </div>
              <div>
                <label className="label">Salary</label>
                <input
                  type="number"
                  value={invSalary}
                  onChange={(e) => setInvSalary(e.target.value)}
                  className="input-field mt-1.5"
                  placeholder="75000"
                  step="0.01"
                />
              </div>
              <div>
                <label className="label">Currency</label>
                <select
                  value={invCurrency}
                  onChange={(e) => setInvCurrency(e.target.value)}
                  className="input-field mt-1.5"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="NPR">NPR</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowInviteForm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="btn-primary gap-1.5"
              >
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {inviting ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pipeline Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statusOrder.map((status) => {
          const config = STATUS_CONFIG[status];
          return (
            <div key={status} className={`rounded-2xl border ${config.border} ${config.bg} p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={config.color}>{config.icon}</span>
                <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
              </div>
              <p className="text-2xl font-serif text-gray-900">{statusCounts[status]}</p>
            </div>
          );
        })}
      </div>

      {/* Pipeline List */}
      {loading ? (
        <div className="card flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
        </div>
      ) : pipeline.length === 0 ? (
        <div className="card text-center py-12">
          <UserPlus className="mx-auto h-10 w-10 text-gray-200 mb-3" />
          <h3 className="text-lg font-serif text-gray-500">No employees in the pipeline</h3>
          <p className="text-sm text-gray-400 mt-1">
            Click &quot;Invite Employee&quot; to start the hiring process
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pipeline.map((emp) => {
            const config = STATUS_CONFIG[emp.onboardingStatus];
            const isExpanded = expandedEmployee === emp.id;

            return (
              <div key={emp.id} className="card !p-0 overflow-hidden">
                {/* Main row */}
                <button
                  onClick={() => setExpandedEmployee(isExpanded ? null : emp.id)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-surface-50 transition-colors"
                >
                  {/* Avatar */}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${config.bg} flex-shrink-0`}>
                    <span className={`text-sm font-semibold ${config.color}`}>
                      {emp.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{emp.fullName}</p>
                    <p className="text-xs text-gray-400 truncate">{emp.email}</p>
                  </div>

                  {/* Position */}
                  <div className="hidden md:block text-right min-w-0">
                    <p className="text-xs text-gray-500">{emp.position || '-'}</p>
                    <p className="text-xs text-gray-400">{emp.department || '-'}</p>
                  </div>

                  {/* Status Badge */}
                  <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${config.bg} ${config.color} border ${config.border}`}>
                    {config.icon}
                    {config.label}
                  </div>

                  {/* Expand */}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-surface-50 p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Salary</p>
                        <p className="text-sm font-medium text-gray-800">
                          {emp.salary > 0 ? `${emp.salary.toLocaleString()} ${emp.currency}` : 'Not set'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Invited</p>
                        <p className="text-sm font-medium text-gray-800">
                          {new Date(emp.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Invite Expires</p>
                        <p className="text-sm font-medium text-gray-800">
                          {emp.inviteExpiresAt
                            ? new Date(emp.inviteExpiresAt).toLocaleDateString()
                            : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {emp.contractSignedAt && (
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Contract Signed</p>
                        <p className="text-sm font-medium text-gray-800">
                          {new Date(emp.contractSignedAt).toLocaleString()}
                        </p>
                      </div>
                    )}

                    {/* Wallet address */}
                    {emp.walletAddress ? (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Polygon Wallet Address</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 truncate rounded-xl bg-white px-3 py-2 font-mono text-xs text-gray-600 border border-gray-200">
                            {emp.walletAddress}
                          </code>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(emp.walletAddress!, emp.id);
                            }}
                            className="rounded-lg p-2 text-gray-400 hover:text-purple-600 hover:bg-white transition-colors"
                          >
                            {copied === emp.id ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                          </button>
                          <a
                            href={`https://amoy.polygonscan.com/address/${emp.walletAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-lg p-2 text-gray-400 hover:text-purple-600 hover:bg-white transition-colors"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      isAdmin && emp.onboardingStatus !== 'invited' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateWallet(emp.id);
                          }}
                          disabled={generatingWallet === emp.id}
                          className="btn-secondary gap-1.5 text-sm"
                        >
                          {generatingWallet === emp.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wallet className="h-3.5 w-3.5" />
                          )}
                          Generate Wallet
                        </button>
                      )
                    )}

                    {/* Hire transaction on blockchain */}
                    {emp.onboardingStatus === 'completed' && emp.polygonTxhash && (
                      <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-purple-50 border border-emerald-200 p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Shield className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-bold text-emerald-700">Hired — Blockchain Verified</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mb-2">
                          Employment recorded on-chain with org↔employee address linkage.
                        </p>
                        <a
                          href={`https://amoy.polygonscan.com/tx/${emp.polygonTxhash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-purple-600 border border-purple-200 hover:bg-purple-50 transition-colors"
                        >
                          View Hire TX
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}

                    {/* Progress bar */}
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Onboarding Progress</p>
                      <div className="flex items-center gap-1">
                        {statusOrder.map((status, i) => {
                          const idx = statusOrder.indexOf(emp.onboardingStatus);
                          const isCompleted = i <= idx;
                          return (
                            <div
                              key={status}
                              className={`h-2 flex-1 rounded-full transition-colors ${
                                isCompleted ? 'bg-purple-500' : 'bg-gray-200'
                              }`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-1">
                        {statusOrder.map((status) => (
                          <span key={status} className="text-[10px] text-gray-400">
                            {STATUS_CONFIG[status].label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
