import { t, onLocaleChange } from '../../i18n';
import { getRouter } from '../../router';

/**
 * NotFoundPage - 404 error page
 */
export class NotFoundPage {
    private container: HTMLElement;
    private unsubscribeLocale: (() => void) | null = null;

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
            <div class="not-found-content">
                <div class="not-found-icon">🐍</div>
                <h1 class="not-found-title">404</h1>
                <p class="not-found-message">${t('notFound.message')}</p>
                <p class="not-found-description">${t('notFound.description')}</p>
                <button class="btn btn-primary" id="goHomeBtn">
                    <span class="btn-icon">🏠</span>
                    <span>${t('notFound.goHome')}</span>
                </button>
            </div>
        `;

        this.setupEvents();
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
    }
}
