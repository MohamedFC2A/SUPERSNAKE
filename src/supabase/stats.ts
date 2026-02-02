import { supabase } from './client';
import { getAuthState } from './auth';

export interface UserStatsRow {
  user_id: string;
  games_played: number;
  total_score: number;
  best_score: number;
  longest_survival_ms: number;
  updated_at?: string | null;
}

export async function submitGameSession(score: number, survivalMs: number): Promise<void> {
  if (!supabase) return;
  const { user } = getAuthState();
  if (!user) return;

  const cleanScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  const cleanSurvival = Number.isFinite(survivalMs) ? Math.max(0, Math.floor(survivalMs)) : 0;

  try {
    await supabase.from('game_sessions').insert({
      user_id: user.id,
      score: cleanScore,
      survival_ms: cleanSurvival,
    });
  } catch {
    // ignore
  }
}

export async function fetchMyUserStats(): Promise<UserStatsRow | null> {
  if (!supabase) return null;
  const { user } = getAuthState();
  if (!user) return null;

  try {
    const { data, error } = await supabase
      .from('user_stats')
      .select('user_id, games_played, total_score, best_score, longest_survival_ms, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) return null;
    return (data as UserStatsRow | null) ?? null;
  } catch {
    return null;
  }
}

