import { isRTL, t, onLocaleChange } from '../../i18n';
import { Game } from '../../game/Game';
import { SettingsManager } from '../../game/SettingsManager';
import { getRouter } from '../../router';
import { getAudioManager } from '../../audio';
import { VirtualJoystick } from '../../ui/controls/VirtualJoystick';
import { BoostButton } from '../../ui/controls/BoostButton';
import { HUDManager } from '../../ui/hud/HUDManager';
import { MiniMap } from '../../ui/hud/MiniMap';
import { Config } from '../../config';
import { Vector2 } from '../../utils/utils';
import { getDeferredInstallPrompt, isMobileLike, isStandaloneMode, promptInstallIfAvailable } from '../../pwa/install';
import { getAuthState, submitGameSession, submitScore, subscribeAuth } from '../../supabase';
import { getMusicManager } from '../../audio';
import { getCookie, setCookie } from '../../utils/cookies';

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
    private unsubscribeAuth: (() => void) | null = null;
    private unsubscribeSettings: (() => void) | null = null;
    private gameStartTime: number = 0;
    private isGameRunning: boolean = false;
    private isDestroyed: boolean = false;
    private installOverlayVisible: boolean = false;
    private installDismissed: boolean = false;

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
    private lastPlayerName: string = 'Player';
    private mobileControlMode: 'joystick' | 'touch' = 'joystick';

    // Touch-drag controls (mouse-like)
    private touchPointerId: number | null = null;
    private touchActive: boolean = false;
    private touchPos: Vector2 = Vector2.zero();
    private boostLocked: boolean = false;
    private lastTapMs: number = 0;
    private touchListenersAttached: boolean = false;
    private touchHandlers: {
        onPointerDown: (e: PointerEvent) => void;
        onPointerMove: (e: PointerEvent) => void;
        onPointerUp: (e: PointerEvent) => void;
        onPointerCancel: (e: PointerEvent) => void;
    } | null = null;

    // Update loop
    private updateLoopId: number | null = null;

    // Orientation guard (mobile)
    private rotateOverlay: HTMLElement | null = null;
    private orientationBlocked: boolean = false;
    private pausedByOrientation: boolean = false;

    // Haptics (mobile vibration)
    private vibrationEnabled: boolean = true;
    private lastVibrateMs: number = 0;

    // Start screen orientation listener
    private startScreenResizeHandler: (() => void) | null = null;

    // UI update throttling for performance presets
    private uiUpdateIntervalMs: number = 0;
    private lastUiUpdateMs: number = 0;

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

        this.unsubscribeAuth = subscribeAuth(() => {
            if (!this.isGameRunning) {
                this.showStartScreen();
            }
        });
    }

    private backArrow(): string {
        return isRTL() ? '→' : '←';
    }

    private vibrate(pattern: number | number[]): void {
        if (!this.isTouchDevice()) return;
        if (!this.vibrationEnabled) return;
        if (this.orientationBlocked) return;
        if (!('vibrate' in navigator)) return;
        const fn = navigator.vibrate?.bind(navigator);
        if (typeof fn !== 'function') return;

        const now = performance.now();
        if (now - this.lastVibrateMs < 45) return;
        this.lastVibrateMs = now;
        try {
            fn(pattern);
        } catch {
            // ignore
        }
    }

    /**
     * Show the "Enter your name" start screen
     */
    private showStartScreen(): void {
        const auth = getAuthState();
        const user = auth.user;
        const profile = auth.profile;
        const cloudName =
            profile?.username ||
            (user?.user_metadata?.full_name as string | undefined) ||
            (user?.user_metadata?.name as string | undefined) ||
            (user?.email ? user.email.split('@')[0] : null) ||
            null;

        // Always prefer the signed-in user name when available.
        this.lastPlayerName = (cloudName || this.lastPlayerName || 'Player').toString().slice(0, 20);

        const mobile = isMobileLike();
        this.installDismissed = getCookie('supersnake_install_dismissed') === '1';
        const showInstallCard = mobile && !isStandaloneMode() && !this.installDismissed;
        const mustRotate = this.isTouchDevice() && this.isPortrait();

        this.container.innerHTML = `
            <div class="play-start-screen">
                <div class="play-start-content">
                    <h1 class="play-start-title">🐍 ${t('menu.title')}</h1>
                    <p class="play-start-subtitle">${t('menu.tagline')}</p>

                    ${mustRotate ? `
                        <div class="panel panel-warning" style="margin-bottom: 12px;">
                            <div class="panel-title">${t('play.rotateTitle')}</div>
                            <div class="panel-text">${t('play.rotateSubtitle')}</div>
                        </div>
                    ` : ''}

                    ${showInstallCard ? `
                        <div class="install-required-card">
                            <div class="install-required-title">${t('play.installCardTitle')}</div>
                            <div class="install-required-text">
                                ${t('play.installCardText')}
                            </div>
                            <button class="btn btn-primary" id="openInstallGateBtn" type="button">
                                ${t('play.installOpenButton')}
                            </button>
                            <div class="install-required-hint">
                                ${t('play.installIosHintShort')}
                            </div>
                        </div>
                    ` : ''}

                    <div class="play-name-input-group">
                        <div class="play-name-label">${t('play.playerName')}</div>
                        <div class="play-name-input" style="pointer-events:none; user-select:none;">
                            ${this.escapeHtml(this.lastPlayerName)}
                        </div>
                    </div>
                    
                    <button class="btn btn-primary play-start-btn" id="startGameBtn" ${mustRotate ? 'disabled aria-disabled="true"' : ''}>
                        ${t('menu.play')}
                    </button>
                    
                    <button class="play-back-link" id="backToHome">
                        ${this.backArrow()} ${t('nav.home')}
                    </button>
                </div>
            </div>

            ${this.installOverlayVisible ? this.renderInstallOverlay() : ''}
        `;

        this.setupStartScreenEvents();
        if (this.installOverlayVisible) {
            this.attachInstallOverlayHandlers();
        }

        // Keep the rotate warning in sync while on the start screen.
        if (this.startScreenResizeHandler) {
            window.removeEventListener('resize', this.startScreenResizeHandler);
            window.removeEventListener('orientationchange', this.startScreenResizeHandler);
            this.startScreenResizeHandler = null;
        }
        if (!this.isGameRunning && this.isTouchDevice()) {
            const handler = () => {
                if (!this.isGameRunning) this.showStartScreen();
            };
            this.startScreenResizeHandler = handler;
            window.addEventListener('resize', handler);
            window.addEventListener('orientationchange', handler);
        }
    }

    private setupStartScreenEvents(): void {
        const startBtn = this.container.querySelector('#startGameBtn');
        const backBtn = this.container.querySelector('#backToHome');
        const openInstallGateBtn = this.container.querySelector('#openInstallGateBtn');

        startBtn?.addEventListener('click', () => {
            // Best-effort: fullscreen + landscape lock must be triggered by a user gesture.
            this.tryEnterFullscreen();
            void this.tryLockLandscape();
            this.startGame(this.lastPlayerName || 'Player');
        });

        backBtn?.addEventListener('click', () => {
            getRouter().navigate('/');
        });

        openInstallGateBtn?.addEventListener('click', () => {
            this.installOverlayVisible = true;
            this.showStartScreen();
        });
    }

    /**
     * Start the actual game
     */
    private startGame(playerName: string): void {
        if (this.isGameRunning || this.isDestroyed) return;

        console.log('[PlayPage] Starting game for:', playerName);

        if (this.startScreenResizeHandler) {
            window.removeEventListener('resize', this.startScreenResizeHandler);
            window.removeEventListener('orientationchange', this.startScreenResizeHandler);
            this.startScreenResizeHandler = null;
        }

        this.isGameRunning = true;
        this.gameStartTime = Date.now();

        // Build game UI
        this.container.innerHTML = `
            <div class="play-container">
                <canvas id="gameCanvas"></canvas>
                <div id="ui-layer" class="play-ui-layer"></div>
                <button class="play-back-btn" id="backToHome" aria-label="${t('nav.home')}">
                    <span>${this.backArrow()}</span>
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
        const initialSettings = this.settingsManager.getSettings();
        this.vibrationEnabled = !!initialSettings.audio.vibration;
        this.uiUpdateIntervalMs = this.getUiUpdateIntervalForQuality(initialSettings.graphics.quality);
        this.game.applySettings(initialSettings);
        this.unsubscribeSettings?.();
        this.unsubscribeSettings = this.settingsManager.subscribe((newSettings) => {
            this.game?.applySettings(newSettings);
            this.vibrationEnabled = !!newSettings.audio.vibration;
            this.uiUpdateIntervalMs = this.getUiUpdateIntervalForQuality(newSettings.graphics.quality);

            // Live-update mobile control layout
            this.mobileControlMode = newSettings.controls.mobileControlMode;
            if (this.isTouchDevice()) {
                this.configureMobileControls();
            }

            if (this.joystick) {
                this.joystick.updateConfig({
                    size: newSettings.controls.joystickSize,
                    position: newSettings.controls.joystickPosition,
                    deadZone: Math.max(8, Math.round(newSettings.controls.joystickSize * 0.07)),
                    maxRadius: Math.max(44, Math.round(newSettings.controls.joystickSize * 0.42)),
                });
            }
            if (this.boostButton) {
                this.boostButton.updateConfig({
                    position: newSettings.controls.joystickPosition === 'left' ? 'right' : 'left',
                    vibrate: (p) => this.vibrate(p),
                });
            }

            this.controlSensitivity = newSettings.controls.sensitivity;
        });

        // Initialize HUD
        this.initHUD();

        // Initialize mobile controls
        if (this.isTouchDevice()) {
            this.mobileControlMode = this.settingsManager.getSettings().controls.mobileControlMode;
            this.initMobileControls();
        }

        // Enforce landscape-only on touch devices.
        this.initOrientationGuard();
        this.updateOrientationGuard();

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
        // Small haptic tap on start (if enabled)
        this.vibrate(12);

        // Start HUD update loop
        this.startUpdateLoop();

        // Setup game events
        this.setupGameEvents();

        console.log('[PlayPage] Game started successfully!');
    }

    private getUiUpdateIntervalForQuality(quality: string): number {
        // Lower presets throttle HUD/minimap updates for real FPS gains on low-end devices.
        switch (quality) {
            case 'medium':
            case 'low':
                return 120;
            case 'high':
                return 70;
            default:
                return 0; // every frame
        }
    }

    private tryEnterFullscreen(): void {
        try {
            if (!this.isTouchDevice()) return;
            if (document.fullscreenElement) return;
            const el: any = document.documentElement;
            const fn: any = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
            if (typeof fn === 'function') {
                const p = fn.call(el);
                if (p && typeof p.catch === 'function') p.catch(() => { });
            }
        } catch {
            // ignore
        }
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

    // Mobile controls are configured dynamically based on settings (joystick vs touch-drag).

    private initOrientationGuard(): void {
        if (this.rotateOverlay) return;

        const uiLayer = this.container.querySelector('#ui-layer');
        if (!uiLayer) return;

        this.rotateOverlay = document.createElement('div');
        this.rotateOverlay.className = 'rotate-overlay hidden';
        this.rotateOverlay.innerHTML = `
            <div class="rotate-card" role="dialog" aria-modal="true" aria-label="${t('play.rotateDialogLabel')}">
                <div class="rotate-icon" aria-hidden="true">📱↻</div>
                <div class="rotate-title">${t('play.rotateTitle')}</div>
                <div class="rotate-subtitle">${t('play.rotateSubtitle')}</div>
                <button class="btn btn-primary rotate-try" id="tryRotateBtn" type="button">${t('play.rotateTryAgain')}</button>
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
            <div class="install-overlay" role="dialog" aria-modal="true" aria-label="${t('play.installDialogLabel')}">
                <div class="install-card">
                    <div class="install-icon" aria-hidden="true">⬇️📱</div>
                    <div class="install-title">${t('play.installTitle')}</div>
                    <div class="install-text">
                        ${t('play.installText')}
                    </div>

                    <div class="install-steps">
                        <div class="install-step"><strong>${t('play.installAndroidTitle')}:</strong> ${t('play.installAndroidStep')}</div>
                        <div class="install-step"><strong>${t('play.installIosTitle')}:</strong> ${t('play.installIosStep')}</div>
                    </div>

                    <div class="install-actions">
                        <button class="btn btn-primary" id="installNowBtn" type="button" ${hasPrompt ? '' : 'disabled aria-disabled="true"'}>${t('play.installNow')}</button>
                        <button class="btn btn-secondary" id="installCheckBtn" type="button">${t('play.installDone')}</button>
                    </div>

                    <button class="install-close" id="installCloseBtn" type="button" aria-label="${t('play.installClose')}">×</button>
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
            setCookie('supersnake_install_dismissed', '1', { maxAgeSeconds: 60 * 60 * 24 * 30, path: '/', sameSite: 'Lax' });
            this.installOverlayVisible = false;
            this.showStartScreen();
        });

        const installCloseBtn = this.container.querySelector('#installCloseBtn');
        installCloseBtn?.addEventListener('click', () => {
            setCookie('supersnake_install_dismissed', '1', { maxAgeSeconds: 60 * 60 * 24 * 30, path: '/', sameSite: 'Lax' });
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
                        const now = performance.now();
                        const shouldUpdateUi = this.uiUpdateIntervalMs <= 0 || (now - this.lastUiUpdateMs >= this.uiUpdateIntervalMs);
                        if (shouldUpdateUi) {
                            this.lastUiUpdateMs = now;
                            this.updateHUD();
                            this.updateLeaderboard();
                            this.updateMiniMap();
                        }
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

        if (this.mobileControlMode === 'touch') {
            const now = performance.now();
            const dtSec = this.lastControlSyncMs > 0 ? Math.min(0.05, (now - this.lastControlSyncMs) / 1000) : (1 / 60);
            this.lastControlSyncMs = now;

            const sensitivity = Math.max(1, Math.min(10, this.controlSensitivity));
            const base = 0.10 + ((sensitivity - 1) / 9) * 0.35; // responsiveness: 0.10..0.45
            const follow = 1 - Math.pow(1 - base, dtSec * 60);
            const release = 1 - Math.pow(1 - 0.42, dtSec * 60);

            const screenCenter = new Vector2(window.innerWidth / 2, window.innerHeight / 2);
            const target = this.touchActive ? this.touchPos.subtract(screenCenter) : Vector2.zero();
            const dist = target.magnitude();
            const mag = this.touchActive ? Math.max(0, Math.min(1, (dist - 20) / 240)) : 0;
            if (!this.touchActive) {
                // Immediate stop on release (feels responsive on mobile).
                this.smoothedJoystick = Vector2.zero();
                this.game.getInput().setExternalJoystick(Vector2.zero(), false);
                this.game.getInput().setExternalBoostPressed(this.boostLocked);
                return;
            }

            if (dist > 20) {
                this.smoothedJoystick = this.smoothedJoystick.lerp(target.normalize(), follow);
            } else {
                this.smoothedJoystick = this.smoothedJoystick.lerp(Vector2.zero(), release);
            }

            const active = mag > 0.02;
            const finalDir = active ? this.smoothedJoystick.multiply(mag) : Vector2.zero();
            this.game.getInput().setExternalJoystick(finalDir, active);
            this.game.getInput().setExternalBoostPressed(this.boostLocked);
            return;
        }

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

            if (!state.active || state.magnitude <= 0.01) {
                this.smoothedJoystick = Vector2.zero();
                this.game.getInput().setExternalJoystick(Vector2.zero(), false);
            } else if (state.magnitude > 0.06 && target.magnitude() > 0) {
                this.smoothedJoystick = this.smoothedJoystick.lerp(target.normalize(), follow);
            } else {
                this.smoothedJoystick = this.smoothedJoystick.lerp(Vector2.zero(), release);
            }

            const active = state.active && state.magnitude > 0.02;
            const finalDir = active ? this.smoothedJoystick.multiply(state.magnitude) : Vector2.zero();
            this.game.getInput().setExternalJoystick(finalDir, active);
        }

        if (this.boostButton) {
            this.game.getInput().setExternalBoostPressed(this.boostButton.isBoostPressed());
        }
    }

    private initMobileControls(): void {
        this.configureMobileControls();
    }

    private configureMobileControls(): void {
        if (!this.game) return;
        const uiLayer = this.container.querySelector('#ui-layer') as HTMLElement | null;
        if (!uiLayer) return;

        // Cleanup existing controls
        this.joystick?.destroy();
        this.joystick = null;
        this.boostButton?.destroy();
        this.boostButton = null;

        this.detachTouchDragListeners();
        this.boostLocked = false;
        this.touchActive = false;
        this.touchPointerId = null;

        if (this.mobileControlMode === 'touch') {
            // No UI controls; use touch-drag like mouse.
            this.game.getInput().setExternalControlsEnabled(true);
            this.attachTouchDragListeners();
            return;
        }

        // Joystick + Boost button UI
        const settings = this.settingsManager.getSettings();
        this.joystick = new VirtualJoystick({
            size: settings.controls.joystickSize,
            position: settings.controls.joystickPosition,
            deadZone: Math.max(8, Math.round(settings.controls.joystickSize * 0.07)),
            maxRadius: Math.max(44, Math.round(settings.controls.joystickSize * 0.42)),
            vibrate: (p) => this.vibrate(p),
        });
        uiLayer.appendChild(this.joystick.getElement());
        this.joystick.show();

        this.boostButton = new BoostButton({
            position: settings.controls.joystickPosition === 'left' ? 'right' : 'left',
            size: 80,
            vibrate: (p) => this.vibrate(p),
        });
        uiLayer.appendChild(this.boostButton.getElement());
        this.boostButton.show();

        this.game.getInput().setExternalControlsEnabled(true);
    }

    private attachTouchDragListeners(): void {
        if (!this.canvas || this.touchListenersAttached) return;
        this.touchListenersAttached = true;

        const onPointerDown = (e: PointerEvent) => {
            if (!this.canvas) return;
            if (e.pointerType !== 'touch') return;
            // Double-tap toggles continuous boost
            const now = performance.now();
            if (now - this.lastTapMs < 280) {
                this.boostLocked = !this.boostLocked;
                this.lastTapMs = 0;
                this.vibrate(this.boostLocked ? 16 : 10);
            } else {
                this.lastTapMs = now;
            }

            this.touchPointerId = e.pointerId;
            this.touchActive = true;
            this.touchPos = new Vector2(e.clientX, e.clientY);
            try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!this.touchActive || this.touchPointerId !== e.pointerId) return;
            this.touchPos = new Vector2(e.clientX, e.clientY);
        };

        const onPointerUp = (e: PointerEvent) => {
            if (this.touchPointerId !== e.pointerId) return;
            this.touchActive = false;
            this.touchPointerId = null;
            this.smoothedJoystick = Vector2.zero();
            this.game?.getInput().setExternalJoystick(Vector2.zero(), false);
        };

        const onPointerCancel = (e: PointerEvent) => {
            if (this.touchPointerId !== e.pointerId) return;
            this.touchActive = false;
            this.touchPointerId = null;
            this.smoothedJoystick = Vector2.zero();
            this.game?.getInput().setExternalJoystick(Vector2.zero(), false);
        };

        this.touchHandlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };

        this.canvas.addEventListener('pointerdown', onPointerDown);
        this.canvas.addEventListener('pointermove', onPointerMove);
        this.canvas.addEventListener('pointerup', onPointerUp);
        this.canvas.addEventListener('pointercancel', onPointerCancel);
    }

    private detachTouchDragListeners(): void {
        if (!this.canvas || !this.touchListenersAttached) return;
        this.touchListenersAttached = false;
        const h = this.touchHandlers;
        if (!h) return;
        this.canvas.removeEventListener('pointerdown', h.onPointerDown);
        this.canvas.removeEventListener('pointermove', h.onPointerMove);
        this.canvas.removeEventListener('pointerup', h.onPointerUp);
        this.canvas.removeEventListener('pointercancel', h.onPointerCancel);
        this.touchHandlers = null;
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

        // Cloud stats (mandatory login)
        void submitGameSession(score, survivalTime);

        // Cloud leaderboard (optional)
        void submitScore(score, this.game.getPlayerName());

        // Play death sound
        getAudioManager().play('death');
        this.vibrate([18, 70, 28]);

        // Show game over screen
        this.showGameOverScreen(score, survivalTime);
    }

    private showGameOverScreen(score: number, survivalTime: number): void {
        const killedByRaw = this.game?.getLastKiller() || 'Unknown';
        const killedBy = this.escapeHtml(killedByRaw);
        const highScore = this.game?.getHighScore() || 0;
        const isNewHighScore = score > 0 && score === highScore;
        const perf = this.game?.getPerformanceMetrics();
        const fps = perf?.fps ?? 0;
        const updateMs = perf?.updateTime ?? 0;
        const renderMs = perf?.renderTime ?? 0;

        const survivalStr = this.formatTime(survivalTime);

        this.container.innerHTML = `
            <div class="play-gameover-screen">
                <div class="play-gameover-content">
                    <div class="play-gameover-badge">${t('gameOver.title')}</div>
                    ${isNewHighScore ? `<div class="play-gameover-highscore">🏆 ${t('gameOver.newHighScore')}</div>` : ''}

                    <div class="play-gameover-cards">
                        <div class="play-gameover-card primary">
                            <div class="play-gameover-card-label">${t('gameOver.finalScore')}</div>
                            <div class="play-gameover-card-value">${score}</div>
                        </div>
                        <div class="play-gameover-card">
                            <div class="play-gameover-card-label">${t('gameOver.highScore')}</div>
                            <div class="play-gameover-card-value">${highScore}</div>
                        </div>
                        <div class="play-gameover-card">
                            <div class="play-gameover-card-label">${t('gameOver.survivalTime')}</div>
                            <div class="play-gameover-card-value">${survivalStr}</div>
                        </div>
                        <div class="play-gameover-card">
                            <div class="play-gameover-card-label">${t('gameOver.fps')}</div>
                            <div class="play-gameover-card-value">${fps} <span class="play-gameover-card-sub">(${updateMs.toFixed(1)}ms / ${renderMs.toFixed(1)}ms)</span></div>
                        </div>
                    </div>

                    <div class="play-gameover-meta">
                        <div class="play-gameover-meta-row">
                            <span class="play-gameover-meta-label">${t('gameOver.killedBy')}</span>
                            <span class="play-gameover-meta-value">${killedBy}</span>
                        </div>
                    </div>

                    <div class="play-gameover-actions">
                        <button class="btn btn-primary" id="playAgainBtn" type="button">${t('gameOver.playAgain')}</button>
                        <div class="play-gameover-actions-row">
                            <button class="btn btn-secondary" id="settingsBtn" type="button">${t('nav.settings')}</button>
                            <button class="btn btn-secondary" id="mainMenuBtn" type="button">${t('gameOver.mainMenu')}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.isGameRunning = false;

        // Setup events
        this.container.querySelector('#playAgainBtn')?.addEventListener('click', () => {
            this.tryEnterFullscreen();
            void this.tryLockLandscape();
            this.startGame(this.lastPlayerName || 'Player');
        });

        this.container.querySelector('#settingsBtn')?.addEventListener('click', () => {
            this.cleanup();
            getRouter().navigate('/settings');
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
        if (this.startScreenResizeHandler) {
            window.removeEventListener('resize', this.startScreenResizeHandler);
            window.removeEventListener('orientationchange', this.startScreenResizeHandler);
            this.startScreenResizeHandler = null;
        }

        // Record stats if game was active
        if (this.game && this.game.state === 'playing' && this.isGameRunning) {
            const player = this.game.getPlayer();
            if (player) {
                const survivalTime = Date.now() - this.gameStartTime;
                void submitGameSession(player.score, survivalTime);
                void submitScore(player.score, this.game.getPlayerName());
            }
        }

        // Clear game reference
        this.game = null;
        this.isGameRunning = false;

        // Ensure music stops when leaving gameplay (so it doesn't leak into other pages).
        getMusicManager().stop();

        // Ensure boss mode visuals are cleared
        document.body.classList.remove('boss-mode');
        document.body.classList.remove('orientation-blocked');
        this.bossModeActive = false;
        this.lastBossCountdownSecond = null;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        console.log('[PlayPage] Destroying...');
        this.isDestroyed = true;
        this.unsubscribeLocale?.();
        this.unsubscribeAuth?.();
        this.unsubscribeSettings?.();
        this.unsubscribeSettings = null;
        this.cleanup();
    }
}
