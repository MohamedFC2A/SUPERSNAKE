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
import { Vector2 } from '../../utils/utils';
import { getDeferredInstallPrompt, isMobileLike, isStandaloneMode, promptInstallIfAvailable } from '../../pwa/install';
import { submitScore } from '../../supabase';

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
    private unsubscribeSettings: (() => void) | null = null;
    private gameStartTime: number = 0;
    private isGameRunning: boolean = false;
    private isDestroyed: boolean = false;
    private installOverlayVisible: boolean = false;

    // Mobile control smoothing
    private controlSensitivity: number = 5;
    private smoothedJoystick: Vector2 = Vector2.zero();
    private lastControlSyncMs: number = 0;

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

    // Orientation guard (mobile)
    private rotateOverlay: HTMLElement | null = null;
    private orientationBlocked: boolean = false;
    private pausedByOrientation: boolean = false;

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
        const mobile = isMobileLike();
        const installed = isStandaloneMode();
        const desktopBlocked = !import.meta.env.DEV && !mobile;
        const installRequired = mobile && !installed;
        const startDisabled = desktopBlocked || installRequired;

        this.container.innerHTML = `
            <div class="play-start-screen">
                <div class="play-start-content">
                    <h1 class="play-start-title">🐍 ${t('menu.title')}</h1>
                    <p class="play-start-subtitle">${t('menu.tagline')}</p>

                    ${desktopBlocked ? `
                        <div class="install-required-card">
                            <div class="install-required-title">Mobile only</div>
                            <div class="install-required-text">
                                This game is designed for mobile. Please open it on your phone.
                            </div>
                        </div>
                    ` : ''}

                    ${installRequired ? `
                        <div class="install-required-card">
                            <div class="install-required-title">Install required</div>
                            <div class="install-required-text">
                                To play on mobile, you must install the game from your browser first.
                            </div>
                            <button class="btn btn-primary" id="openInstallGateBtn" type="button">
                                Install & Continue
                            </button>
                            <div class="install-required-hint">
                                iPhone/iPad: Share → Add to Home Screen
                            </div>
                        </div>
                    ` : ''}
                    
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
                    
                    <button class="btn btn-primary play-start-btn" id="startGameBtn" ${startDisabled ? 'disabled aria-disabled="true"' : ''}>
                        ${t('menu.play')}
                    </button>
                    
                    <button class="play-back-link" id="backToHome">
                        ← ${t('nav.home')}
                    </button>
                </div>
            </div>

            ${this.installOverlayVisible ? this.renderInstallOverlay() : ''}
        `;

        this.setupStartScreenEvents();
        if (this.installOverlayVisible) {
            this.attachInstallOverlayHandlers();
        }
    }

    private setupStartScreenEvents(): void {
        const startBtn = this.container.querySelector('#startGameBtn');
        const nameInput = this.container.querySelector('#playerNameInput') as HTMLInputElement;
        const backBtn = this.container.querySelector('#backToHome');
        const openInstallGateBtn = this.container.querySelector('#openInstallGateBtn');

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

        openInstallGateBtn?.addEventListener('click', () => {
            this.installOverlayVisible = true;
            this.showStartScreen();
        });

        // Focus name input
        setTimeout(() => nameInput?.focus(), 100);
    }

    /**
     * Start the actual game
     */
    private startGame(playerName: string): void {
        if (this.isGameRunning || this.isDestroyed) return;

        // Production: block desktop usage (mobile-only experience)
        if (!import.meta.env.DEV && !isMobileLike()) {
            this.installOverlayVisible = false;
            this.showStartScreen();
            return;
        }

        // Mobile-only requirement: must be installed (standalone)
        if (isMobileLike() && !isStandaloneMode()) {
            this.installOverlayVisible = true;
            this.showStartScreen();
            return;
        }

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

        // Apply settings (graphics quality / particles / grid) immediately and keep in sync
        this.game.applySettings(this.settingsManager.getSettings());
        this.unsubscribeSettings?.();
        this.unsubscribeSettings = this.settingsManager.subscribe((newSettings) => {
            this.game?.applySettings(newSettings);

            // Live-update mobile control layout
            if (this.joystick) {
                this.joystick.updateConfig({
                    size: newSettings.controls.joystickSize,
                    position: 'left',
                    deadZone: Math.max(8, Math.round(newSettings.controls.joystickSize * 0.07)),
                    maxRadius: Math.max(44, Math.round(newSettings.controls.joystickSize * 0.42)),
                });
            }
            if (this.boostButton) {
                this.boostButton.updateConfig({
                    position: 'right',
                });
            }

            this.controlSensitivity = newSettings.controls.sensitivity;
        });

        // Initialize HUD
        this.initHUD();

        // Initialize mobile controls
        if (this.isTouchDevice()) {
            this.initMobileControls();
        }

        // Connect external mobile controls to the game's input manager
        if (this.isTouchDevice()) {
            this.game.getInput().setExternalControlsEnabled(true);
        }

        // Start game loop
        console.log('[PlayPage] Starting game loop...');
        this.game.start();

        // Actually start gameplay (creates player, bots, etc.)
        console.log('[PlayPage] Starting gameplay...');
        this.game.startGame(playerName);

        // Play start sound
        getAudioManager().play('start');

        // Portrait is allowed on mobile (no forced rotate)

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

        // Renderer manages DPI scaling; we only notify the game of logical size changes.
        if (this.game) {
            this.game.resize(window.innerWidth, window.innerHeight);
        } else {
            this.canvas.style.width = `${window.innerWidth}px`;
            this.canvas.style.height = `${window.innerHeight}px`;
        }
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
        this.controlSensitivity = settings.controls.sensitivity;

        this.joystick = new VirtualJoystick({
            size: settings.controls.joystickSize,
            // Force mobile layout: joystick left, boost right
            position: 'left',
            deadZone: Math.max(8, Math.round(settings.controls.joystickSize * 0.07)),
            maxRadius: Math.max(44, Math.round(settings.controls.joystickSize * 0.42)),
        });

        this.boostButton = new BoostButton({
            size: 80,
            position: 'right',
        });

        uiLayer.appendChild(this.joystick.getElement());
        uiLayer.appendChild(this.boostButton.getElement());

        this.joystick.show();
        this.boostButton.show();
    }

    private initOrientationGuard(): void {
        if (this.rotateOverlay) return;

        const uiLayer = this.container.querySelector('#ui-layer');
        if (!uiLayer) return;

        this.rotateOverlay = document.createElement('div');
        this.rotateOverlay.className = 'rotate-overlay hidden';
        this.rotateOverlay.innerHTML = `
            <div class="rotate-card" role="dialog" aria-modal="true" aria-label="Rotate device">
                <div class="rotate-icon" aria-hidden="true">📱↻</div>
                <div class="rotate-title">Rotate your device</div>
                <div class="rotate-subtitle">Please switch to landscape to play</div>
                <button class="btn btn-primary rotate-try" id="tryRotateBtn" type="button">Try again</button>
            </div>
        `;
        uiLayer.appendChild(this.rotateOverlay);

        const tryBtn = this.rotateOverlay.querySelector('#tryRotateBtn');
        tryBtn?.addEventListener('click', async () => {
            await this.tryLockLandscape();
            this.updateOrientationGuard();
        });

        window.addEventListener('orientationchange', this.updateOrientationGuard);
        window.addEventListener('resize', this.updateOrientationGuard);
    }

    private isPortrait(): boolean {
        return window.innerHeight > window.innerWidth;
    }

    private tryLockLandscape = async (): Promise<void> => {
        try {
            // Works on some browsers (mainly Android Chrome) and requires a user gesture.
            if ((screen as any).orientation?.lock) {
                await (screen as any).orientation.lock('landscape');
            }
        } catch {
            // Ignore (unsupported or blocked)
        }
    };

    private updateOrientationGuard = (): void => {
        if (!this.isTouchDevice() || !this.game) return;

        const shouldBlock = this.isPortrait();
        this.orientationBlocked = shouldBlock;

        if (shouldBlock) {
            this.rotateOverlay?.classList.remove('hidden');
            document.body.classList.add('orientation-blocked');

            if (!this.game.paused) {
                this.game.pause();
                this.pausedByOrientation = true;
            }
        } else {
            this.rotateOverlay?.classList.add('hidden');
            document.body.classList.remove('orientation-blocked');

            if (this.pausedByOrientation) {
                this.game.resume();
                this.pausedByOrientation = false;
            }
        }
    };

    private renderInstallOverlay(): string {
        const hasPrompt = !!getDeferredInstallPrompt();
        return `
            <div class="install-overlay" role="dialog" aria-modal="true" aria-label="Install required">
                <div class="install-card">
                    <div class="install-icon" aria-hidden="true">⬇️📱</div>
                    <div class="install-title">Install required</div>
                    <div class="install-text">
                        This game runs on mobile only after you install it from your browser.
                    </div>

                    <div class="install-steps">
                        <div class="install-step"><strong>Android:</strong> Tap “Install” when prompted, then open from your home screen.</div>
                        <div class="install-step"><strong>iPhone/iPad:</strong> Share → “Add to Home Screen”, then open from the home screen.</div>
                    </div>

                    <div class="install-actions">
                        <button class="btn btn-primary" id="installNowBtn" type="button" ${hasPrompt ? '' : 'disabled aria-disabled="true"'}>Install</button>
                        <button class="btn btn-secondary" id="installCheckBtn" type="button">I installed, continue</button>
                    </div>

                    <button class="install-close" id="installCloseBtn" type="button" aria-label="Close">×</button>
                </div>
            </div>
        `;
    }

    private attachInstallOverlayHandlers(): void {
        const installNowBtn = this.container.querySelector('#installNowBtn');
        installNowBtn?.addEventListener('click', async () => {
            const result = await promptInstallIfAvailable();
            // Even if accepted, many browsers require opening the installed app from home screen.
            this.showStartScreen();
        });

        const installCheckBtn = this.container.querySelector('#installCheckBtn');
        installCheckBtn?.addEventListener('click', () => {
            if (isStandaloneMode()) {
                this.installOverlayVisible = false;
                this.showStartScreen();
            } else {
                // Keep overlay open; user still not in standalone.
                this.showStartScreen();
            }
        });

        const installCloseBtn = this.container.querySelector('#installCloseBtn');
        installCloseBtn?.addEventListener('click', () => {
            this.installOverlayVisible = false;
            this.showStartScreen();
        });
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
                if (this.game.state === 'playing') {
                    // Keep mobile controls synced even when paused (e.g., forced rotate overlay)
                    this.syncMobileControls();

                    if (!this.game.paused) {
                        this.updateHUD();
                        this.updateLeaderboard();
                        this.updateMiniMap();
                        this.updateBossUI();
                    } else {
                        this.updateBossUI();
                    }
                } else if (this.game.state === 'gameover') {
                    this.handleGameOver();
                    return; // Stop update loop
                }
            }

            this.updateLoopId = requestAnimationFrame(update);
        };
        this.updateLoopId = requestAnimationFrame(update);
    }

    private syncMobileControls(): void {
        if (!this.game) return;

        if (this.joystick) {
            const now = performance.now();
            const dtSec = this.lastControlSyncMs > 0 ? Math.min(0.05, (now - this.lastControlSyncMs) / 1000) : (1 / 60);
            this.lastControlSyncMs = now;

            const sensitivity = Math.max(1, Math.min(10, this.controlSensitivity));
            const base = 0.10 + ((sensitivity - 1) / 9) * 0.35; // responsiveness: 0.10..0.45
            const follow = 1 - Math.pow(1 - base, dtSec * 60);
            const release = 1 - Math.pow(1 - 0.42, dtSec * 60);

            const state = this.joystick.getState();
            const target = new Vector2(state.direction.x, state.direction.y);

            if (state.active && state.magnitude > 0.06 && target.magnitude() > 0) {
                this.smoothedJoystick = this.smoothedJoystick.lerp(target.normalize(), follow);
            } else {
                this.smoothedJoystick = this.smoothedJoystick.lerp(Vector2.zero(), release);
            }

            const active = state.active && this.smoothedJoystick.magnitude() > 0.08;
            const finalDir = active ? this.smoothedJoystick : Vector2.zero();
            this.game.getInput().setExternalJoystick(finalDir, active);
        }

        if (this.boostButton) {
            this.game.getInput().setExternalBoostPressed(this.boostButton.isBoostPressed());
        }
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

        const entries = this.game.getLeaderboard().slice(0, 3);
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

        // Cloud leaderboard (optional)
        void submitScore(score, this.game.getPlayerName());

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
        this.unsubscribeSettings?.();
        this.unsubscribeSettings = null;

        // Stop update loop
        if (this.updateLoopId) {
            cancelAnimationFrame(this.updateLoopId);
            this.updateLoopId = null;
        }

        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('orientationchange', this.updateOrientationGuard);
        window.removeEventListener('resize', this.updateOrientationGuard);

        // Record stats if game was active
        if (this.game && this.game.state === 'playing' && this.isGameRunning) {
            const player = this.game.getPlayer();
            if (player) {
                const survivalTime = Date.now() - this.gameStartTime;
                getStatsManager().recordGameEnd(player.score, survivalTime);
                void submitScore(player.score, this.game.getPlayerName());
            }
        }

        // Clear game reference
        this.game = null;
        this.isGameRunning = false;

        // Ensure boss mode visuals are cleared
        document.body.classList.remove('boss-mode');
        document.body.classList.remove('orientation-blocked');
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
        this.unsubscribeSettings?.();
        this.unsubscribeSettings = null;
        this.cleanup();
    }
}
