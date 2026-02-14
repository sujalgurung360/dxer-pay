'use client';

import { useCallback, useEffect, useState } from 'react';

export type UiMode = 'advanced' | 'simple';

const STORAGE_KEY = 'dxer_ui_mode';

export function getInitialUiMode(): UiMode {
  if (typeof window === 'undefined') return 'advanced';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'simple' || stored === 'advanced') return stored;
  return 'advanced';
}

export function useUiMode(): [UiMode, (mode: UiMode) => void] {
  const [mode, setMode] = useState<UiMode>(() => getInitialUiMode());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'simple' || stored === 'advanced') {
      setMode(stored);
    }
  }, []);

  const updateMode = useCallback((next: UiMode) => {
    setMode(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return [mode, updateMode];
}

