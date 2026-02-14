const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface FetchOptions extends RequestInit {
  token?: string;
  orgId?: string;
  noAuth?: boolean; // Skip auto-attaching auth token
}

export async function apiFetch<T = any>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, orgId, noAuth, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (!noAuth) {
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (orgId) {
      headers['x-org-id'] = orgId;
    }

    // Read from localStorage if not provided
    if (typeof window !== 'undefined') {
      if (!token) {
        const storedToken = localStorage.getItem('dxer_token');
        if (storedToken) headers['Authorization'] = `Bearer ${storedToken}`;
      }
      if (!orgId) {
        const storedOrgId = localStorage.getItem('dxer_org_id');
        if (storedOrgId) headers['x-org-id'] = storedOrgId;
      }
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
  });

  let data: any;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    // Non-JSON response (e.g. rate limiting, HTML error pages)
    if (!response.ok) {
      throw new ApiError(
        response.status,
        'NON_JSON_ERROR',
        text.slice(0, 200) || `Server returned ${response.status}`,
      );
    }
    throw new ApiError(500, 'PARSE_ERROR', 'Invalid response from server');
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error?.code || 'UNKNOWN',
      data.error?.message || 'An error occurred',
      data.error?.details,
    );
  }

  return data;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Typed API helpers
export const api = {
  auth: {
    signUp: (data: any) =>
      apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    signIn: (data: { email: string; password: string }) =>
      apiFetch('/api/auth/signin', { method: 'POST', body: JSON.stringify(data) }),
    me: () => apiFetch('/api/auth/me'),
  },
  orgs: {
    list: () => apiFetch('/api/organizations'),
    create: (data: { name: string; slug: string }) =>
      apiFetch('/api/organizations', { method: 'POST', body: JSON.stringify(data) }),
    current: () => apiFetch('/api/organizations/current'),
    invite: (data: { email: string; role: string }) =>
      apiFetch('/api/organizations/invite', { method: 'POST', body: JSON.stringify(data) }),
    wallet: () => apiFetch('/api/organizations/wallet'),
    connectMetamask: (metamaskAddress: string) =>
      apiFetch('/api/organizations/connect-metamask', { method: 'POST', body: JSON.stringify({ metamaskAddress }) }),
    resolveAddress: (address: string) =>
      apiFetch(`/api/organizations/resolve-address/${encodeURIComponent(address)}`),
  },
  ocr: {
    receipt: (image: string) =>
      apiFetch('/api/ocr/receipt', { method: 'POST', body: JSON.stringify({ image }) }),
    categorize: (data: { merchant?: string; description?: string; amount?: number }) =>
      apiFetch('/api/ocr/categorize', { method: 'POST', body: JSON.stringify(data) }),
    uploadReceipt: (image: string) =>
      apiFetch('/api/ocr/upload-receipt', { method: 'POST', body: JSON.stringify({ image }) }),
  },
  expenses: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiFetch(`/api/expenses${qs}`);
    },
    get: (id: string) => apiFetch(`/api/expenses/${id}`),
    create: (data: { description: string; amount: number; category: string; date: string; tags?: string[]; notes?: string; receiptUrl?: string; [k: string]: any }) =>
      apiFetch('/api/expenses', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch(`/api/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    void: (id: string) =>
      apiFetch(`/api/expenses/${id}/void`, { method: 'POST' }),
    markReviewed: (id: string) =>
      apiFetch(`/api/expenses/${id}/mark-reviewed`, { method: 'POST' }),
    convertToAsset: (id: string, usefulLife: number, category?: string) =>
      apiFetch(`/api/expenses/${id}/convert-to-asset`, {
        method: 'POST',
        body: JSON.stringify({ usefulLife, category }),
      }),
    fixAmount: (id: string, newAmount: number) =>
      apiFetch(`/api/expenses/${id}/fix-amount`, {
        method: 'POST',
        body: JSON.stringify({ newAmount }),
      }),
    exportCsv: () => apiFetch('/api/expenses/export'),
  },
  invoices: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiFetch(`/api/invoices${qs}`);
    },
    get: (id: string) => apiFetch(`/api/invoices/${id}`),
    create: (data: any) =>
      apiFetch('/api/invoices', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id: string, status: string) =>
      apiFetch(`/api/invoices/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    getPdf: (id: string) => `${API_URL}/api/invoices/${id}/pdf`,
  },
  customers: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiFetch(`/api/customers${qs}`);
    },
    create: (data: any) =>
      apiFetch('/api/customers', { method: 'POST', body: JSON.stringify(data) }),
  },
  employees: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiFetch(`/api/employees${qs}`);
    },
    create: (data: any) =>
      apiFetch('/api/employees', { method: 'POST', body: JSON.stringify(data) }),
  },
  payrolls: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiFetch(`/api/payrolls${qs}`);
    },
    get: (id: string) => apiFetch(`/api/payrolls/${id}`),
    create: (data: any) =>
      apiFetch('/api/payrolls', { method: 'POST', body: JSON.stringify(data) }),
    complete: (id: string) =>
      apiFetch(`/api/payrolls/${id}/complete`, { method: 'POST' }),
  },
  batches: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiFetch(`/api/production-batches${qs}`);
    },
    get: (id: string) => apiFetch(`/api/production-batches/${id}`),
    create: (data: any) =>
      apiFetch('/api/production-batches', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch(`/api/production-batches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  events: {
    create: (data: any) =>
      apiFetch('/api/production-events', { method: 'POST', body: JSON.stringify(data) }),
    list: (batchId?: string) => {
      const qs = batchId ? `?batchId=${batchId}` : '';
      return apiFetch(`/api/production-events${qs}`);
    },
  },
  audit: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiFetch(`/api/audit-log${qs}`);
    },
  },
  anchoring: {
    anchor: (entityType: string, entityIds: string[]) =>
      apiFetch('/api/anchoring/anchor', { method: 'POST', body: JSON.stringify({ entityType, entityIds }) }),
    verify: (txid: string) => apiFetch(`/api/anchoring/verify/${txid}`),
    jobs: () => apiFetch('/api/anchoring/jobs'),
    health: () => apiFetch('/api/anchoring/health'),
    queue: () => apiFetch('/api/anchoring/queue'),
  },
  dxexplorer: {
    verify: (data: { polygonTxHash?: string; entityType?: string; entityId?: string }) =>
      apiFetch('/api/anchoring/dxexplorer/verify', { method: 'POST', body: JSON.stringify(data) }),
    lookup: (identifier: string) =>
      apiFetch(`/api/anchoring/dxexplorer/lookup/${encodeURIComponent(identifier)}`),
    recover: (entityType: string, entityId: string) =>
      apiFetch(`/api/anchoring/recover/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`),
  },
  onboarding: {
    validate: (token: string) =>
      apiFetch(`/api/onboarding/validate?token=${encodeURIComponent(token)}`, { noAuth: true }),
    register: (token: string, data: { fullName: string; password: string }) =>
      apiFetch('/api/onboarding/register', { method: 'POST', body: JSON.stringify({ token, ...data }), noAuth: true }),
    verifyIdentity: (token: string, data: { documentType: string; documentNumber: string }) =>
      apiFetch('/api/onboarding/verify-identity', { method: 'POST', body: JSON.stringify({ token, ...data }), noAuth: true }),
    signContract: (token: string) =>
      apiFetch('/api/onboarding/sign-contract', { method: 'POST', body: JSON.stringify({ token }), noAuth: true }),
    complete: (token: string) =>
      apiFetch('/api/onboarding/complete', { method: 'POST', body: JSON.stringify({ token }), noAuth: true }),
  },
  hiring: {
    invite: (data: { email: string; fullName: string; position?: string; department?: string; salary?: number; currency?: string }) =>
      apiFetch('/api/hiring/invite', { method: 'POST', body: JSON.stringify(data) }),
    pipeline: () => apiFetch('/api/hiring/pipeline'),
    generateWallet: (employeeId: string) =>
      apiFetch(`/api/hiring/${employeeId}/generate-wallet`, { method: 'POST' }),
  },
  accountancy: {
    trialBalance: (params: { from: string; to: string; basis?: 'accrual' | 'cash' }) => {
      const search = new URLSearchParams({
        from: params.from,
        to: params.to,
        basis: params.basis || 'accrual',
      }).toString();
      return apiFetch('/api/accountancy/trial-balance?' + search);
    },
    profitAndLoss: (params: { from: string; to: string; basis?: 'accrual' | 'cash' }) => {
      const search = new URLSearchParams({
        from: params.from,
        to: params.to,
        basis: params.basis || 'accrual',
      }).toString();
      return apiFetch('/api/accountancy/profit-and-loss?' + search);
    },
    generalLedger: (params: { from: string; to: string; basis?: 'accrual' | 'cash'; accountCode?: string }) => {
      const search = new URLSearchParams({
        from: params.from,
        to: params.to,
        basis: params.basis || 'accrual',
        ...(params.accountCode ? { accountCode: params.accountCode } : {}),
      }).toString();
      return apiFetch('/api/accountancy/general-ledger?' + search);
    },
    arAging: (asOf: string) => {
      const search = new URLSearchParams({ asOf }).toString();
      return apiFetch('/api/accountancy/ar-aging?' + search);
    },
    apAging: (asOf: string) => {
      const search = new URLSearchParams({ asOf }).toString();
      return apiFetch('/api/accountancy/ap-aging?' + search);
    },
    query: (question: string) =>
      apiFetch('/api/accountancy/query', {
        method: 'POST',
        body: JSON.stringify({ question }),
      }),
    monthEndCheck: (year: number, month: number) =>
      apiFetch('/api/accountancy/month-end-check', {
        method: 'POST',
        body: JSON.stringify({ year, month }),
      }),
    closePeriod: (year: number, month: number, force?: boolean) =>
      apiFetch('/api/accountancy/close-period', {
        method: 'POST',
        body: JSON.stringify({ year, month, force }),
      }),
    reopenPeriod: (year: number, month: number, reason: string) =>
      apiFetch('/api/accountancy/reopen-period', {
        method: 'POST',
        body: JSON.stringify({ year, month, reason }),
      }),
    periodStatus: (year: number, month: number) => {
      const qs = new URLSearchParams({ year: String(year), month: String(month) }).toString();
      return apiFetch(`/api/accountancy/period-status?${qs}`);
    },
    periodHistory: (year: number, month: number) => {
      const qs = new URLSearchParams({ year: String(year), month: String(month) }).toString();
      return apiFetch(`/api/accountancy/period-history?${qs}`);
    },
    burnRate: (params: { from: string; to: string }) => {
      const search = new URLSearchParams({
        from: params.from,
        to: params.to,
      }).toString();
      return apiFetch('/api/accountancy/burn-rate?' + search);
    },
  },
  tax: {
    w2: (year: number) =>
      apiFetch(`/api/tax/w2?year=${year}`),
    w2Employee: (employeeId: string, year: number) =>
      apiFetch(`/api/tax/w2/${encodeURIComponent(employeeId)}?year=${year}`),
    form1099NEC: (year: number) =>
      apiFetch(`/api/tax/1099-nec?year=${year}`),
    form1120: (year: number) =>
      apiFetch(`/api/tax/1120?year=${year}`),
    depreciationSchedule: (year: number) =>
      apiFetch(`/api/tax/depreciation-schedule?year=${year}`),
    generatePackage: (year: number) =>
      apiFetch('/api/tax/generate-package', {
        method: 'POST',
        body: JSON.stringify({ year }),
      }),
    packages: () => apiFetch('/api/tax/packages'),
  },
  journalEntries: {
    list: (params?: { startDate?: string; endDate?: string; accountCode?: string; referenceType?: string; status?: string }) => {
      const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return apiFetch(`/api/journal-entries${qs}`);
    },
    get: (id: string) => apiFetch(`/api/journal-entries/${encodeURIComponent(id)}`),
    create: (data: { entryDate: string; description: string; lines: { accountCode: string; debitAmount?: number; creditAmount?: number; description?: string }[] }) =>
      apiFetch('/api/journal-entries', { method: 'POST', body: JSON.stringify(data) }),
    void: (id: string, reason: string) =>
      apiFetch(`/api/journal-entries/${encodeURIComponent(id)}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  },
};
