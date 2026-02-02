import { t, onLocaleChange } from '../../i18n';
import { Game } from '../../game/Game';
import { SettingsManager } from '../../game/SettingsManager';
import { getStatsManager } from '../../game/StatsManager';
import { getRouter } from '../../router';
import { getAudioManager } from '../../audio';
import { VirtualJoystick } from '../../ui/controls/VirtualJoystick';
import { BoostButton } from '../../ui/controls/BoostButton';
import { HUDManager } from '../../ui/hud/HUDManager';
import { MiniMap } from '../../ui/hud/MiniMap';
import { Config } from '../../config';

/**
 * PlayPage - Hosts the game canvas and controls
 * 
 * Flow:
 * 1. User enters /play route
 * 2. PlayPage shows "Enter Name" → "Start" prompt
 * 3. On start: create Game, init controls, begin gameplay
 * 4. On back/game over: cleanup and navigate away
 */
export class PlayPage {
    private container: HTMLElement;
    private game: Game | null = null;
    private settingsManager: SettingsManager;
    private canvas: HTMLCanvasElement | null = null;
    private unsubscribeLocale: (() => void) | null = null;
    private gameStartTime: number = 0;
    private isGameRunning: boolean = false;
    private isDestroyed: boolean = false;

    // HUD
    private hud: HUDManager | null = null;
    private miniMap: MiniMap | null = null;
    private leaderboard: HTMLElement | null = null;
    private bossHUD: HTMLElement | null = null;
    private bossOverlay: HTMLElement | null = null;
    private bossModeActive: boolean = false;
    private lastBossRumbleMs: number = 0;
    private lastBossCountdownSecond: number | null = null;

    // Mobile controls
    private joystick: VirtualJoystick | null = null;
    private boostButton: BoostButton | null = null;

    // Update loop
    private updateLoopId: number | null = null;

    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;
        this.container = document.createElement('div');
        this.container.className = 'play-page';
        this.showStartScreen();

        this.unsubscribeLocale = onLocaleChange(() => {
            if (!this.isGameRunning) {
                this.showStartScreen();
            }
        });
    }

    /**
     * Show the "Enter your name" start screen
     */
    private showStartScreen(): void {
        // Get saved player name
        const savedName = localStorage.getItem('snake01.playerName') || '';

        this.container.innerHTML = `
            <div class="play-start-screen">
                <div class="play-start-content">
                    <h1 class="play-start-title">🐍 ${t('menu.title')}</h1>
                    <p class="play-start-subtitle">${t('menu.tagline')}</p>
                    
                    <div class="play-name-input-group">
                        <label for="playerNameInput" class="play-name-label">${t('menu.enterName')}</label>
                        <input type="text" 
                               id="playerNameInput" 
                               class="play-name-input" 
                               value="${savedName}"
                               placeholder="${t('menu.playerName')}"
                               maxlength="15"
                               autocomplete="off">
                    </div>
                    
                    <button class="btn btn-primary play-start-btn" id="startGameBtn">
                        ${t('menu.play')}
                    </button>
                    
                    <button class="play-back-link" id="backToHome">
                        ← ${t('nav.home')}
                    </button>
                </div>
            </div>
        `;

        this.setupStartScreenEvents();
    }

    private setupStartScreenEvents(): void {
        const startBtn = this.container.querySelector('#startGameBtn');
        const nameInput = this.container.querySelector('#playerNameInput') as HTMLInputElement;
        const backBtn = this.container.querySelector('#backToHome');

        startBtn?.addEventListener('click', () => {
            const name = nameInput?.value.trim() || 'Player';
            localStorage.setItem('snake01.playerName', name);
            this.startGame(name);
        });

        nameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const name = nameInput.value.trim() || 'Player';
                localStorage.setItem('snake01.playerName', name);
                this.startGame(name);
            }
        });

        backBtn?.addEventListener('click', () => {
            getRouter().navigate('/');
        });

        // Focus name input
        setTimeout(() => nameInput?.focus(), 100);
    }

    /**
     * Start the actual game
     */
    private startGame(playerName: string): void {
        if (this.isGameRunning || this.isDestroyed) return;

        console.log('[PlayPage] Starting game for:', playerName);

        this.isGameRunning = true;
        this.gameStartTime = Date.now();

        // Build game UI
        this.container.innerHTML = `
            <div class="play-container">
                <canvas id="gameCanvas"></canvas>
                <div id="ui-layer" class="play-ui-layer"></div>
                <button class="play-back-btn" id="backToHome" aria-label="${t('nav.home')}">
                    <span>←</span>
                </button>
            </div>
        `;

        // Get canvas
        this.canvas = this.container.querySelector('#gameCanvas');
        if (!this.canvas) {
            console.error('[PlayPage] Canvas not found!');
            return;
        }

        // Set canvas size
        this.resizeCanvas();
        window.addEventListener('resize', this.handleResize);

        // Create game instance
        console.log('[PlayPage] Creating game instance...');
        this.game = new Game(this.canvas);

        // Initialize HUD
        this.initHUD();

        // Initialize mobile controls
        if (this.isTouchDevice()) {
            this.initMobileControls();
        }

        // Start game loop
        console.log('[PlayPage] Starting game loop...');
        this.game.start();

        // Actually start gameplay (creates player, bots, etc.)
        console.log('[PlayPage] Starting gameplay...');
        this.game.startGame(playerName);

        // Play start sound
        getAudioManager().play('start');

        // Start HUD update loop
        this.startUpdateLoop();

        // Setup game events
        this.setupGameEvents();

        console.log('[PlayPage] Game started successfully!');
    }

    private handleResize = (): void => {
        this.resizeCanvas();
    };

    private resizeCanvas(): void {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    private initHUD(): void {
        const uiLayer = this.container.querySelector('#ui-layer');
        if (!uiLayer) return;

        // Boss overlay (darken UI/canvas slightly when boss is active)
        this.bossOverlay = document.createElement('div');
        this.bossOverlay.className = 'boss-overlay hidden';
        uiLayer.appendChild(this.bossOverlay);

        // Boss HUD (countdown)
        this.bossHUD = document.createElement('div');
        this.bossHUD.className = 'boss-hud hidden';
        this.bossHUD.innerHTML = `
            <div class="boss-warning">BOSS HAS ARRIVED</div>
            <div class="boss-timer">Explodes in: <span id="boss-timer-val">${Config.BOSS_LIFETIME_SECONDS}</span>s</div>
            <div class="boss-countdown" aria-hidden="true">
              <div class="boss-countdown-track">
                <div class="boss-countdown-fill" id="boss-countdown-fill" style="width: 100%"></div>
              </div>
            </div>
        `;
        uiLayer.appendChild(this.bossHUD);

        // Create HUD
        this.hud = new HUDManager();
        uiLayer.appendChild(this.hud.getElement());
        this.hud.show();

        // Create MiniMap
        this.miniMap = new MiniMap({
            worldWidth: Config.WORLD_WIDTH,
            worldHeight: Config.WORLD_HEIGHT,
        });
        uiLayer.appendChild(this.miniMap.getElement());
        this.miniMap.show();

        // Create Leaderboard
        this.leaderboard = document.createElement('div');
        this.leaderboard.className = 'leaderboard';
        this.leaderboard.innerHTML = `
            <div class="leaderboard-title">${t('hud.rank')}</div>
            <div class="leaderboard-list" id="leaderboardEntries"></div>
        `;
        uiLayer.appendChild(this.leaderboard);
    }

    private initMobileControls(): void {
        const uiLayer = this.container.querySelector('#ui-layer');
        if (!uiLayer) return;

        const settings = this.settingsManager.getSettings();

        this.joystick = new VirtualJoystick({
            size: settings.controls.joystickSize,
            position: settings.controls.joystickPosition,
            deadZone: 10,
            maxRadius: 50,
        });

        this.boostButton = new BoostButton({
            size: 80,
            position: settings.controls.joystickPosition === 'left' ? 'right' : 'left',
        });

        uiLayer.appendChild(this.joystick.getElement());
        uiLayer.appendChild(this.boostButton.getElement());

        this.joystick.show();
        this.boostButton.show();
    }

    private isTouchDevice(): boolean {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    private setupGameEvents(): void {
        const backBtn = this.container.querySelector('#backToHome');
        backBtn?.addEventListener('click', () => {
            this.cleanup();
            getRouter().navigate('/');
        });

        // Pause on Escape
        window.addEventListener('keydown', this.handleKeyDown);
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape' && this.game && this.isGameRunning) {
            if (this.game.paused) {
                this.game.resume();
            } else {
                this.game.pause();
            }
        }
    };

    private startUpdateLoop(): void {
        const update = () => {
            if (this.isDestroyed || !this.isGameRunning) return;

            if (this.game) {
                if (this.game.state === 'playing' && !this.game.paused) {
                    this.updateHUD();
                    this.updateLeaderboard();
                    this.updateMiniMap();
                    this.updateBossUI();
                } else if (this.game.state === 'gameover') {
                    this.handleGameOver();
                    return; // Stop update loop
                }
            }

            this.updateLoopId = requestAnimationFrame(update);
        };
        this.updateLoopId = requestAnimationFrame(update);
    }

    private updateHUD(): void {
        const player = this.game?.getPlayer();
        if (!player || !this.hud) return;

        const leaderboard = this.game!.getLeaderboard();
        const rank = leaderboard.findIndex(e => e.isPlayer) + 1;

        this.hud.update({
            score: player.score,
            mass: player.mass,
            rank: rank || 1,
            boostCharge: player.boostEnergy,
            maxBoost: 100,
        });

        this.boostButton?.updateCharge(player.boostEnergy);
    }

    private updateBossUI(): void {
        if (!this.game) return;

        const boss = this.game.getBoss();
        if (boss && boss.isAlive) {
            this.bossHUD?.classList.remove('hidden');
            this.bossOverlay?.classList.remove('hidden');
            document.body.classList.add('boss-mode');

            const timer = this.bossHUD?.querySelector('#boss-timer-val');
            if (timer) timer.textContent = Math.ceil(boss.lifetime).toString();

            const fill = this.bossHUD?.querySelector('#boss-countdown-fill') as HTMLElement | null;
            if (fill) {
                const pct = Math.max(0, Math.min(1, boss.lifetime / Config.BOSS_LIFETIME_SECONDS)) * 100;
                fill.style.width = `${pct}%`;
            }

            if (!this.bossModeActive) {
                this.bossModeActive = true;
                this.lastBossRumbleMs = 0;
                this.lastBossCountdownSecond = null;
            }

            // Periodic ominous rumble (not constant; rate-limited)
            const now = performance.now();
            if (now - this.lastBossRumbleMs >= 4500) {
                getAudioManager().play('bossRumble', { volume: 0.8, pitchVariance: 0.01 });
                this.lastBossRumbleMs = now;
            }

            // Final 10s countdown ticks
            const remaining = Math.ceil(boss.lifetime);
            if (remaining <= 10 && remaining >= 1) {
                if (this.lastBossCountdownSecond !== remaining) {
                    getAudioManager().play('bossTick', { volume: 0.9, pitchVariance: 0.0 });
                    this.lastBossCountdownSecond = remaining;
                }
            } else {
                this.lastBossCountdownSecond = null;
            }
        } else {
            this.bossHUD?.classList.add('hidden');
            this.bossOverlay?.classList.add('hidden');
            document.body.classList.remove('boss-mode');
            this.bossModeActive = false;
            this.lastBossCountdownSecond = null;
        }
    }

    private updateLeaderboard(): void {
        if (!this.game || !this.leaderboard) return;

        const entriesContainer = this.leaderboard.querySelector('#leaderboardEntries');
        if (!entriesContainer) return;

        const entries = this.game.getLeaderboard();
        entriesContainer.innerHTML = entries
            .map((entry, i) => `
                <div class="leaderboard-entry${entry.isPlayer ? ' self' : ''}">
                    <span class="leaderboard-rank">${i + 1}.</span>
                    <span class="leaderboard-name">${entry.name}</span>
                    <span class="leaderboard-score">${entry.score}</span>
                </div>
            `)
            .join('');
    }

    private updateMiniMap(): void {
        const player = this.game?.getPlayer();
        if (!player || !this.miniMap) return;

        const snakes = this.game!.getAllSnakes();
        const miniMapSnakes = snakes.map(snake => ({
            segments: snake.segments.map(seg => ({
                x: seg.position.x,
                y: seg.position.y
            })),
            color: snake.palette.primary,
            isPlayer: snake.isPlayer,
            name: snake.name
        }));

        this.miniMap.update(
            player.segments[0]?.position.x || 0,
            player.segments[0]?.position.y || 0,
            miniMapSnakes,
            window.innerWidth * 1.5,
            window.innerHeight * 1.5
        );
    }

    private handleGameOver(): void {
        if (!this.game) return;

        const player = this.game.getPlayer();
        const score = player?.score || 0;
        const survivalTime = Date.now() - this.gameStartTime;

        // Record stats
        getStatsManager().recordGameEnd(score, survivalTime);

        // Play death sound
        getAudioManager().play('death');

        // Show game over screen
        this.showGameOverScreen(score, survivalTime);
    }

    private showGameOverScreen(score: number, survivalTime: number): void {
        const killedBy = this.game?.getLastKiller() || 'Unknown';
        const highScore = this.game?.getHighScore() || 0;
        const isNewHighScore = score > highScore && score > 0;

        const survivalStr = this.formatTime(survivalTime);

        this.container.innerHTML = `
            <div class="play-gameover-screen">
                <div class="play-gameover-content">
                    <h1 class="play-gameover-title">${t('gameOver.title')}</h1>
                    ${isNewHighScore ? `<p class="play-gameover-highscore">🏆 ${t('gameOver.newHighScore')}</p>` : ''}
                    
                    <div class="play-gameover-stats">
                        <div class="play-gameover-stat">
                            <span class="play-gameover-stat-label">${t('gameOver.finalScore')}</span>
                            <span class="play-gameover-stat-value">${score}</span>
                        </div>
                        <div class="play-gameover-stat">
                            <span class="play-gameover-stat-label">${t('gameOver.survivalTime')}</span>
                            <span class="play-gameover-stat-value">${survivalStr}</span>
                        </div>
                        <div class="play-gameover-stat">
                            <span class="play-gameover-stat-label">${t('gameOver.killedBy')}</span>
                            <span class="play-gameover-stat-value">${killedBy}</span>
                        </div>
                    </div>
                    
                    <div class="play-gameover-actions">
                        <button class="btn btn-primary" id="playAgainBtn">${t('gameOver.playAgain')}</button>
                        <button class="btn btn-secondary" id="mainMenuBtn">${t('gameOver.mainMenu')}</button>
                    </div>
                </div>
            </div>
        `;

        this.isGameRunning = false;

        // Setup events
        this.container.querySelector('#playAgainBtn')?.addEventListener('click', () => {
            const savedName = localStorage.getItem('snake01.playerName') || 'Player';
            this.startGame(savedName);
        });

        this.container.querySelector('#mainMenuBtn')?.addEventListener('click', () => {
            this.cleanup();
            getRouter().navigate('/');
        });
    }

    private formatTime(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${seconds}s`;
    }

    /**
     * Called when leaving the page
     */
    cleanup(): void {
        console.log('[PlayPage] Cleaning up...');

        // Stop update loop
        if (this.updateLoopId) {
            cancelAnimationFrame(this.updateLoopId);
            this.updateLoopId = null;
        }

        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);

        // Record stats if game was active
        if (this.game && this.game.state === 'playing' && this.isGameRunning) {
            const player = this.game.getPlayer();
            if (player) {
                const survivalTime = Date.now() - this.gameStartTime;
                getStatsManager().recordGameEnd(player.score, survivalTime);
            }
        }

        // Clear game reference
        this.game = null;
        this.isGameRunning = false;

        // Ensure boss mode visuals are cleared
        document.body.classList.remove('boss-mode');
        this.bossModeActive = false;
        this.lastBossCountdownSecond = null;
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        console.log('[PlayPage] Destroying...');
        this.isDestroyed = true;
        this.unsubscribeLocale?.();
        this.cleanup();
    }
}
