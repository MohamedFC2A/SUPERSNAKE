import { t, onLocaleChange } from '../i18n';
import { getRouter } from '../router';

export interface LayoutOptions {
    onNavigate?: (path: string) => void;
}

/**
 * Layout - Shared layout with navigation header
 */
export class Layout {
    private container: HTMLElement;
    private mainContent: HTMLElement;
    private navElement: HTMLElement;
    private unsubscribeLocale: (() => void) | null = null;
    private unsubscribeRoute: (() => void) | null = null;

    constructor(options?: LayoutOptions) {
        this.container = document.createElement('div');
        this.container.className = 'layout';
        this.container.id = 'layout';

        this.navElement = document.createElement('nav');
        this.navElement.className = 'nav';

        this.mainContent = document.createElement('main');
        this.mainContent.className = 'main-content';
        this.mainContent.id = 'main-content';

        this.container.appendChild(this.navElement);
        this.container.appendChild(this.mainContent);

        this.updateNav();

        // Subscribe to locale changes
        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateNav();
        });

        // Subscribe to route changes to update active link
        const router = getRouter();
        this.unsubscribeRoute = router.onRouteChange(() => {
            this.updateActiveLink();
        });
    }

    private updateNav(): void {
        const router = getRouter();
        const currentPath = router.getCurrentPath() || '/';

        this.navElement.innerHTML = `
            <div class="nav-brand">
                <a href="#/" class="nav-logo" aria-label="${t('menu.title')}">
                    <span class="nav-logo-icon">🐍</span>
                    <span class="nav-logo-text">${t('menu.title')}</span>
                </a>
            </div>
            <div class="nav-links" role="navigation" aria-label="Main navigation">
                <a href="#/" class="nav-link${currentPath === '/' ? ' active' : ''}" data-path="/">
                    <span class="nav-link-icon">🏠</span>
                    <span class="nav-link-text">${t('nav.home')}</span>
                </a>
                <a href="#/play" class="nav-link${currentPath === '/play' ? ' active' : ''}" data-path="/play">
                    <span class="nav-link-icon">🎮</span>
                    <span class="nav-link-text">${t('nav.play')}</span>
                </a>
                <a href="#/changelog" class="nav-link${currentPath === '/changelog' ? ' active' : ''}" data-path="/changelog">
                    <span class="nav-link-icon">📋</span>
                    <span class="nav-link-text">${t('nav.changelog')}</span>
                </a>
                <a href="#/settings" class="nav-link${currentPath === '/settings' ? ' active' : ''}" data-path="/settings">
                    <span class="nav-link-icon">⚙️</span>
                    <span class="nav-link-text">${t('nav.settings')}</span>
                </a>
                <a href="#/profile" class="nav-link${currentPath === '/profile' ? ' active' : ''}" data-path="/profile">
                    <span class="nav-link-icon">👤</span>
                    <span class="nav-link-text">${t('nav.profile')}</span>
                </a>
            </div>
            <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation" aria-expanded="false">
                <span class="nav-toggle-icon">☰</span>
            </button>
        `;

        this.setupMobileToggle();
    }

    private setupMobileToggle(): void {
        const toggle = this.navElement.querySelector('#navToggle');
        const links = this.navElement.querySelector('.nav-links');

        toggle?.addEventListener('click', () => {
            const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!isExpanded));
            links?.classList.toggle('open');
        });

        // Close menu when clicking a link
        links?.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                toggle?.setAttribute('aria-expanded', 'false');
                links?.classList.remove('open');
            });
        });
    }

    private updateActiveLink(): void {
        const router = getRouter();
        const currentPath = router.getCurrentPath();

        this.navElement.querySelectorAll('.nav-link').forEach(link => {
            const path = link.getAttribute('data-path');
            if (path === currentPath) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    /**
     * Get the main content container for page mounting
     */
    getMainContent(): HTMLElement {
        return this.mainContent;
    }

    /**
     * Get the full layout element
     */
    getElement(): HTMLElement {
        return this.container;
    }

    /**
     * Show the layout (for pages that need nav)
     */
    show(): void {
        this.container.classList.remove('hidden');
    }

    /**
     * Hide the layout (for full-screen pages like the game)
     */
    hide(): void {
        this.container.classList.add('hidden');
    }

    /**
     * Toggle navigation visibility
     */
    setNavVisible(visible: boolean): void {
        if (visible) {
            this.navElement.classList.remove('hidden');
        } else {
            this.navElement.classList.add('hidden');
        }
    }

    destroy(): void {
        this.unsubscribeLocale?.();
        this.unsubscribeRoute?.();
    }
}
