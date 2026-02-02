import { BaseScreen } from './BaseScreen';
import { t, onLocaleChange } from '../../i18n';

export interface GameOverStats {
    score: number;
    mass: number;
    survivalTime: number;
    killCount: number;
    killedBy: string | null;
    highScore: number;
    isNewHighScore: boolean;
}

export interface GameOverScreenOptions {
    onPlayAgain: () => void;
    onMainMenu: () => void;
    onShare?: () => void;
}

/**
 * Game Over Screen with comprehensive stats
 */
export class GameOverScreen extends BaseScreen {
    private options: GameOverScreenOptions;
    private stats: GameOverStats | null = null;
    private unsubscribeLocale: (() => void) | null = null;

    constructor(options: GameOverScreenOptions) {
        super('gameover-screen');
        this.options = options;
    }

    render(): HTMLElement {
        this.container.className = 'gameover-screen hidden';
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });

        return this.container;
    }

    private updateContent(): void {
        const stats = this.stats || {
            score: 0,
            mass: 0,
            survivalTime: 0,
            killCount: 0,
            killedBy: null,
            highScore: 0,
            isNewHighScore: false,
        };

        const formatTime = (ms: number): string => {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        };

        this.container.innerHTML = `
            <div class="gameover-content">
                <div class="gameover-header">
                    ${stats.killedBy ? `
                        <p class="death-cause">${t('gameOver.killedBy')} <span class="killer-name">${stats.killedBy}</span></p>
                    ` : ''}
                    <h1 class="gameover-title">${t('gameOver.title')}</h1>
                    ${stats.isNewHighScore ? `
                        <div class="new-highscore-badge">
                            <span class="badge-icon">🏆</span>
                            <span>${t('gameOver.newHighScore')}</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="stats-container">
                    <div class="stat-row primary">
                        <span class="stat-label">${t('gameOver.finalScore')}</span>
                        <span class="stat-value score-value">${stats.score}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">${t('gameOver.peakMass')}</span>
                        <span class="stat-value">${Math.floor(stats.mass)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">${t('gameOver.survivalTime')}</span>
                        <span class="stat-value">${formatTime(stats.survivalTime)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">${t('gameOver.kills')}</span>
                        <span class="stat-value">${stats.killCount}</span>
                    </div>
                    <div class="stat-divider"></div>
                    <div class="stat-row highscore">
                        <span class="stat-label">${t('gameOver.highScore')}</span>
                        <span class="stat-value">${stats.highScore}</span>
                    </div>
                </div>
                
                <div class="gameover-actions">
                    <button class="play-again-button" id="playAgainButton">
                        <span class="button-icon">↻</span>
                        <span>${t('gameOver.playAgain')}</span>
                    </button>
                    <div class="secondary-actions">
                        ${this.options.onShare ? `
                            <button class="action-btn share-btn" id="shareButton">
                                <span>${t('gameOver.share')}</span>
                            </button>
                        ` : ''}
                        <button class="action-btn menu-btn" id="menuButton">
                            <span>${t('gameOver.mainMenu')}</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        const playAgainBtn = this.container.querySelector('#playAgainButton');
        const menuBtn = this.container.querySelector('#menuButton');
        const shareBtn = this.container.querySelector('#shareButton');

        playAgainBtn?.addEventListener('click', () => this.options.onPlayAgain());
        menuBtn?.addEventListener('click', () => this.options.onMainMenu());
        shareBtn?.addEventListener('click', () => this.options.onShare?.());
    }

    showWithStats(stats: GameOverStats): void {
        this.stats = stats;
        this.updateContent();
        this.show();
    }

    destroy(): void {
        this.unsubscribeLocale?.();
    }
}
