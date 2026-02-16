const DEFAULT_SENSITIVE_KEYS = new Set(
  [
    // Wallet / key material
    'wallet_private_key_enc',
    'private_key',
    'privatekey',

    // Auth/session
    'password',
    'password_hash',
    'access_token',
    'accesstoken',
    'refresh_token',
    'refreshtoken',
    'dxer_token',
    'authorization',

    // Invites / onboarding
    'invite_token',
    'invitetoken',
  ].map((k) => k.toLowerCase().replace(/[-_]/g, '')),
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return DEFAULT_SENSITIVE_KEYS.has(normalized);
}

/**
 * Deeply remove sensitive keys from an object/array structure.
 *
 * - Drops keys rather than masking values (safer for accidental leakage).
 * - Treats keys case-insensitively and normalizes `_` / `-`.
 */
export function redactSensitive<T = unknown>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v)) as any;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (shouldRedactKey(k)) continue;
    out[k] = redactSensitive(v);
  }
  return out as any;
}

/**
 * Redact a JSON string if it parses. If it doesn't parse, return `null` to avoid
 * leaking raw payloads back to clients.
 */
export function redactJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return redactSensitive(value);
  try {
    return redactSensitive(JSON.parse(value));
  } catch {
    return null;
  }
}
