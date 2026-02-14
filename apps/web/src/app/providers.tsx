'use client';

import { AuthProvider } from '@/lib/auth-context';
import { UiModeProvider } from '@/lib/ui-mode';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <UiModeProvider>{children}</UiModeProvider>
    </AuthProvider>
  );
}
