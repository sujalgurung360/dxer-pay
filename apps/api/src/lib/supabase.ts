import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy singletons — clients are created on first use, not at module scope.
// This avoids "supabaseKey is required" crashes when the module is evaluated
// during the webpack/Next.js bundle initialisation phase before env vars are
// available in the Vercel serverless runtime.

let _admin: SupabaseClient | undefined;
let _anon: SupabaseClient | undefined;

function getUrl(): string {
  return process.env['NEXT_PUBLIC_SUPABASE_URL'] || 'http://localhost:54321';
}

function getServiceKey(): string {
  return process.env['SUPABASE_SERVICE_ROLE_KEY'] || '';
}

function getAnonKey(): string {
  return process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '';
}

/** Service-role client — bypasses RLS, used for admin operations. */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(getUrl(), getServiceKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}

/** Anon client — respects RLS. */
export function getSupabaseAnon(): SupabaseClient {
  if (!_anon) {
    _anon = createClient(getUrl(), getAnonKey());
  }
  return _anon;
}

/** Create a client scoped to a user's JWT. */
export function createUserClient(accessToken: string) {
  return createClient(getUrl(), getAnonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
