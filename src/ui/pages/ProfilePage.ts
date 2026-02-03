import { t, onLocaleChange } from '../../i18n';
import { ParticleBackground } from '../components/ParticleBackground';
import {
    fetchMyBestScore,
    fetchMyUserStats,
    getAuthDebugSnapshot,
    getAuthState,
    isSupabaseConfigured,
    isSessionStorageAvailable,
    refreshSession,
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
    private unsubscribeAuth: (() => void) | null = null;

    private cloudBestScore: number | null = null;
    private cloudStats: {
        gamesPlayed: number;
        bestScore: number;
        totalScore: number;
        longestSurvivalMs: number;
    } | null = null;
    private cloudLoading: boolean = false;
    private authError: string | null = null;
    private debugExpanded: boolean = false;
    private particleBg: ParticleBackground | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'page profile-page';
        this.authError = takeAuthError();
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });

        this.unsubscribeAuth = subscribeAuth(() => {
            this.authError = takeAuthError() || this.authError;
            const auth = getAuthState();
            if (auth.user) {
                void this.loadCloudStats();
            } else {
                this.cloudBestScore = null;
                this.cloudStats = null;
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
            const stats = await fetchMyUserStats();
            this.cloudStats = stats
                ? {
                    gamesPlayed: stats.games_played ?? 0,
                    bestScore: stats.best_score ?? 0,
                    totalScore: Number(stats.total_score ?? 0),
                    longestSurvivalMs: stats.longest_survival_ms ?? 0,
                }
                : { gamesPlayed: 0, bestScore: 0, totalScore: 0, longestSurvivalMs: 0 };
        } finally {
            this.cloudLoading = false;
            this.updateContent();
        }
    }

    private updateContent(): void {
        const auth = getAuthState();
        const configured = auth.configured && isSupabaseConfigured();
        const user = auth.user;
        const profile = auth.profile;
        const storageOk = isSessionStorageAvailable();
        
        // Store particle container reference if it exists
        const hadParticles = this.container.querySelector('.particle-container');
        const debugSnapshot = getAuthDebugSnapshot();
        const cloudName =
            profile?.username ||
            (user?.user_metadata?.full_name as string | undefined) ||
            (user?.user_metadata?.name as string | undefined) ||
            (user?.email ? user.email.split('@')[0] : null) ||
            null;

        this.container.innerHTML = `
            <div class="particle-container" style="position: absolute; inset: 0; overflow: hidden; pointer-events: none;"></div>
            
            <div class="page-header" style="position: relative; z-index: 1;">
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

                ${configured && !storageOk ? `
                    <div class="panel panel-warning">
                        <div class="panel-title">${t('profile.signInErrorTitle')}</div>
                        <div class="panel-text">
                            ${t('profile.sessionStorageBlocked')}
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

                ${configured && !user ? `
                    <div class="panel">
                        <div class="panel-title">Auth Debug</div>
                        <div class="panel-text">
                            If sign-in says “signed out” after returning from Google, copy this report and send it here.
                        </div>
                        <div class="panel-actions">
                            <button class="btn btn-secondary btn-small" id="toggleAuthDebugBtn" type="button">
                                ${this.debugExpanded ? 'Hide' : 'Show'}
                            </button>
                            <button class="btn btn-secondary btn-small" id="copyAuthDebugBtn" type="button">Copy</button>
                            <button class="btn btn-secondary btn-small" id="forceRefreshSessionBtn" type="button">Refresh session</button>
                        </div>
                        ${this.debugExpanded ? `
                            <pre class="code-block" style="white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto;">${this.escapeHtml(JSON.stringify(debugSnapshot, null, 2))}</pre>
                        ` : ''}
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
                                <span class="stat-value">${this.cloudLoading ? '…' : (this.cloudStats?.bestScore ?? this.cloudBestScore ?? 0)}</span>
                                <span class="stat-label">${t('profile.bestScore')}</span>
                            </div>
                            <div class="stat-card">
                                <span class="stat-icon">⏱️</span>
                                <span class="stat-value">${this.cloudLoading ? '…' : this.formatSurvival(this.cloudStats?.longestSurvivalMs ?? 0)}</span>
                                <span class="stat-label">${t('profile.longestSurvival')}</span>
                            </div>
                            <div class="stat-card">
                                <span class="stat-icon">💯</span>
                                <span class="stat-value">${this.cloudLoading ? '…' : (this.cloudStats?.totalScore ?? 0)}</span>
                                <span class="stat-label">${t('profile.totalScore')}</span>
                            </div>
                            <div class="stat-card">
                                <span class="stat-icon">🎮</span>
                                <span class="stat-value">${this.cloudLoading ? '…' : (this.cloudStats?.gamesPlayed ?? 0)}</span>
                                <span class="stat-label">${t('profile.gamesPlayed')}</span>
                            </div>
                        </div>
                    </div>
                ` : ''}
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

        const toggleDebugBtn = this.container.querySelector('#toggleAuthDebugBtn');
        toggleDebugBtn?.addEventListener('click', () => {
            this.debugExpanded = !this.debugExpanded;
            this.updateContent();
        });

        const copyBtn = this.container.querySelector('#copyAuthDebugBtn');
        copyBtn?.addEventListener('click', async () => {
            const report = JSON.stringify(getAuthDebugSnapshot(), null, 2);
            try {
                await navigator.clipboard.writeText(report);
                this.authError = t('profile.debugCopied');
            } catch {
                // Fallback
                try {
                    const ta = document.createElement('textarea');
                    ta.value = report;
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    this.authError = t('profile.debugCopied');
                } catch {
                    this.authError = t('profile.debugCopyFailed');
                }
            }
            this.updateContent();
        });

        const refreshBtn = this.container.querySelector('#forceRefreshSessionBtn');
        refreshBtn?.addEventListener('click', async () => {
            await refreshSession();
            this.authError =
                takeAuthError() || t('profile.sessionRefreshAttempted', { time: new Date().toLocaleTimeString() });
            this.updateContent();
        });
        
        // Initialize particles if not already present
        if (!this.particleBg) {
            this.initParticles();
        }
    }

    private initParticles(): void {
        const particleContainer = this.container.querySelector('.particle-container');
        if (particleContainer) {
            this.particleBg = new ParticleBackground(particleContainer as HTMLElement, {
                particleCount: 35,
                speed: 0.2,
                connectParticles: true,
            });
        }
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private formatSurvival(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${seconds}s`;
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        this.unsubscribeLocale?.();
        this.unsubscribeAuth?.();
        this.particleBg?.destroy();
    }
}
