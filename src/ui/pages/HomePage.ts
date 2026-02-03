import { t, onLocaleChange } from '../../i18n';
import { getRouter } from '../../router';
import { ParticleBackground } from '../components/ParticleBackground';

/**
 * HomePage - Landing page with game summary and CTAs
 * Enhanced with game-like visuals and animations
 */
export class HomePage {
    private container: HTMLElement;
    private unsubscribeLocale: (() => void) | null = null;
    private particleBg: ParticleBackground | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'page home-page';
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });
    }

    private updateContent(): void {
        const highScore = this.getHighScore();
        
        this.container.innerHTML = `
            <div class="particle-container" style="position: absolute; inset: 0; overflow: hidden;"></div>
            
            <div class="home-hero">
                <div class="home-logo">
                    <span class="home-logo-icon">🐍</span>
                </div>
                <h1 class="home-title" data-text="${t('menu.title')}">${t('menu.title')}</h1>
                <p class="home-subtitle">${t('menu.subtitle')}</p>
                
                ${highScore > 0 ? `
                    <div class="home-highscore">
                        <span class="highscore-label">${t('menu.highScore')}</span>
                        <span class="highscore-value">${highScore.toLocaleString()}</span>
                    </div>
                ` : ''}
            </div>

            <div class="home-actions">
                <button class="btn btn-primary btn-large neon-button" id="playBtn">
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
        this.initParticles();
    }

    private getHighScore(): number {
        try {
            const stats = localStorage.getItem('snake_stats');
            if (stats) {
                const parsed = JSON.parse(stats);
                return parsed.highScore || 0;
            }
        } catch {
            // ignore
        }
        return 0;
    }

    private initParticles(): void {
        const particleContainer = this.container.querySelector('.particle-container');
        if (particleContainer) {
            this.particleBg = new ParticleBackground(particleContainer as HTMLElement, {
                particleCount: 60,
                speed: 0.3,
                connectParticles: true,
            });
        }
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
        this.particleBg?.destroy();
    }
}
