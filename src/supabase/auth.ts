import type { Session, User } from '@supabase/supabase-js';
import { peekAuthErrors, setAuthError } from './errors';
import { isSessionStorageAvailable, isSupabaseConfigured, supabase } from './client';

export interface ProfileRow {
  id: string;
  username: string | null;
  avatar_url: string | null;
  updated_at?: string | null;
}

export interface AuthState {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
}

type Listener = (state: AuthState) => void;

let inited = false;
let listeners = new Set<Listener>();
let lastAuthEvent: string | null = null;
let lastAuthEventAt: string | null = null;
let state: AuthState = {
  configured: isSupabaseConfigured(),
  loading: false,
  session: null,
  user: null,
  profile: null,
};

function setState(next: Partial<AuthState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
}

export function getAuthDebugSnapshot(): Record<string, any> {
  const href = typeof window !== 'undefined' ? window.location.href : null;
  const origin = typeof window !== 'undefined' ? window.location.origin : null;
  const pathname = typeof window !== 'undefined' ? window.location.pathname : null;
  const hash = typeof window !== 'undefined' ? window.location.hash : null;
  const search = typeof window !== 'undefined' ? window.location.search : null;

  const codeInSearch =
    typeof window !== 'undefined' ? new URL(window.location.href).searchParams.get('code') : null;
  const codeInHash =
    typeof window !== 'undefined' && window.location.hash.includes('?')
      ? new URLSearchParams(window.location.hash.split('?')[1] || '').get('code')
      : null;

  return {
    at: new Date().toISOString(),
    configured: state.configured && isSupabaseConfigured(),
    sessionStorageAvailable: isSessionStorageAvailable(),
    location: { href, origin, pathname, hash, search },
    oauth: {
      codeInSearch: !!codeInSearch,
      codeInHash: !!codeInHash,
      hasAnyCode: !!codeInSearch || !!codeInHash,
      callbackPathExpected: '/auth/callback',
    },
    auth: {
      loading: state.loading,
      hasSession: !!state.session,
      hasUser: !!state.user,
      userId: state.user?.id ?? null,
      email: state.user?.email ?? null,
      provider: (state.user?.app_metadata as any)?.provider ?? null,
      lastEvent: lastAuthEvent,
      lastEventAt: lastAuthEventAt,
      recentErrors: peekAuthErrors(),
    },
  };
}

async function loadProfile(userId: string): Promise<ProfileRow | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) return null;
  return data as ProfileRow | null;
}

async function handleOAuthCallbackIfPresent(): Promise<void> {
  if (!supabase) return;

  const url = new URL(window.location.href);

  // Support both:
  // - /auth/callback?code=...
  // - /#/auth/callback?code=...  (code lives inside the hash query)
  const getOAuthParams = (): URLSearchParams => {
    if (url.searchParams.has('code') || url.searchParams.has('error') || url.searchParams.has('error_description')) {
      return url.searchParams;
    }
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return new URLSearchParams();
    return new URLSearchParams(hash.slice(qIndex + 1));
  };

  const params = getOAuthParams();
  const code = params.get('code');
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  // If an OAuth error is present, clear URL params so the app doesn't get stuck.
  if (error || errorDescription) {
    setAuthError((errorDescription || error || 'Sign-in failed').toString());
    // Clear both search and hash query.
    url.search = '';
    if (window.location.hash.includes('?')) {
      window.location.hash = window.location.hash.split('?')[0] || '';
    }
    window.history.replaceState({}, '', url.toString());
    return;
  }

  // With hash routing, we must NOT use a redirect that includes "#/...",
  // otherwise the code ends up after the hash and becomes invisible to `location.search`.
  if (!code) return;

  try {
    setState({ loading: true });
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      setAuthError(exchangeError.message || 'Sign-in failed');
    }
    const session = data.session ?? null;
    const user = session?.user ?? null;
    const profile = user ? await loadProfile(user.id) : null;
    setState({ loading: false, session, user, profile });
  } catch {
    setAuthError('Sign-in failed (session exchange)');
    setState({ loading: false });
  } finally {
    // Remove code param from URL (search + hash query)
    url.search = '';
    if (window.location.hash.includes('?')) {
      window.location.hash = window.location.hash.split('?')[0] || '';
    }
    window.history.replaceState({}, '', url.toString());

    // If we used a dedicated callback URL, route the user into the SPA profile page
    // without forcing a full page reload (helps keep session/storage stable).
    if (window.location.pathname.endsWith('/auth/callback')) {
      window.location.hash = '/profile';
    }
  }
}

export function initAuth(): void {
  if (inited) return;
  inited = true;

  if (!supabase) {
    setState({ configured: false, loading: false, session: null, user: null, profile: null });
    return;
  }

  setState({ configured: true, loading: true });

  void (async () => {
    // Handle OAuth redirect (PKCE) before reading session.
    await handleOAuthCallbackIfPresent();

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session ?? null;
      const user = session?.user ?? null;
      const profile = user ? await loadProfile(user.id) : null;
      setState({ loading: false, session, user, profile });
    } catch {
      setState({ loading: false });
    }
  })();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    lastAuthEvent = _event;
    lastAuthEventAt = new Date().toISOString();
    const user = session?.user ?? null;
    const profile = user ? await loadProfile(user.id) : null;
    setState({ session: session ?? null, user, profile, loading: false });
  });
}

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export async function refreshSession(): Promise<void> {
  if (!supabase) return;
  try {
    setState({ loading: true });
    const { data } = await supabase.auth.getSession();
    const session = data.session ?? null;
    const user = session?.user ?? null;
    const profile = user ? await loadProfile(user.id) : null;
    setState({ loading: false, session, user, profile });
  } catch (e: any) {
    setAuthError(e?.message || 'Failed to refresh session');
    setState({ loading: false });
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return;
  if (!isSessionStorageAvailable()) {
    setAuthError(
      'Your browser blocked session storage. Google sign-in cannot complete in private mode or with strict storage blocking.'
    );
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Important: no hash routing here, so the OAuth `code` lands in `location.search`.
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) {
    setAuthError(error.message || 'Sign-in failed');
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function updateUsername(username: string): Promise<void> {
  if (!supabase) return;
  const user = state.user;
  if (!user) return;

  const clean = username.trim().slice(0, 20);
  if (!clean) return;

  await supabase.from('profiles').upsert({ id: user.id, username: clean }, { onConflict: 'id' });
  const profile = await loadProfile(user.id);
  setState({ profile });
}
