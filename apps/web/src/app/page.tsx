'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      router.replace(user ? '/dashboard' : '/signin');
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-600 shadow-purple-lg">
          <span className="text-xl font-extrabold text-white">DX</span>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
      </div>
    </div>
  );
}
