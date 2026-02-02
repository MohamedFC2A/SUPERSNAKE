import { t, onLocaleChange } from '../../i18n';
import { getStatsManager, StatsManager } from '../../game/StatsManager';
import {
    fetchMyBestScore,
    getAuthState,
    isSupabaseConfigured,
    signInWithGoogle,
    signOut,
    subscribeAuth,
    takeAuthError,
    updateUsername,
} from '../../supabase';

/**
 * ProfilePage - User statistics and profile display
 */
export class ProfilePage {
    private container: HTMLElement;
    private unsubscribeLocale: (() => void) | null = null;
    private unsubscribeStats: (() => void) | null = null;
    private unsubscribeAuth: (() => void) | null = null;

    private cloudBestScore: number | null = null;
    private cloudLoading: boolean = false;
    private authError: string | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'page profile-page';
        this.authError = takeAuthError();
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });

        this.unsubscribeStats = getStatsManager().subscribe(() => {
            this.updateContent();
        });

        this.unsubscribeAuth = subscribeAuth(() => {
            this.authError = takeAuthError() || this.authError;
            const auth = getAuthState();
            if (auth.user) {
                void this.loadCloudStats();
            } else {
                this.cloudBestScore = null;
                this.cloudLoading = false;
            }
            this.updateContent();
        });
    }

    private async loadCloudStats(): Promise<void> {
        if (!isSupabaseConfigured()) return;
        if (!getAuthState().user) return;

        this.cloudLoading = true;
        this.updateContent();
        try {
            this.cloudBestScore = await fetchMyBestScore();
        } finally {
            this.cloudLoading = false;
            this.updateContent();
        }
    }

    private updateContent(): void {
        const stats = getStatsManager().getStats();
        const formattedSurvival = StatsManager.formatSurvivalTime(stats.longestSurvivalMs);
        const highScoreDate = stats.highScoreDate
            ? new Date(stats.highScoreDate).toLocaleDateString()
            : '-';

        const auth = getAuthState();
        const configured = auth.configured && isSupabaseConfigured();
        const user = auth.user;
        const profile = auth.profile;
        const cloudName =
            profile?.username ||
            (user?.user_metadata?.full_name as string | undefined) ||
            (user?.user_metadata?.name as string | undefined) ||
            (user?.email ? user.email.split('@')[0] : null) ||
            null;

        this.container.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">${t('profile.title')}</h1>
                <p class="page-subtitle">${t('profile.subtitle')}</p>
            </div>

            <div class="profile-cloud">
                <div class="profile-cloud-header">
                    <h2 class="section-title">${t('profile.cloudTitle')}</h2>
                    <div class="section-subtitle">${t('profile.cloudSubtitle')}</div>
                </div>

                ${this.authError ? `
                    <div class="panel panel-warning">
                        <div class="panel-title">${t('profile.signInErrorTitle')}</div>
                        <div class="panel-text">${this.escapeHtml(this.authError)}</div>
                        <div class="panel-actions">
                            <button class="btn btn-secondary btn-small" id="dismissAuthErrorBtn" type="button">${t('profile.dismiss')}</button>
                        </div>
                    </div>
                ` : ''}

                ${!configured ? `
                    <div class="profile-warning">
                        <span class="warning-icon">ℹ️</span>
                        <span class="warning-text">${t('profile.cloudNotConfigured')}</span>
                    </div>
                ` : ''}

                ${configured && !user ? `
                    <div class="profile-cloud-card">
                        <div class="profile-cloud-info">
                            <div class="profile-cloud-name">${t('profile.cloudSignedOut')}</div>
                            <div class="profile-cloud-meta">${t('profile.cloudSignInHint')}</div>
                        </div>
                        <button class="btn btn-primary" id="googleSignInBtn" type="button">${t('profile.signInGoogle')}</button>
                    </div>
                ` : ''}

                ${configured && user ? `
                    <div class="profile-cloud-card">
                        <div class="profile-cloud-info">
                            <div class="profile-cloud-name">${this.escapeHtml(cloudName || 'Player')}</div>
                            <div class="profile-cloud-meta">${this.escapeHtml(user.email || user.id.slice(0, 8))}</div>
                        </div>
                        <button class="btn btn-secondary" id="signOutBtn" type="button">${t('profile.signOut')}</button>
                    </div>

                    <div class="profile-cloud-settings">
                        <div class="setting-row">
                            <span class="setting-label">${t('profile.username')}</span>
                            <div class="setting-control-inline">
                                <input class="setting-input" id="cloudUsernameInput" type="text" maxlength="20" value="${this.escapeHtml(profile?.username || '')}" placeholder="${this.escapeHtml(cloudName || '')}" />
                                <button class="btn btn-secondary btn-small" id="saveUsernameBtn" type="button">${t('profile.save')}</button>
                            </div>
                        </div>
                        <div class="profile-cloud-stats">
                            <div class="stat-card">
                                <span class="stat-icon">☁️</span>
                                <span class="stat-value">${this.cloudLoading ? '…' : (this.cloudBestScore ?? 0)}</span>
                                <span class="stat-label">${t('profile.cloudBest')}</span>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>

            <div class="profile-card">
                <div class="profile-avatar">
                    <span class="avatar-icon">👤</span>
                </div>
                <div class="profile-info">
                    <span class="profile-label">${t('profile.localProfile')}</span>
                    <span class="profile-id">${stats.userId.slice(0, 8)}...</span>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-icon">🎮</span>
                    <span class="stat-value">${stats.gamesPlayed}</span>
                    <span class="stat-label">${t('profile.gamesPlayed')}</span>
                </div>
                <div class="stat-card highlight">
                    <span class="stat-icon">🏆</span>
                    <span class="stat-value">${stats.bestScore}</span>
                    <span class="stat-label">${t('profile.bestScore')}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-icon">💯</span>
                    <span class="stat-value">${stats.totalScore}</span>
                    <span class="stat-label">${t('profile.totalScore')}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-icon">⏱️</span>
                    <span class="stat-value">${formattedSurvival}</span>
                    <span class="stat-label">${t('profile.longestSurvival')}</span>
                </div>
            </div>

            <div class="profile-details">
                <div class="detail-row">
                    <span class="detail-label">${t('profile.highScoreDate')}</span>
                    <span class="detail-value">${highScoreDate}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">${t('profile.highScoreVersion')}</span>
                    <span class="detail-value">${stats.highScoreVersion}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">${t('profile.memberSince')}</span>
                    <span class="detail-value">${new Date(stats.createdAt).toLocaleDateString()}</span>
                </div>
                ${stats.lastPlayedAt ? `
                    <div class="detail-row">
                        <span class="detail-label">${t('profile.lastPlayed')}</span>
                        <span class="detail-value">${new Date(stats.lastPlayedAt).toLocaleDateString()}</span>
                    </div>
                ` : ''}
            </div>

            <div class="profile-warning">
                <span class="warning-icon">ℹ️</span>
                <span class="warning-text">${t('profile.localWarning')}</span>
            </div>
        `;

        const googleBtn = this.container.querySelector('#googleSignInBtn');
        googleBtn?.addEventListener('click', () => void signInWithGoogle());

        const signOutBtn = this.container.querySelector('#signOutBtn');
        signOutBtn?.addEventListener('click', () => void signOut());

        const saveBtn = this.container.querySelector('#saveUsernameBtn');
        const usernameInput = this.container.querySelector('#cloudUsernameInput') as HTMLInputElement | null;
        saveBtn?.addEventListener('click', () => {
            const value = usernameInput?.value ?? '';
            void updateUsername(value);
        });

        const dismissBtn = this.container.querySelector('#dismissAuthErrorBtn');
        dismissBtn?.addEventListener('click', () => {
            this.authError = null;
            this.updateContent();
        });
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        this.unsubscribeLocale?.();
        this.unsubscribeStats?.();
        this.unsubscribeAuth?.();
    }
}
