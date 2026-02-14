'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Loader2, ArrowRight, ArrowLeft, User, Shield, FileText,
  CheckCircle2, Wallet, Fingerprint, FileCheck, Copy,
  Building2, AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';

type Step = 'loading' | 'welcome' | 'register' | 'verify' | 'contract' | 'wallet' | 'complete' | 'error';

type EmployeeInfo = {
  employeeId: string;
  fullName: string;
  email: string;
  position: string | null;
  department: string | null;
  organizationName: string;
  onboardingStatus: string;
};

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [step, setStep] = useState<Step>('loading');
  const [info, setInfo] = useState<EmployeeInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Registration fields
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ID verification fields
  const [documentType, setDocumentType] = useState('passport');
  const [documentNumber, setDocumentNumber] = useState('');

  // Contract fields
  const [agreed, setAgreed] = useState(false);

  // Wallet & hire result
  const [walletAddress, setWalletAddress] = useState('');
  const [hireTxHash, setHireTxHash] = useState('');
  const [hireExplorerUrl, setHireExplorerUrl] = useState('');

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setStep('error');
      setError('No invitation token provided. Please use the link from your invitation email.');
      return;
    }

    (async () => {
      try {
        const res = await api.onboarding.validate(token);
        setInfo(res.data);
        setFullName(res.data.fullName);

        // Resume from current status
        const status = res.data.onboardingStatus;
        if (status === 'invited') setStep('welcome');
        else if (status === 'registered') setStep('verify');
        else if (status === 'verified') setStep('contract');
        else if (status === 'contract_signed') setStep('wallet');
        else if (status === 'completed') setStep('complete');
        else setStep('welcome');
      } catch (err: any) {
        setStep('error');
        setError(err.message || 'Invalid or expired invitation');
      }
    })();
  }, [token]);

  const handleRegister = async () => {
    setError('');
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.onboarding.register(token, { fullName, password });
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyIdentity = async () => {
    setError('');
    if (!documentNumber) {
      setError('Please enter your document number');
      return;
    }

    setLoading(true);
    try {
      await api.onboarding.verifyIdentity(token, { documentType, documentNumber });
      setStep('contract');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignContract = async () => {
    setError('');
    if (!agreed) {
      setError('You must agree to the employment terms');
      return;
    }

    setLoading(true);
    try {
      await api.onboarding.signContract(token);
      setStep('wallet');
    } catch (err: any) {
      setError(err.message || 'Contract signing failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateWallet = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.onboarding.complete(token);
      setWalletAddress(res.data.walletAddress);
      if (res.data.hireTxHash) setHireTxHash(res.data.hireTxHash);
      if (res.data.explorerUrl) setHireExplorerUrl(res.data.explorerUrl);
      setStep('complete');
    } catch (err: any) {
      setError(err.message || 'Wallet generation failed');
    } finally {
      setLoading(false);
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Step definitions for indicator
  const steps = [
    { key: 'register', label: 'Register', icon: <User className="h-3.5 w-3.5" /> },
    { key: 'verify', label: 'Verify ID', icon: <Fingerprint className="h-3.5 w-3.5" /> },
    { key: 'contract', label: 'Contract', icon: <FileText className="h-3.5 w-3.5" /> },
    { key: 'wallet', label: 'Wallet', icon: <Wallet className="h-3.5 w-3.5" /> },
  ];
  const stepKeys = ['register', 'verify', 'contract', 'wallet', 'complete'];
  const currentIdx = stepKeys.indexOf(step as string);

  if (step === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-purple-500" />
          <p className="mt-3 text-sm text-gray-400">Validating your invitation...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-2xl font-serif text-gray-900">Invitation Error</h1>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
          <p className="mt-6 text-xs text-gray-400">
            Please contact your organization administrator for a new invitation link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600 shadow-purple-lg">
            <span className="text-2xl font-extrabold text-white">DX</span>
          </div>
          <h1 className="text-3xl font-serif text-gray-900">Employee Onboarding</h1>
          {info && (
            <p className="mt-1 text-sm text-gray-400">
              Welcome to <span className="font-semibold text-purple-600">{info.organizationName}</span>
            </p>
          )}
        </div>

        {/* Step Indicator — only show during active steps */}
        {currentIdx >= 0 && currentIdx < 4 && (
          <div className="mb-6 flex items-center justify-center gap-2">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  step === s.key
                    ? 'bg-purple-600 text-white shadow-purple'
                    : currentIdx > i
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-gray-100 text-gray-400'
                }`}>
                  {currentIdx > i ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.icon}
                  {s.label}
                </div>
                {i < steps.length - 1 && (
                  <div className={`h-px w-8 ${currentIdx > i ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── WELCOME STEP ──────────────────────────────────── */}
        {step === 'welcome' && info && (
          <div className="card space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
              <Building2 className="h-8 w-8 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-serif text-gray-900">
                You have been invited to join
              </h2>
              <p className="mt-1 text-lg font-semibold text-purple-600">{info.organizationName}</p>
            </div>

            {(info.position || info.department) && (
              <div className="rounded-2xl bg-surface-50 p-4 text-sm">
                {info.position && (
                  <div className="flex justify-between py-1">
                    <span className="text-gray-400">Position</span>
                    <span className="font-medium text-gray-800">{info.position}</span>
                  </div>
                )}
                {info.department && (
                  <div className="flex justify-between py-1">
                    <span className="text-gray-400">Department</span>
                    <span className="font-medium text-gray-800">{info.department}</span>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl bg-purple-50 border border-purple-100 p-4 text-xs text-purple-700">
              <p className="font-semibold mb-1.5">Onboarding Steps:</p>
              <ol className="space-y-1 ml-4 list-decimal text-left">
                <li>Create your account</li>
                <li>Verify your identity</li>
                <li>Review and sign employment contract</li>
                <li>Generate your Polygon wallet address</li>
              </ol>
            </div>

            <button
              onClick={() => setStep('register')}
              className="btn-primary w-full gap-2"
            >
              Get Started <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ─── REGISTER STEP ─────────────────────────────────── */}
        {step === 'register' && info && (
          <div className="card space-y-5">
            {error && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="label">Full Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input-field mt-1.5"
                placeholder="Your full name"
                required
              />
            </div>

            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={info.email}
                className="input-field mt-1.5 bg-surface-50 text-gray-400 cursor-not-allowed"
                readOnly
              />
              <p className="mt-1 text-xs text-gray-400">Email is pre-set by your organization</p>
            </div>

            <div>
              <label className="label">Password <span className="text-red-400">*</span></label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field mt-1.5"
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="label">Confirm Password <span className="text-red-400">*</span></label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field mt-1.5"
                placeholder="Repeat your password"
                required
              />
            </div>

            <button
              onClick={handleRegister}
              disabled={loading}
              className="btn-primary w-full gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {loading ? 'Creating account...' : 'Create Account & Continue'}
            </button>
          </div>
        )}

        {/* ─── VERIFY IDENTITY STEP ──────────────────────────── */}
        {step === 'verify' && (
          <div className="card space-y-5">
            {error && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            <div className="rounded-2xl bg-purple-50 border border-purple-100 p-3.5 text-xs text-purple-700 font-medium">
              <Fingerprint className="mr-1.5 inline-block h-3.5 w-3.5" />
              Please provide a government-issued identification document for verification.
            </div>

            <div>
              <label className="label">Document Type <span className="text-red-400">*</span></label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="input-field mt-1.5"
              >
                <option value="passport">Passport</option>
                <option value="national_id">National ID Card</option>
                <option value="drivers_license">Driver&apos;s License</option>
              </select>
            </div>

            <div>
              <label className="label">Document Number <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="input-field mt-1.5"
                placeholder="Enter your document number"
                required
              />
            </div>

            <div className="rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center">
              <Fingerprint className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">Document upload placeholder</p>
              <p className="text-xs text-gray-300 mt-1">In production, this would accept document scans</p>
            </div>

            <button
              onClick={handleVerifyIdentity}
              disabled={loading}
              className="btn-primary w-full gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              {loading ? 'Verifying...' : 'Submit Verification'}
            </button>
          </div>
        )}

        {/* ─── CONTRACT STEP ─────────────────────────────────── */}
        {step === 'contract' && info && (
          <div className="card space-y-5">
            {error && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 mb-2">
              <FileCheck className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-serif text-gray-900">Employment Agreement</h2>
            </div>

            <div className="rounded-2xl bg-surface-50 border border-gray-100 p-5 max-h-64 overflow-y-auto text-xs text-gray-600 leading-relaxed space-y-3">
              <p className="font-semibold text-gray-900 text-sm">Employment Contract</p>
              <p>
                This Employment Agreement (&quot;Agreement&quot;) is entered into between{' '}
                <span className="font-semibold text-purple-600">{info.organizationName}</span>{' '}
                (&quot;Employer&quot;) and <span className="font-semibold text-purple-600">{fullName || info.fullName}</span>{' '}
                (&quot;Employee&quot;).
              </p>
              <p><span className="font-semibold">1. Position & Duties.</span> The Employee shall serve in the capacity of {info.position || 'the designated role'} and shall perform duties as assigned by the Employer.</p>
              <p><span className="font-semibold">2. Compensation.</span> The Employee shall receive compensation as agreed upon in the offer letter, payable according to the Employer&apos;s standard payroll schedule.</p>
              <p><span className="font-semibold">3. Blockchain Integration.</span> The Employee acknowledges that a Polygon blockchain wallet address will be generated as part of this onboarding process. This address will be used to create an immutable record of employment actions including payroll disbursements.</p>
              <p><span className="font-semibold">4. Confidentiality.</span> The Employee agrees to maintain the confidentiality of all proprietary information encountered during the course of employment.</p>
              <p><span className="font-semibold">5. At-Will Employment.</span> This employment is at-will and may be terminated by either party at any time, with or without cause, subject to applicable law.</p>
              <p><span className="font-semibold">6. Data Privacy.</span> The Employee consents to the collection and processing of personal data as necessary for employment purposes and blockchain record-keeping.</p>
              <p className="text-gray-400 italic mt-4">This is a framework contract for demonstration purposes.</p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-purple-600"
              />
              <span className="text-sm text-gray-700">
                I have read, understood, and agree to the terms of this Employment Agreement.
              </span>
            </label>

            <button
              onClick={handleSignContract}
              disabled={loading || !agreed}
              className="btn-primary w-full gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
              {loading ? 'Signing...' : 'Sign Contract & Continue'}
            </button>
          </div>
        )}

        {/* ─── WALLET STEP ───────────────────────────────────── */}
        {step === 'wallet' && (
          <div className="card space-y-5 text-center">
            {error && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-600 font-medium text-left">
                {error}
              </div>
            )}

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
              <Wallet className="h-8 w-8 text-purple-600" />
            </div>

            <div>
              <h2 className="text-xl font-serif text-gray-900">Generate Your Polygon Address</h2>
              <p className="mt-2 text-sm text-gray-400">
                Your unique Polygon wallet address will be used to link payroll transactions
                and create an immutable record on the blockchain.
              </p>
            </div>

            <div className="rounded-2xl bg-purple-50 border border-purple-100 p-4 text-xs text-purple-700">
              <Wallet className="mr-1.5 inline-block h-3.5 w-3.5" />
              This is the final step. Your wallet will be securely generated and stored.
            </div>

            <button
              onClick={handleGenerateWallet}
              disabled={loading}
              className="btn-primary w-full gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {loading ? 'Generating Wallet...' : 'Generate Polygon Address'}
            </button>
          </div>
        )}

        {/* ─── COMPLETE STEP ─────────────────────────────────── */}
        {step === 'complete' && (
          <div className="card space-y-6 text-center">
            {/* Celebration animation */}
            <div className="relative">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-emerald-50 animate-[pulse_2s_ease-in-out_1]">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </div>
              {/* Confetti dots */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-24 pointer-events-none">
                <div className="absolute top-2 left-2 h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="absolute top-4 right-4 h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
                <div className="absolute top-1 right-8 h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="absolute top-6 left-6 h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-serif text-gray-900">You&apos;re Hired! 🎉</h2>
              <p className="mt-2 text-sm text-gray-500">
                Congratulations! You are now officially part of{' '}
                <span className="font-semibold text-purple-600">{info?.organizationName}</span>.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Your employment has been recorded on the Polygon blockchain.
              </p>
            </div>

            {/* Hired event blockchain badge */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-purple-50 border border-emerald-200 p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Blockchain Verified</span>
              </div>
              <p className="text-xs text-gray-500">
                A &quot;hired&quot; event has been created on the Polygon network linking your address
                with <span className="font-semibold text-purple-600">{info?.organizationName}</span>&apos;s organization address.
              </p>
              {hireTxHash && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <a
                    href={hireExplorerUrl || `https://amoy.polygonscan.com/tx/${hireTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-purple-600 border border-purple-200 hover:bg-purple-50 transition-colors"
                  >
                    View Hire Transaction on PolygonScan
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                </div>
              )}
            </div>

            {walletAddress && (
              <div className="rounded-2xl bg-purple-50 border border-purple-100 p-4">
                <p className="text-xs text-purple-600 font-semibold mb-2">Your Polygon Address</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-xl bg-white px-3 py-2 font-mono text-xs text-gray-600 border border-purple-100">
                    {walletAddress}
                  </code>
                  <button
                    onClick={copyAddress}
                    className="rounded-lg p-2 text-purple-500 hover:bg-purple-100 transition-colors"
                    title="Copy address"
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-surface-50 border border-gray-100 p-4 text-sm text-gray-500">
              <p className="font-semibold text-gray-700 mb-1.5">What&apos;s next:</p>
              <ul className="space-y-1 text-xs text-left ml-4 list-disc">
                <li>Your administrator has been notified of your completion</li>
                <li>Payroll transactions will be linked to your Polygon address</li>
                <li>All transactions are verifiable through DXEXPLORER</li>
                <li>Your org ↔ employee relationship is recorded on-chain</li>
              </ul>
            </div>

            <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
              <p className="text-sm font-semibold text-emerald-700">
                You can now sign in to your dashboard.
              </p>
              <p className="text-xs text-emerald-500 mt-1">
                Your hiring has been permanently recorded on the blockchain.
              </p>
            </div>

            <a
              href="/signin"
              className="btn-primary w-full gap-2 inline-flex items-center justify-center"
            >
              Go to Sign In
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
