import { t, onLocaleChange } from '../../i18n';
import { getStatsManager, StatsManager } from '../../game/StatsManager';

/**
 * ProfilePage - User statistics and profile display
 */
export class ProfilePage {
    private container: HTMLElement;
    private unsubscribeLocale: (() => void) | null = null;
    private unsubscribeStats: (() => void) | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'page profile-page';
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });

        this.unsubscribeStats = getStatsManager().subscribe(() => {
            this.updateContent();
        });
    }

    private updateContent(): void {
        const stats = getStatsManager().getStats();
        const formattedSurvival = StatsManager.formatSurvivalTime(stats.longestSurvivalMs);
        const highScoreDate = stats.highScoreDate
            ? new Date(stats.highScoreDate).toLocaleDateString()
            : '-';

        this.container.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">${t('profile.title')}</h1>
                <p class="page-subtitle">${t('profile.subtitle')}</p>
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
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        this.unsubscribeLocale?.();
        this.unsubscribeStats?.();
    }
}
