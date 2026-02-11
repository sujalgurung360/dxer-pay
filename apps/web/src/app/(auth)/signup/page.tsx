'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  Loader2, ArrowRight, ArrowLeft, Building2, User, Shield,
  CheckCircle2, Upload, ExternalLink, Wallet,
} from 'lucide-react';

type Step = 'personal' | 'organization' | 'verification';

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [step, setStep] = useState<Step>('personal');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [country, setCountry] = useState('');

  const [verificationMethod, setVerificationMethod] = useState<'manual' | 'sheerid'>('manual');
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const handleOrgNameChange = (name: string) => {
    setOrgName(name);
    if (!orgSlug || orgSlug === orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) {
      setOrgSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  };

  const validateStep = (s: Step): boolean => {
    setError('');
    if (s === 'personal') {
      if (!fullName || !email || !password) { setError('All fields are required'); return false; }
      if (password.length < 8) { setError('Password must be at least 8 characters'); return false; }
    }
    if (s === 'organization') {
      if (!orgName) { setError('Organization name is required'); return false; }
    }
    return true;
  };

  const nextStep = () => {
    if (!validateStep(step)) return;
    if (step === 'personal') setStep('organization');
    else if (step === 'organization') setStep('verification');
  };

  const prevStep = () => {
    if (step === 'organization') setStep('personal');
    else if (step === 'verification') setStep('organization');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signUp({ email, password, fullName, phoneNumber: phoneNumber || undefined, orgName, orgSlug: orgSlug || undefined, registrationNumber: registrationNumber || undefined, businessType: businessType || undefined, country: country || undefined, verificationMethod });
      router.push('/dashboard');
    } catch (err: any) { setError(err.message || 'Sign up failed'); }
    finally { setLoading(false); }
  };

  const steps: { key: Step; label: string; icon: React.ReactNode }[] = [
    { key: 'personal', label: 'Personal', icon: <User className="h-3.5 w-3.5" /> },
    { key: 'organization', label: 'Organization', icon: <Building2 className="h-3.5 w-3.5" /> },
    { key: 'verification', label: 'Verification', icon: <Shield className="h-3.5 w-3.5" /> },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600 shadow-purple-lg">
            <span className="text-2xl font-extrabold text-white">DX</span>
          </div>
          <h1 className="text-3xl font-serif text-gray-900">Create your DXER account</h1>
          <p className="mt-1 text-sm text-gray-400">Every organization gets a unique Polygon address</p>
        </div>

        {/* Step Indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                step === s.key ? 'bg-purple-600 text-white shadow-purple' : currentIdx > i ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'
              }`}>
                {currentIdx > i ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.icon}
                {s.label}
              </div>
              {i < steps.length - 1 && <div className={`h-px w-8 ${currentIdx > i ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {error && <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-600 font-medium">{error}</div>}

          {step === 'personal' && (
            <>
              <div>
                <label className="label">Full Name <span className="text-red-400">*</span></label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-field mt-1.5" placeholder="John Doe" required />
              </div>
              <div>
                <label className="label">Email <span className="text-red-400">*</span></label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field mt-1.5" placeholder="you@company.com" required />
              </div>
              <div>
                <label className="label">Password <span className="text-red-400">*</span></label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field mt-1.5" placeholder="At least 8 characters" required minLength={8} />
              </div>
              <div>
                <label className="label">Phone Number</label>
                <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="input-field mt-1.5" placeholder="+1 555-0100" />
              </div>
              <button type="button" onClick={nextStep} className="btn-primary w-full gap-2">Next: Organization <ArrowRight className="h-4 w-4" /></button>
            </>
          )}

          {step === 'organization' && (
            <>
              <div className="rounded-2xl bg-purple-50 border border-purple-100 p-3.5 text-xs text-purple-700 font-medium">
                <Wallet className="mr-1.5 inline-block h-3.5 w-3.5" /> A unique Polygon wallet will be auto-generated for your organization.
              </div>
              <div>
                <label className="label">Organization Name <span className="text-red-400">*</span></label>
                <input type="text" value={orgName} onChange={(e) => handleOrgNameChange(e.target.value)} className="input-field mt-1.5" placeholder="Acme Corporation" required />
              </div>
              <div>
                <label className="label">URL Slug</label>
                <div className="mt-1.5 flex items-center">
                  <span className="rounded-l-2xl border border-r-0 border-gray-200 bg-surface-50 px-3.5 py-2.5 text-sm text-gray-400">dxer.app/</span>
                  <input type="text" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} className="input-field rounded-l-none" placeholder="acme-corp" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Tax ID</label>
                  <input type="text" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className="input-field mt-1.5" placeholder="US-123456" />
                </div>
                <div>
                  <label className="label">Business Type</label>
                  <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className="input-field mt-1.5">
                    <option value="">Select...</option>
                    <option value="sole_proprietor">Sole Proprietor</option>
                    <option value="llc">LLC</option>
                    <option value="corporation">Corporation</option>
                    <option value="partnership">Partnership</option>
                    <option value="nonprofit">Non-Profit</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Country</label>
                <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} className="input-field mt-1.5" placeholder="United States" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={prevStep} className="btn-secondary gap-1.5"><ArrowLeft className="h-4 w-4" /> Back</button>
                <button type="button" onClick={nextStep} className="btn-primary flex-1 gap-2">Next: Verification <ArrowRight className="h-4 w-4" /></button>
              </div>
            </>
          )}

          {step === 'verification' && (
            <>
              <div>
                <label className="label mb-3">Identity Verification Method</label>
                <div className="space-y-3">
                  <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-all ${
                    verificationMethod === 'manual' ? 'border-purple-400 bg-purple-50' : 'border-gray-100 hover:border-gray-200'
                  }`}>
                    <input type="radio" name="verif" value="manual" checked={verificationMethod === 'manual'} onChange={() => setVerificationMethod('manual')} className="mt-1 accent-purple-600" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Upload Document</p>
                      <p className="text-xs text-gray-400 mt-0.5">Upload a government ID, business license, or registration certificate.</p>
                      {verificationMethod === 'manual' && (
                        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 p-4 hover:border-purple-300 transition-colors">
                          <Upload className="h-5 w-5 text-gray-300" />
                          <span className="text-xs text-gray-400">{documentFile ? documentFile.name : 'Choose file (PDF, JPG, PNG)'}</span>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} />
                        </label>
                      )}
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-all ${
                    verificationMethod === 'sheerid' ? 'border-purple-400 bg-purple-50' : 'border-gray-100 hover:border-gray-200'
                  }`}>
                    <input type="radio" name="verif" value="sheerid" checked={verificationMethod === 'sheerid'} onChange={() => setVerificationMethod('sheerid')} className="mt-1 accent-purple-600" />
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        Verify with SheerID
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">INSTANT</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Instant automated verification through SheerID.</p>
                      {verificationMethod === 'sheerid' && (
                        <a href="https://www.sheerid.com" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium">
                          Learn about SheerID <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </label>
                </div>
              </div>
              <div className="rounded-2xl bg-surface-100 p-4 text-xs text-gray-500">
                <p className="font-semibold text-gray-700 mb-1.5">What happens next:</p>
                <ul className="space-y-1 ml-4 list-disc">
                  <li>Your account and organization will be created</li>
                  <li>A unique Polygon wallet address will be generated</li>
                  <li>You can connect MetaMask from your dashboard</li>
                  <li>All business actions will be anchored to blockchain</li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={prevStep} className="btn-secondary gap-1.5"><ArrowLeft className="h-4 w-4" /> Back</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1 gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {loading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </>
          )}

          <p className="text-center text-sm text-gray-400">
            Already have an account?{' '}
            <Link href="/signin" className="font-semibold text-purple-600 hover:text-purple-700">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
