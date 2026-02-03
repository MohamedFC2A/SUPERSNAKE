import { t, onLocaleChange } from '../../i18n';
import { getRouter } from '../../router';
import { ParticleBackground } from '../components/ParticleBackground';

/**
 * NotFoundPage - 404 error page
 * Enhanced with game-like visuals
 */
export class NotFoundPage {
    private container: HTMLElement;
    private unsubscribeLocale: (() => void) | null = null;
    private particleBg: ParticleBackground | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'page not-found-page';
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });
    }

    private updateContent(): void {
        this.container.innerHTML = `
            <div class="particle-container" style="position: absolute; inset: 0; overflow: hidden; pointer-events: none;"></div>
            
            <div class="not-found-content" style="position: relative; z-index: 1;">
                <div class="not-found-icon" style="animation: float 3s ease-in-out infinite;">🐍</div>
                <h1 class="not-found-title" style="text-shadow: 0 0 30px rgba(239, 68, 68, 0.5);">404</h1>
                <p class="not-found-message">${t('notFound.message')}</p>
                <p class="not-found-description">${t('notFound.description')}</p>
                <button class="btn btn-primary neon-button" id="goHomeBtn">
                    <span class="btn-icon">🏠</span>
                    <span>${t('notFound.goHome')}</span>
                </button>
            </div>
        `;

        this.setupEvents();
        this.initParticles();
    }

    private initParticles(): void {
        const particleContainer = this.container.querySelector('.particle-container');
        if (particleContainer) {
            this.particleBg = new ParticleBackground(particleContainer as HTMLElement, {
                particleCount: 30,
                speed: 0.15,
                connectParticles: true,
            });
        }
    }

    private setupEvents(): void {
        const homeBtn = this.container.querySelector('#goHomeBtn');
        homeBtn?.addEventListener('click', () => {
            getRouter().navigate('/');
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
