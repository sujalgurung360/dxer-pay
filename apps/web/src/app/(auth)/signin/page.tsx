'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Loader2, ArrowRight } from 'lucide-react';

export default function SignInPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600 shadow-purple-lg">
            <span className="text-2xl font-extrabold text-white">DX</span>
          </div>
          <h1 className="text-3xl font-serif text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-400">Sign in to your DXER account</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {error && (
            <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-600 font-medium">{error}</div>
          )}

          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="input-field mt-1.5" placeholder="you@example.com" required />
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="input-field mt-1.5" placeholder="Enter your password" required />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign In
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>

          <p className="text-center text-sm text-gray-400">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-purple-600 hover:text-purple-700">Sign up</Link>
          </p>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-[11px] text-gray-300 text-center mb-2">Demo accounts</p>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              {['owner', 'admin', 'accountant', 'viewer', 'sujalgurung360'].map((r) => (
                <button key={r} type="button"
                  onClick={() => { setEmail(`${r}@dxer.demo`); setPassword('password123'); }}
                  className="rounded-xl border border-gray-100 bg-surface-50 px-2.5 py-1.5 text-gray-400 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-600 font-medium transition-all text-center">
                  {r}@dxer.demo
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-300 text-center mt-2">Click to autofill · Password: password123</p>
          </div>
        </form>
      </div>
    </div>
  );
}
