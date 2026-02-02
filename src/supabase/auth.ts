import type { Session, User } from '@supabase/supabase-js';
import { peekAuthErrors, setAuthError } from './errors';
import { isSessionStorageAvailable, isSupabaseConfigured, supabase } from './client';

export interface ProfileRow {
  id: string;
  username: string | null;
  avatar_url: string | null;
  theme?: 'dark' | 'light' | null;
  settings?: unknown;
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

function patchProfile(partial: Partial<ProfileRow> & { id?: string }): void {
  const userId = state.user?.id || partial.id;
  if (!userId) return;
  const base: ProfileRow = state.profile ?? { id: userId, username: null, avatar_url: null };
  setState({ profile: { ...base, ...partial, id: userId } });
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

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, theme, settings, updated_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) return null;
    return data as ProfileRow | null;
  } catch {
    // Never block auth state on a profile fetch (can be aborted during navigation).
    return null;
  }
}

function loadProfileInBackground(userId: string): void {
  void (async () => {
    const profile = await loadProfile(userId);
    // Only set if still the same user.
    if (state.user?.id === userId) setState({ profile });
  })();
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
    // Set session/user immediately; load profile async so auth UI doesn't get stuck.
    setState({ loading: false, session, user, profile: null });
    if (user) loadProfileInBackground(user.id);
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
      setState({ loading: false, session, user, profile: null });
      if (user) loadProfileInBackground(user.id);
    } catch {
      setState({ loading: false });
    }
  })();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    lastAuthEvent = _event;
    lastAuthEventAt = new Date().toISOString();
    const user = session?.user ?? null;
    // Update immediately, then load profile async.
    setState({ session: session ?? null, user, profile: null, loading: false });
    if (user) loadProfileInBackground(user.id);
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
    setState({ loading: false, session, user, profile: null });
    if (user) loadProfileInBackground(user.id);
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

  try {
    await supabase.from('profiles').upsert({ id: user.id, username: clean }, { onConflict: 'id' });
  } catch {
    // ignore
  }
  loadProfileInBackground(user.id);
}

export async function updateTheme(theme: 'dark' | 'light'): Promise<void> {
  if (!supabase) return;
  const user = state.user;
  if (!user) return;

  const clean = theme === 'light' ? 'light' : 'dark';
  // Optimistic update so UI doesn't "snap back" before the profile refresh finishes.
  patchProfile({ id: user.id, theme: clean });
  try {
    await supabase.from('profiles').upsert({ id: user.id, theme: clean }, { onConflict: 'id' });
  } catch {
    // ignore
  }
  loadProfileInBackground(user.id);
}

export async function updateProfileSettings(settings: unknown): Promise<void> {
  if (!supabase) return;
  const user = state.user;
  if (!user) return;

  // Optimistic update so UI doesn't revert while saving.
  patchProfile({ id: user.id, settings });
  try {
    await supabase.from('profiles').upsert({ id: user.id, settings }, { onConflict: 'id' });
  } catch {
    // ignore
  }
  loadProfileInBackground(user.id);
}
