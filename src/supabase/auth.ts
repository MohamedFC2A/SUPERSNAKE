import type { Session, User } from '@supabase/supabase-js';
import { setAuthError } from './errors';
import { isSupabaseConfigured, supabase } from './client';

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
  const params = url.searchParams;
  const code = params.get('code');
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  // If an OAuth error is present, clear URL params so the app doesn't get stuck.
  if (error || errorDescription) {
    setAuthError((errorDescription || error || 'Sign-in failed').toString());
    url.search = '';
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
    // Remove code param from URL
    url.search = '';
    window.history.replaceState({}, '', url.toString());

    // If we used a dedicated callback URL, route the user into the SPA profile page.
    if (window.location.pathname.endsWith('/auth/callback')) {
      window.location.replace('/#/profile');
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

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return;
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
