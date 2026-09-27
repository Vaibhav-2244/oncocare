import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Check .env file.');
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: { detectSessionInUrl: true },
});

let legacySessionMigration: Promise<void> | null = null;

export function migrateLegacyLocalStorageSession() {
  if (typeof window === 'undefined' || !supabaseUrl) return Promise.resolve();
  if (legacySessionMigration) return legacySessionMigration;

  legacySessionMigration = (async () => {
    const { data: { session: cookieSession } } = await supabase.auth.getSession();
    if (cookieSession) return;

    try {
      const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
      const storedValue = window.localStorage.getItem(`sb-${projectRef}-auth-token`);
      if (!storedValue) return;

      const storedSession = JSON.parse(storedValue) as {
        access_token?: unknown;
        refresh_token?: unknown;
        currentSession?: { access_token?: unknown; refresh_token?: unknown };
      };
      const session = storedSession.currentSession || storedSession;
      if (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') return;

      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    } catch {
      // Keep the legacy value intact if migration fails so the user can still sign in again.
    }
  })();

  return legacySessionMigration;
}
