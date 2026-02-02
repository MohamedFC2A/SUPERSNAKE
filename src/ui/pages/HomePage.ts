import { t, onLocaleChange } from '../../i18n';
import { getRouter } from '../../router';
import { getStatsManager } from '../../game/StatsManager';

/**
 * HomePage - Landing page with game summary and CTAs
 */
export class HomePage {
    private container: HTMLElement;
    private unsubscribeLocale: (() => void) | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'page home-page';
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });
    }

    private updateContent(): void {
        const stats = getStatsManager().getStats();

        this.container.innerHTML = `
            <div class="home-hero">
                <div class="home-logo">
                    <span class="home-logo-icon">🐍</span>
                </div>
                <h1 class="home-title">${t('menu.title')}</h1>
                <p class="home-subtitle">${t('menu.subtitle')}</p>
                
                ${stats.bestScore > 0 ? `
                    <div class="home-highscore">
                        <span class="highscore-label">${t('menu.highScore')}</span>
                        <span class="highscore-value">${stats.bestScore}</span>
                    </div>
                ` : ''}
            </div>

            <div class="home-actions">
                <button class="btn btn-primary btn-large" id="playBtn">
                    <span class="btn-icon">▶</span>
                    <span>${t('menu.play')}</span>
                </button>
            </div>

            <div class="home-secondary">
                <a href="#/changelog" class="home-link">
                    <span class="home-link-icon">📋</span>
                    <span>${t('nav.changelog')}</span>
                </a>
                <a href="#/profile" class="home-link">
                    <span class="home-link-icon">👤</span>
                    <span>${t('nav.profile')}</span>
                </a>
            </div>

            <div class="home-features">
                <div class="feature-card">
                    <span class="feature-icon">🎮</span>
                    <h3 class="feature-title">${t('home.feature1Title')}</h3>
                    <p class="feature-desc">${t('home.feature1Desc')}</p>
                </div>
                <div class="feature-card">
                    <span class="feature-icon">🤖</span>
                    <h3 class="feature-title">${t('home.feature2Title')}</h3>
                    <p class="feature-desc">${t('home.feature2Desc')}</p>
                </div>
                <div class="feature-card">
                    <span class="feature-icon">🏆</span>
                    <h3 class="feature-title">${t('home.feature3Title')}</h3>
                    <p class="feature-desc">${t('home.feature3Desc')}</p>
                </div>
            </div>

            <footer class="home-footer">
                <p class="home-hint">${t('menu.hint')}</p>
            </footer>
        `;

        this.setupEvents();
    }

    private setupEvents(): void {
        const playBtn = this.container.querySelector('#playBtn');
        playBtn?.addEventListener('click', () => {
            getRouter().navigate('/play');
        });
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        this.unsubscribeLocale?.();
    }
}
