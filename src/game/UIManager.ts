import { Game } from './Game';
import { SettingsManager } from './SettingsManager';
import { SplashScreen } from '../ui/screens/SplashScreen';
import { MainMenu } from '../ui/screens/MainMenu';
import { GameOverScreen, GameOverStats } from '../ui/screens/GameOverScreen';
import { PauseMenu } from '../ui/screens/PauseMenu';
import { SettingsPanel } from '../ui/screens/SettingsPanel';
import { ChangelogPage } from '../ui/screens/ChangelogPage';
import { HUDManager } from '../ui/hud/HUDManager';
import { MiniMap, MiniMapSnake } from '../ui/hud/MiniMap';
import { VirtualJoystick } from '../ui/controls/VirtualJoystick';
import { BoostButton } from '../ui/controls/BoostButton';
import { Config } from '../config';
import { t, onLocaleChange } from '../i18n';
import { getAudioManager } from '../audio';

/**
 * UI Manager - Handles all game screens and HUD with modular architecture
 */
export class UIManager {
  private game: Game;
  private uiLayer: HTMLElement;
  private settingsManager: SettingsManager;

  // Screens
  private splashScreen: SplashScreen;
  private mainMenu: MainMenu;
  private gameOverScreen: GameOverScreen;
  private pauseMenu: PauseMenu;
  private settingsPanel: SettingsPanel;
  private changelogPage: ChangelogPage;

  // HUD
  private hud: HUDManager;
  private miniMap: MiniMap;
  private leaderboard: HTMLElement | null = null;

  // Mobile Controls
  private joystick: VirtualJoystick | null = null;
  private boostButton: BoostButton | null = null;

  // State
  private gameStartTime: number = 0;
  private isPaused: boolean = false;

  constructor(game: Game, settingsManager: SettingsManager) {
    this.game = game;
    this.settingsManager = settingsManager;
    this.uiLayer = document.getElementById('ui-layer')!;

    // Initialize screens
    this.splashScreen = new SplashScreen({
      onComplete: () => this.showMainMenu(),
      minDisplayTime: 2000,
    });

    this.mainMenu = new MainMenu({
      onPlay: (name) => this.startGame(name),
      onSettings: () => this.showSettings(),
      onChangelog: () => this.showChangelog(),
      highScore: this.game.getHighScore(),
    });

    this.gameOverScreen = new GameOverScreen({
      onPlayAgain: () => this.showMainMenu(),
      onMainMenu: () => this.showMainMenu(),
    });

    this.pauseMenu = new PauseMenu({
      onResume: () => this.resumeGame(),
      onRestart: () => this.restartGame(),
      onSettings: () => this.showSettings(),
      onMainMenu: () => this.returnToMenu(),
    });

    this.settingsPanel = new SettingsPanel({
      onClose: () => this.hideSettings(),
      settingsManager: this.settingsManager,
    });

    this.changelogPage = new ChangelogPage({
      onBack: () => this.hideChangelog(),
    });

    // Initialize HUD
    this.hud = new HUDManager();
    this.miniMap = new MiniMap({
      worldWidth: Config.WORLD_WIDTH,
      worldHeight: Config.WORLD_HEIGHT,
    });

    // Create leaderboard
    this.createLeaderboard();

    // Add all elements to UI layer
    this.uiLayer.appendChild(this.splashScreen.render());
    this.uiLayer.appendChild(this.mainMenu.render());
    this.uiLayer.appendChild(this.gameOverScreen.render());
    this.uiLayer.appendChild(this.pauseMenu.render());
    this.uiLayer.appendChild(this.settingsPanel.render());
    this.uiLayer.appendChild(this.changelogPage.render());
    this.uiLayer.appendChild(this.hud.getElement());
    this.uiLayer.appendChild(this.miniMap.getElement());

    // Initialize mobile controls if touch device
    if (this.isTouchDevice()) {
      this.initMobileControls();
    }

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Subscribe to locale changes to update leaderboard title
    onLocaleChange(() => {
      this.updateLeaderboardTitle();
    });

    // Show splash screen
    this.showSplash();
  }

  private createLeaderboard(): void {
    this.leaderboard = document.createElement('div');
    this.leaderboard.className = 'leaderboard hidden';
    this.leaderboard.innerHTML = `
      <div class="leaderboard-title" id="leaderboardTitle">${t('hud.rank')}</div>
      <div class="leaderboard-list" id="leaderboardEntries"></div>
    `;
    this.uiLayer.appendChild(this.leaderboard);
  }

  private updateLeaderboardTitle(): void {
    const title = this.leaderboard?.querySelector('#leaderboardTitle');
    if (title) {
      title.textContent = t('hud.rank');
    }
  }

  private initMobileControls(): void {
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

    this.uiLayer.appendChild(this.joystick.getElement());
    this.uiLayer.appendChild(this.boostButton.getElement());

    // Subscribe to settings changes
    this.settingsManager.subscribe((newSettings) => {
      this.joystick?.updateConfig({
        size: newSettings.controls.joystickSize,
        position: newSettings.controls.joystickPosition,
      });
      this.boostButton?.updateConfig({
        position: newSettings.controls.joystickPosition === 'left' ? 'right' : 'left',
      });
    });
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.changelogPage.getIsVisible()) {
          this.hideChangelog();
        } else if (this.game.state === 'playing') {
          if (this.isPaused) {
            this.resumeGame();
          } else {
            this.pauseGame();
          }
        } else if (this.settingsPanel.getIsVisible()) {
          this.hideSettings();
        }
      }
    });
  }

  private isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  // ===== Boss & Boost HUD =====
  private bossHUD: HTMLElement | null = null;
  private boostHUD: HTMLElement | null = null;
  private bossOverlay: HTMLElement | null = null;
  private bossModeActive: boolean = false;
  private lastBossRumbleMs: number = 0;
  private lastBossCountdownSecond: number | null = null;

  private createGameHUDs(): void {
    // Boss overlay (darken UI/canvas slightly when boss is active)
    if (!this.bossOverlay) {
      this.bossOverlay = document.createElement('div');
      this.bossOverlay.className = 'boss-overlay hidden';
      this.uiLayer.appendChild(this.bossOverlay);
    }

    // Boss HUD
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
    this.uiLayer.appendChild(this.bossHUD);

    // Boost HUD
    this.boostHUD = document.createElement('div');
    this.boostHUD.className = 'boost-hud hidden';
    this.boostHUD.innerHTML = `
        <div class="boost-timer-display">SPEED BOOST: <span id="boost-timer-val">${Config.BOSS_DROP_BOOST_DURATION}</span>s</div>
      `;
    this.uiLayer.appendChild(this.boostHUD);
  }

  private updateBossAndBoostHUD(): void {
    // Update Boss HUD
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

    // Update Boost HUD
    const player = this.game.getPlayer();
    if (player && player.speedBoostTimer > 0) {
      this.boostHUD?.classList.remove('hidden');
      const timer = this.boostHUD?.querySelector('#boost-timer-val');
      if (timer) timer.textContent = Math.ceil(player.speedBoostTimer).toString();
    } else {
      this.boostHUD?.classList.add('hidden');
    }
  }

  // ===== Screen Navigation =====

  private showSplash(): void {
    this.createGameHUDs(); // Ensure extra HUDs are created (idempotent if handled right, but constructor calls showSplash so okay. Better to call in constructor)
    this.splashScreen.show();
    this.splashScreen.startLoading();
  }

  private showMainMenu(): void {
    this.splashScreen.hideImmediate();
    this.gameOverScreen.hideImmediate();
    this.pauseMenu.hideImmediate();
    this.changelogPage.hideImmediate();
    this.hud.hide();
    this.miniMap.hide();
    this.leaderboard?.classList.add('hidden');
    this.bossHUD?.classList.add('hidden');
    this.boostHUD?.classList.add('hidden');

    this.joystick?.hide();
    this.boostButton?.hide();

    this.mainMenu.updateHighScore(this.game.getHighScore());
    this.mainMenu.show();

    this.game.returnToMenu();
  }

  private startGame(playerName: string): void {
    this.mainMenu.hideImmediate();
    this.pauseMenu.hideImmediate();
    this.hud.show();
    this.miniMap.show();
    this.leaderboard?.classList.remove('hidden');

    if (this.isTouchDevice()) {
      this.joystick?.show();
      this.boostButton?.show();
    }

    this.gameStartTime = Date.now();
    this.isPaused = false;
    getAudioManager().play('start');
    this.game.startGame(playerName);
    this.startUpdateLoop();
  }

  private pauseGame(): void {
    if (this.game.state !== 'playing' || this.isPaused) return;

    this.isPaused = true;
    this.game.pause();
    getAudioManager().play('pause');

    const player = this.game.getPlayer();
    this.pauseMenu.showWithStats({
      score: player?.score || 0,
      mass: player?.mass || 0,
      survivalTime: Date.now() - this.gameStartTime,
    });
  }

  private resumeGame(): void {
    if (!this.isPaused) return;

    this.isPaused = false;
    this.pauseMenu.hide();
    getAudioManager().play('resume');
    this.game.resume();
  }

  private restartGame(): void {
    this.isPaused = false;
    this.pauseMenu.hideImmediate();
    this.startGame(this.game.getPlayerName());
  }

  private returnToMenu(): void {
    this.isPaused = false;
    this.pauseMenu.hideImmediate();
    this.showMainMenu();
  }

  public showGameOver(): void {
    const player = this.game.getPlayer();
    const highScore = this.game.getHighScore();
    const score = player?.score || 0;

    const stats: GameOverStats = {
      score,
      mass: player?.mass || 0,
      survivalTime: Date.now() - this.gameStartTime,
      killCount: 0, // TODO: Track kills
      killedBy: this.game.getLastKiller(),
      highScore,
      isNewHighScore: score >= highScore && score > 0,
    };

    this.hud.hide();
    this.miniMap.hide();
    this.leaderboard?.classList.add('hidden');
    this.bossHUD?.classList.add('hidden');
    this.boostHUD?.classList.add('hidden');
    this.joystick?.hide();
    this.boostButton?.hide();

    getAudioManager().play('death');
    this.gameOverScreen.showWithStats(stats);
  }

  private showSettings(): void {
    this.settingsPanel.show();
  }

  private hideSettings(): void {
    this.settingsPanel.hide();
  }

  private showChangelog(): void {
    this.mainMenu.hideImmediate();
    this.changelogPage.show();
  }

  private hideChangelog(): void {
    this.changelogPage.hideImmediate();
    this.mainMenu.show();
  }

  // ===== Update Loop =====
  private lastHudUpdateMs: number = 0;
  private lastLeaderboardUpdateMs: number = 0;
  private lastMiniMapUpdateMs: number = 0;
  private lastBossHudUpdateMs: number = 0;

  private startUpdateLoop(): void {
    const update = () => {
      if (this.game.state === 'playing' && !this.isPaused) {
        const now = performance.now();

        // HUD can update frequently, but doesn't need 60fps
        if (now - this.lastHudUpdateMs >= 33) {
          this.updateHUD();
          this.lastHudUpdateMs = now;
        }

        // Leaderboard is relatively expensive (DOM rebuild); throttle it
        if (now - this.lastLeaderboardUpdateMs >= 250) {
          this.updateLeaderboard();
          this.lastLeaderboardUpdateMs = now;
        }

        // Minimap can be expensive (allocations + draw); throttle it
        if (now - this.lastMiniMapUpdateMs >= 100) {
          this.updateMiniMap();
          this.lastMiniMapUpdateMs = now;
        }

        // Boss/boost timers don’t need high frequency
        if (now - this.lastBossHudUpdateMs >= 100) {
          this.updateBossAndBoostHUD();
          this.lastBossHudUpdateMs = now;
        }
        requestAnimationFrame(update);
      } else if (this.game.state === 'gameover') {
        this.showGameOver();
      }
    };
    requestAnimationFrame(update);
  }

  private updateHUD(): void {
    const player = this.game.getPlayer();
    if (!player) return;

    const leaderboard = this.game.getLeaderboard();
    const rank = leaderboard.findIndex((e) => e.isPlayer) + 1;

    this.hud.update({
      score: player.score,
      mass: player.mass,
      rank: rank || 1,
      boostCharge: player.boostEnergy,
      maxBoost: 100,
    });

    // Update boost button charge
    this.boostButton?.updateCharge(player.boostEnergy);
  }

  private updateLeaderboard(): void {
    const entriesContainer = this.leaderboard?.querySelector('#leaderboardEntries');
    if (!entriesContainer) return;

    const entries = this.game.getLeaderboard();

    entriesContainer.innerHTML = entries
      .map(
        (entry, i) => `
          <div class="leaderboard-entry${entry.isPlayer ? ' self' : ''}">
            <span class="leaderboard-rank">${i + 1}.</span>
            <span class="leaderboard-name">${entry.name}</span>
            <span class="leaderboard-score">${entry.score}</span>
          </div>
        `
      )
      .join('');
  }

  private updateMiniMap(): void {
    const player = this.game.getPlayer();
    if (!player) return;

    // Get all snakes and convert to minimap format
    const snakes = this.game.getAllSnakes();
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
      window.innerWidth * 1.5, // Approximate viewport
      window.innerHeight * 1.5
    );
  }

  // ===== Public Getters for Input =====

  public getJoystickDirection(): { x: number; y: number } | null {
    if (!this.joystick) return null;
    const state = this.joystick.getState();
    if (state.active && state.magnitude > 0) {
      return state.direction;
    }
    return null;
  }

  public isBoostPressed(): boolean {
    return this.boostButton?.isBoostPressed() || false;
  }
}
