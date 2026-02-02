import { supabase } from './client';
import { getAuthState } from './auth';

export interface ScoreRow {
  id?: number;
  user_id: string;
  username: string | null;
  score: number;
  created_at?: string;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  bestScore: number;
  lastPlayedAt: string | null;
}

export async function submitScore(score: number, fallbackName: string): Promise<void> {
  if (!supabase) return;
  const { user, profile } = getAuthState();
  if (!user) return;
  if (!Number.isFinite(score) || score <= 0) return;

  const nameFromMeta =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    (user.email ? user.email.split('@')[0] : undefined);

  const username = (profile?.username || nameFromMeta || fallbackName || 'Player').toString().slice(0, 20);

  try {
    await supabase.from('scores').insert({
      user_id: user.id,
      username,
      score: Math.floor(score),
    });
  } catch {
    // Ignore network/auth failures
  }
}

export async function fetchLeaderboard(limit: number = 50): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];

  // Fetch recent high-score rows then reduce client-side to "best per user".
  const take = Math.max(limit * 6, 200);
  let data: unknown[] | null = null;
  try {
    const res = await supabase
      .from('scores')
      .select('user_id, username, score, created_at')
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(take);
    if (res.error || !res.data) return [];
    data = res.data as unknown[];
  } catch {
    return [];
  }

  const byUser = new Map<string, LeaderboardEntry>();
  for (const row of data as ScoreRow[]) {
    const userId = row.user_id;
    const existing = byUser.get(userId);
    const username = (row.username || 'Player').toString();
    const createdAt = row.created_at ?? null;
    const score = row.score ?? 0;

    if (!existing) {
      byUser.set(userId, {
        userId,
        username,
        bestScore: score,
        lastPlayedAt: createdAt,
      });
      continue;
    }

    if (score > existing.bestScore) {
      existing.bestScore = score;
      existing.username = username;
    }
    if (createdAt && (!existing.lastPlayedAt || createdAt > existing.lastPlayedAt)) {
      existing.lastPlayedAt = createdAt;
    }
  }

  return Array.from(byUser.values())
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, limit);
}

export async function fetchMyBestScore(): Promise<number> {
  if (!supabase) return 0;
  const { user } = getAuthState();
  if (!user) return 0;

  try {
    const { data, error } = await supabase
      .from('scores')
      .select('score')
      .eq('user_id', user.id)
      .order('score', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return 0;
    return (data[0] as any).score ?? 0;
  } catch {
    return 0;
  }
}
