import type { Session, User } from '@supabase/supabase-js';
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

export function initAuth(): void {
  if (inited) return;
  inited = true;

  if (!supabase) {
    setState({ configured: false, loading: false, session: null, user: null, profile: null });
    return;
  }

  setState({ configured: true, loading: true });

  supabase.auth
    .getSession()
    .then(async ({ data }) => {
      const session = data.session ?? null;
      const user = session?.user ?? null;
      const profile = user ? await loadProfile(user.id) : null;
      setState({ loading: false, session, user, profile });
    })
    .catch(() => {
      setState({ loading: false });
    });

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
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/#/profile`,
    },
  });
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

