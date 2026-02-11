'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';

interface User {
  id: string;
  email: string;
  fullName: string;
}

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
  walletAddress?: string;
  metamaskAddress?: string;
}

interface AuthContextType {
  user: User | null;
  orgs: Org[];
  currentOrg: Org | null;
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: any) => Promise<void>;
  signOut: () => void;
  setCurrentOrg: (org: Org) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Org | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.auth.me();
      setUser({
        id: res.data.profile.userId,
        email: res.data.profile.email,
        fullName: res.data.profile.fullName,
      });
      setOrgs(res.data.organizations);

      // Auto-select first org if none selected, or refresh current org data
      const savedOrgId = localStorage.getItem('dxer_org_id');
      if (res.data.organizations.length > 0) {
        const matchOrg = res.data.organizations.find((o: Org) => o.id === savedOrgId);
        if (matchOrg) {
          setCurrentOrgState(matchOrg);
        } else if (!savedOrgId) {
          setCurrentOrgState(res.data.organizations[0]);
          localStorage.setItem('dxer_org_id', res.data.organizations[0].id);
        }
      }
    } catch {
      // Token invalid
      setUser(null);
      setOrgs([]);
      setToken(null);
      localStorage.removeItem('dxer_token');
      localStorage.removeItem('dxer_org_id');
    }
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('dxer_token');
    if (storedToken) {
      setToken(storedToken);
      refreshUser().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (email: string, password: string) => {
    const res = await api.auth.signIn({ email, password });
    const accessToken = res.data.accessToken;
    localStorage.setItem('dxer_token', accessToken);
    setToken(accessToken);
    await refreshUser();
  };

  const signUp = async (data: any) => {
    await api.auth.signUp(data);
    // Auto sign in after signup
    await signIn(data.email, data.password);
  };

  const signOut = () => {
    localStorage.removeItem('dxer_token');
    localStorage.removeItem('dxer_org_id');
    setUser(null);
    setOrgs([]);
    setCurrentOrgState(null);
    setToken(null);
    window.location.href = '/';
  };

  const setCurrentOrg = (org: Org) => {
    setCurrentOrgState(org);
    localStorage.setItem('dxer_org_id', org.id);
  };

  return (
    <AuthContext.Provider value={{
      user, orgs, currentOrg, token, isLoading,
      signIn, signUp, signOut, setCurrentOrg, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
