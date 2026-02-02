export { supabase, isSupabaseConfigured, isSessionStorageAvailable } from './client';
export {
  initAuth,
  getAuthState,
  getAuthDebugSnapshot,
  subscribeAuth,
  refreshSession,
  signInWithGoogle,
  signOut,
  updateUsername,
  updateTheme,
  updateProfileSettings,
  type AuthState,
  type ProfileRow,
} from './auth';
export { fetchLeaderboard, fetchMyBestScore, submitScore, type LeaderboardEntry } from './leaderboards';
export { setAuthError, takeAuthError, peekAuthErrors } from './errors';
export { fetchMyUserStats, submitGameSession, type UserStatsRow } from './stats';
