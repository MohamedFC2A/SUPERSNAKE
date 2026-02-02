import { BaseScreen } from './BaseScreen';
import { t, onLocaleChange } from '../../i18n';

export interface PauseMenuOptions {
    onResume: () => void;
    onRestart: () => void;
    onSettings: () => void;
    onMainMenu: () => void;
}

export interface PauseStats {
    score: number;
    mass: number;
    survivalTime: number;
}

/**
 * Pause Menu Overlay
 */
export class PauseMenu extends BaseScreen {
    private options: PauseMenuOptions;
    private stats: PauseStats | null = null;
    private unsubscribeLocale: (() => void) | null = null;

    constructor(options: PauseMenuOptions) {
        super('pause-menu');
        this.options = options;
    }

    render(): HTMLElement {
        this.container.className = 'pause-menu hidden';
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });

        return this.container;
    }

    private updateContent(): void {
        const stats = this.stats || { score: 0, mass: 0, survivalTime: 0 };

        const formatTime = (ms: number): string => {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        };

        this.container.innerHTML = `
            <div class="pause-overlay"></div>
            <div class="pause-content">
                <h2 class="pause-title">${t('pause.title')}</h2>
                
                <div class="pause-stats">
                    <div class="pause-stat">
                        <span class="pause-stat-label">${t('pause.score')}</span>
                        <span class="pause-stat-value">${stats.score}</span>
                    </div>
                    <div class="pause-stat">
                        <span class="pause-stat-label">${t('pause.mass')}</span>
                        <span class="pause-stat-value">${Math.floor(stats.mass)}</span>
                    </div>
                    <div class="pause-stat">
                        <span class="pause-stat-label">${t('pause.time')}</span>
                        <span class="pause-stat-value">${formatTime(stats.survivalTime)}</span>
                    </div>
                </div>
                
                <div class="pause-actions">
                    <button class="pause-btn primary" id="resumeButton">
                        <span class="btn-icon">▶</span>
                        <span>${t('pause.resume')}</span>
                    </button>
                    <button class="pause-btn" id="restartButton">
                        <span class="btn-icon">↻</span>
                        <span>${t('pause.restart')}</span>
                    </button>
                    <button class="pause-btn" id="settingsButton">
                        <span class="btn-icon">⚙</span>
                        <span>${t('pause.settings')}</span>
                    </button>
                    <button class="pause-btn danger" id="menuButton">
                        <span class="btn-icon">✕</span>
                        <span>${t('pause.exitToMenu')}</span>
                    </button>
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        const resumeBtn = this.container.querySelector('#resumeButton');
        const restartBtn = this.container.querySelector('#restartButton');
        const settingsBtn = this.container.querySelector('#settingsButton');
        const menuBtn = this.container.querySelector('#menuButton');

        resumeBtn?.addEventListener('click', () => this.options.onResume());
        restartBtn?.addEventListener('click', () => this.options.onRestart());
        settingsBtn?.addEventListener('click', () => this.options.onSettings());
        menuBtn?.addEventListener('click', () => this.options.onMainMenu());

        // ESC to resume
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.options.onResume();
            }
        };
        window.addEventListener('keydown', handleKeydown);
    }

    showWithStats(stats: PauseStats): void {
        this.stats = stats;
        this.updateContent();
        this.show();
    }

    destroy(): void {
        this.unsubscribeLocale?.();
    }
}
