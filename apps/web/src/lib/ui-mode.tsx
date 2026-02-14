'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type UiMode = 'advanced' | 'simple';

const STORAGE_KEY = 'dxer_ui_mode';

function readStored(): UiMode {
  if (typeof window === 'undefined') return 'advanced';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'simple' || stored === 'advanced') return stored;
  return 'advanced';
}

export function getInitialUiMode(): UiMode {
  return readStored();
}

type UiModeContextValue = [UiMode, (mode: UiMode) => void];

const UiModeContext = createContext<UiModeContextValue | null>(null);

export function UiModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<UiMode>('advanced');

  useEffect(() => {
    setModeState(readStored());
  }, []);

  const setMode = useCallback((next: UiMode) => {
    setModeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return (
    <UiModeContext.Provider value={[mode, setMode]}>
      {children}
    </UiModeContext.Provider>
  );
}

export function useUiMode(): [UiMode, (mode: UiMode) => void] {
  const value = useContext(UiModeContext);
  if (value === null) {
    throw new Error('useUiMode must be used within UiModeProvider');
  }
  return value;
}
