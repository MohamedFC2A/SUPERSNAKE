import { BaseScreen } from './BaseScreen';
import { t, onLocaleChange } from '../../i18n';

export interface MainMenuOptions {
    onPlay: (playerName: string) => void;
    onSettings?: () => void;
    onChangelog?: () => void;
    highScore?: number;
}

/**
 * Main Menu Screen with customization options
 */
export class MainMenu extends BaseScreen {
    private options: MainMenuOptions;
    private nameInput: HTMLInputElement | null = null;
    private unsubscribeLocale: (() => void) | null = null;

    constructor(options: MainMenuOptions) {
        super('main-menu');
        this.options = options;
    }

    render(): HTMLElement {
        this.container.className = 'menu-screen';
        this.updateContent();

        // Subscribe to locale changes
        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });

        return this.container;
    }

    private updateContent(): void {
        this.container.innerHTML = `
            <div class="menu-header">
                <h1 class="game-title">${t('menu.title')}</h1>
                <p class="subtitle">${t('menu.subtitle')}</p>
                ${this.options.highScore ? `
                    <div class="menu-highscore">
                        <span class="highscore-label">${t('menu.highScore')}</span>
                        <span class="highscore-value">${this.options.highScore}</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="menu-content">
                <input 
                    type="text" 
                    class="menu-input" 
                    id="playerName" 
                    placeholder="${t('menu.enterName')}" 
                    maxlength="15"
                    autocomplete="off"
                >
                
                <div class="menu-actions">
                    <button class="play-button" id="playButton">
                        <span class="button-icon">▶</span>
                        <span>${t('menu.play')}</span>
                    </button>
                </div>
                
                <div class="menu-secondary">
                    <button class="menu-btn-secondary" id="settingsButton">
                        <span class="btn-icon">⚙</span>
                        <span>${t('menu.settings')}</span>
                    </button>
                    <button class="menu-btn-secondary" id="changelogButton">
                        <span class="btn-icon">📋</span>
                        <span>${t('menu.changelog')}</span>
                    </button>
                </div>
            </div>
            
            <div class="menu-footer">
                <p class="menu-hint">${t('menu.hint')}</p>
            </div>
        `;

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.nameInput = this.container.querySelector('#playerName');
        const playBtn = this.container.querySelector('#playButton');
        const settingsBtn = this.container.querySelector('#settingsButton');
        const changelogBtn = this.container.querySelector('#changelogButton');

        playBtn?.addEventListener('click', () => this.handlePlay());

        this.nameInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handlePlay();
            }
        });

        settingsBtn?.addEventListener('click', () => {
            this.options.onSettings?.();
        });

        changelogBtn?.addEventListener('click', () => {
            this.options.onChangelog?.();
        });

        // Focus name input on show
        this.nameInput?.focus();
    }

    private handlePlay(): void {
        const name = this.nameInput?.value.trim() || 'Player';
        this.options.onPlay(name);
    }

    show(): void {
        super.show();
        // Focus input after animation
        setTimeout(() => {
            this.nameInput?.focus();
        }, 100);
    }

    updateHighScore(score: number): void {
        const highscoreValue = this.container.querySelector('.highscore-value');
        if (highscoreValue) {
            highscoreValue.textContent = score.toString();
        }
    }

    destroy(): void {
        this.unsubscribeLocale?.();
    }
}
