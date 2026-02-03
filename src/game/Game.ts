import { Vector2, Random } from '../utils/utils';
import { getDeviceProfile } from '../utils/performance';
import { Config } from '../config';
import { GameLoop, GameState } from '../engine/GameLoop';
import { InputManager } from '../engine/InputManager';
import { Renderer } from '../engine/Renderer';
import { Snake } from './entities/Snake';
import { Food, FoodManager } from './entities/Food';
import { ParticleSystem } from './entities/Particle';
import { CollisionSystem } from './systems/CollisionSystem';
import { AISystem } from './systems/AISystem';
import { Boss, type BossKind } from './entities/Boss';
import { getAudioManager, getMusicManager } from '../audio';
import type { GameSettings } from './SettingsManager';
import type { GraphicsQuality, RenderOptions } from './render/RenderOptions';
import { PerformanceGovernor } from './PerformanceGovernor';
import { getFPSManager, FPSManager, detectDeviceProfile } from './FPSManager';

const BOT_NAMES = [
    'Viper', 'Cobra', 'Python', 'Mamba', 'Anaconda',
    'Sidewinder', 'Rattler', 'Boa', 'Asp', 'Krait',
    'Taipan', 'Adder', 'Copperhead', 'Racer', 'Kingsnake',
];

/**
 * Game - Main game controller
 */
export class Game {
    private canvas: HTMLCanvasElement;
    private renderer: Renderer;
    private gameLoop: GameLoop;
    private input: InputManager;

    // Game state
    public state: GameState = 'menu';
    private player: Snake | null = null;
    private bots: Snake[] = [];
    private foodManager: FoodManager;
    private particles: ParticleSystem;
    private collisionSystem: CollisionSystem;
    private aiSystem: AISystem;

    // Boss
    private boss: Boss | null = null;
    private fateSpawned: boolean = false;
    private nonoSpawned: boolean = false;
    private bossVfxMs: number = 0;

    // Reusable scratch arrays (avoid per-frame allocations)
    private aiNearbySnakes: Snake[] = [];
    private aiNearbyFoods: Food[] = [];
    private visibleFoods: Food[] = [];

    // Extreme mobile optimizations
    private renderFrameCount: number = 0;
    private readonly renderSkipFrames: number;
    private lastPlayerPosition: Vector2 = new Vector2(0, 0);
    private entityDistanceCache: Map<string, number> = new Map();
    private distanceCacheFrame: number = 0;

    // Player info
    private playerName: string = 'Player';
    private highScore: number = 0;
    private lastKiller: string | null = null;
    private isPaused: boolean = false;

    // Runtime graphics settings (driven by SettingsManager)
    private graphicsQuality: GraphicsQuality = 'high';
    private glowEnabled: boolean = false;
    private showGrid: boolean = true;
    private particlesEnabled: boolean = true;
    private uiTheme: 'dark' | 'light' = 'dark';
    private botTargetCount: number = Config.BOT_COUNT;
    private readonly isTouchDevice: boolean;
    private fpsGenBetaEnabled: boolean = false;
    private perfGovernor: PerformanceGovernor;
    private perfLastEvalMs: number = 0;
    private recommendedUiUpdateIntervalMs: number = 0;
    private fpsManager: FPSManager | null = null;

    // Vibration callback for food eating (set by PlayPage)
    public onVibrate: ((pattern: number | number[]) => void) | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.renderer = new Renderer(canvas);
        this.gameLoop = new GameLoop();
        this.input = new InputManager();
        this.input.setCanvas(canvas);

        this.foodManager = new FoodManager();
        this.particles = new ParticleSystem();
        this.collisionSystem = new CollisionSystem();
        this.aiSystem = new AISystem();
        this.isTouchDevice = (() => {
            try {
                return (
                    (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
                    'ontouchstart' in window ||
                    navigator.maxTouchPoints > 0
                );
            } catch {
                return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            }
        })();
        this.perfGovernor = new PerformanceGovernor(this.isTouchDevice);

        // EXTREME MOBILE OPTIMIZATION: Render frame skipping
        // On 120Hz displays, we render every 2nd frame (60 FPS cap)
        // On low-end, we may render every 3rd frame (40 FPS)
        const isLowEnd = (navigator as any).deviceMemory <= 4 || navigator.hardwareConcurrency <= 4;
        this.renderSkipFrames = this.isTouchDevice ? (isLowEnd ? 2 : 1) : 1;

        this.setupGameLoop();
    }

    public applySettings(settings: GameSettings): void {
        this.graphicsQuality = settings.graphics.quality;
        this.showGrid = settings.graphics.showGrid;
        this.particlesEnabled = settings.graphics.particles;
        this.uiTheme = settings.ui.theme === 'light' ? 'light' : 'dark';
        this.fpsGenBetaEnabled = this.isTouchDevice && settings.graphics.fpsGenBeta === true;

        // Clean visuals: glow is disabled across all presets (Ultra explicitly requires 0 glow).
        this.glowEnabled = false;

        const dpr = window.devicePixelRatio || 1;
        let desiredPixelRatio = 1;
        let particleIntensity = 1;
        let botCount: number = Config.BOT_COUNT;
        let foodCount: number = Config.FOOD_COUNT;
        let foodAnimation = true;
        let minimapVisible = true;
        let gridVisible = true;

        switch (this.graphicsQuality) {
            case 'low':
                // Legacy value (treated like MED internally)
                desiredPixelRatio = Math.min(1.25, dpr);
                particleIntensity = 0.60;
                botCount = 12;
                foodCount = 240;
                foodAnimation = false;
                minimapVisible = false;
                gridVisible = false;
                break;
            case 'medium':
                desiredPixelRatio = Math.min(1.25, dpr);
                particleIntensity = 0.60;
                botCount = 12;
                foodCount = 240;
                foodAnimation = false;
                minimapVisible = false;
                gridVisible = false;
                break;
            case 'high':
                desiredPixelRatio = Math.min(2, dpr);
                particleIntensity = 1.0;
                botCount = Config.BOT_COUNT;
                foodCount = 320;
                minimapVisible = true;
                gridVisible = false;
                break;
            case 'ultra':
                desiredPixelRatio = Math.min(2.5, dpr);
                particleIntensity = 1.15;
                botCount = 16;
                foodCount = 450;
                minimapVisible = true;
                gridVisible = true;
                break;
            case 'super_ultra':
                desiredPixelRatio = Math.min(3, dpr);
                particleIntensity = 1.35;
                botCount = 18;
                foodCount = 520;
                minimapVisible = true;
                gridVisible = true;
                break;
        }

        // Always bias performance on touch devices using unified DeviceProfile
        const deviceProfile = getDeviceProfile();
        const mobilePerformanceMode = settings.graphics.mobilePerformanceMode;

        if (this.isTouchDevice) {
            // Apply tier-based DPR caps when mobilePerformanceMode is ON
            if (mobilePerformanceMode) {
                switch (deviceProfile.tier) {
                    case 'very-low':
                    case 'low':
                        desiredPixelRatio = Math.min(desiredPixelRatio, 1.0);
                        particleIntensity = Math.min(particleIntensity, 0.35);
                        botCount = Math.min(botCount, 8);
                        foodCount = Math.min(foodCount, 200);
                        break;
                    case 'mid':
                        desiredPixelRatio = Math.min(desiredPixelRatio, 1.25);
                        particleIntensity = Math.min(particleIntensity, 0.5);
                        botCount = Math.min(botCount, 10);
                        foodCount = Math.min(foodCount, 280);
                        break;
                    case 'high':
                        desiredPixelRatio = Math.min(desiredPixelRatio, 1.5);
                        particleIntensity = Math.min(particleIntensity, 0.7);
                        botCount = Math.min(botCount, 12);
                        foodCount = Math.min(foodCount, 350);
                        break;
                    case 'flagship':
                        // Flagship can handle more, but still cap for stability
                        desiredPixelRatio = Math.min(desiredPixelRatio, 1.5);
                        particleIntensity = Math.min(particleIntensity, 0.85);
                        break;
                }
            } else {
                // mobilePerformanceMode OFF: only apply minimal caps for flagship
                const isLowEnd = deviceProfile.isLowEnd;
                const maxDpr = isLowEnd ? 1 : (this.graphicsQuality === 'ultra' || this.graphicsQuality === 'super_ultra' ? 2 : 1.5);
                desiredPixelRatio = Math.min(desiredPixelRatio, maxDpr);

                // Reduce bots/food proportionally on low-end even when mode is off
                if (isLowEnd) {
                    botCount = Math.floor(botCount * 0.6);
                    foodCount = Math.floor(foodCount * 0.5);
                }
            }
        }

        // FPS Gen (Beta): extreme mobile mode for maximum smoothness.
        // This is NOT real frame generation; it simply reduces work per frame aggressively.
        if (this.fpsGenBetaEnabled) {
            desiredPixelRatio = 1;
            particleIntensity = Math.min(particleIntensity, 0.35);
            botCount = Math.min(botCount, 8);
            foodCount = Math.min(foodCount, 200);
            foodAnimation = false;
            minimapVisible = false;
            gridVisible = false;
            this.particlesEnabled = false;
        }

        // Auto performance governor: base values are the ceiling, then the governor may reduce them at runtime.
        this.perfGovernor.setBase({
            pixelRatio: desiredPixelRatio,
            particleIntensity,
            botCount,
            foodCount,
        });

        this.renderer.setPixelRatio(desiredPixelRatio);
        this.renderer.resize({ logicalWidth: window.innerWidth, logicalHeight: window.innerHeight });

        this.particles.setEnabled(this.particlesEnabled);
        this.particles.setIntensity(particleIntensity);

        this.botTargetCount = Math.max(6, Math.min(30, botCount));
        this.foodManager.setTargetCount(foodCount);
        this.foodManager.setAnimationEnabled(foodAnimation);

        // Make "extra toggles" auto-driven by performance preset.
        this.showGrid = gridVisible;
        // Minimap is controlled by SettingsManager too, but we enforce for perf.
        document.documentElement.classList.toggle('hide-minimap', !minimapVisible);
        this.syncBotsToTarget();

        // Reset governor recommendation on settings changes; it will re-evaluate on the next tick.
        this.perfLastEvalMs = 0;
        this.recommendedUiUpdateIntervalMs = 0;
    }

    private syncBotsToTarget(): void {
        if (!this.player) return;
        if (this.state !== 'playing') return;

        const desired = this.boss ? Math.max(4, Math.floor(this.botTargetCount / 2)) : this.botTargetCount;

        // Remove extra bots (prefer farthest)
        if (this.bots.length > desired) {
            const sorted = [...this.bots].sort((a, b) => b.position.distance(this.player!.position) - a.position.distance(this.player!.position));
            const toRemove = sorted.slice(0, this.bots.length - desired);
            for (const bot of toRemove) {
                this.aiSystem.unregisterBot(bot.id);
                this.bots = this.bots.filter(b => b.id !== bot.id);
            }
        }

        // Add missing bots
        while (this.bots.length < desired) {
            this.spawnBot();
        }
    }

    public resize(logicalWidth: number = window.innerWidth, logicalHeight: number = window.innerHeight): void {
        this.renderer.resize({ logicalWidth, logicalHeight });
    }

    private setupGameLoop(): void {
        this.gameLoop.onUpdate((dt) => this.update(dt));
        this.gameLoop.onRender((alpha) => this.render(alpha));
    }

    /**
     * Start the game loop
     */
    public start(): void {
        this.gameLoop.start();
    }

    /**
     * Start a new game
     */
    public startGame(playerName: string): void {
        this.playerName = playerName || 'Player';
        this.state = 'playing';
        this.lastKiller = null;
        this.boss = null;
        this.fateSpawned = false;
        this.nonoSpawned = false;

        // Initialize FPS Manager with auto-detection
        if (!this.fpsManager) {
            this.fpsManager = getFPSManager({
                showCounter: this.isTouchDevice,
                adaptiveQuality: true,
            });
            this.fpsManager.start();

            // Apply FPS Gen Pro settings
            if (this.fpsGenBetaEnabled) {
                this.fpsManager.applySettings(this);
            }
        }

        // Initialize world
        this.foodManager.initialize(this.foodManager.getTargetCount());
        this.particles.clear();

        // Create player
        const playerPos = new Vector2(
            Config.WORLD_WIDTH / 2,
            Config.WORLD_HEIGHT / 2
        );
        this.player = new Snake('player', this.playerName, playerPos, true);

        // Create bots
        this.bots = [];
        for (let i = 0; i < this.botTargetCount; i++) {
            this.spawnBot();
        }

        // Start dynamic music
        getMusicManager().play();
    }

    private spawnBot(): Snake {
        const pos = new Vector2(
            Random.float(200, Config.WORLD_WIDTH - 200),
            Random.float(200, Config.WORLD_HEIGHT - 200)
        );

        // Avoid spawning too close to player
        if (this.player && pos.distance(this.player.position) < 500) {
            pos.x = (pos.x + Config.WORLD_WIDTH / 2) % Config.WORLD_WIDTH;
            pos.y = (pos.y + Config.WORLD_HEIGHT / 2) % Config.WORLD_HEIGHT;
        }

        const name = Random.choice(BOT_NAMES);
        const size = Random.int(Config.BOT_MIN_SIZE, Config.BOT_MAX_SIZE);
        const bot = new Snake(`bot_${Date.now()}_${Math.random()}`, name, pos, false, size);

        this.aiSystem.registerBot(bot);
        this.bots.push(bot);

        return bot;
    }

    /**
     * End the current game
     */
    public endGame(): void {
        this.state = 'gameover';

        // Stop music
        getMusicManager().stop();

        if (this.player && this.player.score > this.highScore) {
            this.highScore = this.player.score;
        }
    }

    /**
     * Return to menu
     */
    public returnToMenu(): void {
        this.state = 'menu';
        this.player = null;
        this.bots = [];
        this.isPaused = false;

        // Stop FPS Manager
        this.fpsManager?.stop();
        this.fpsManager = null;
    }

    /**
     * Pause the game
     */
    public pause(): void {
        this.isPaused = true;
        getMusicManager().pause();
    }

    /**
     * Resume the game
     */
    public resume(): void {
        this.isPaused = false;
        getMusicManager().play();
    }

    /**
     * Check if game is paused
     */
    public get paused(): boolean {
        return this.isPaused;
    }


    /**
     * Main update loop
     */
    private update(dt: number): void {
        if (this.state !== 'playing' || !this.player || this.isPaused) return;

        // Update player input
        const screenCenter = this.renderer.screenCenter;
        const direction = this.input.getDirection(screenCenter);
        this.player.setDirection(direction);
        this.player.setBoost(this.input.isBoostPressed());

        // Update dynamic music based on player intent (not velocity).
        // Velocity is almost always non-zero in snake games, which would keep music loud even "when stopped".
        const intent = this.input.getIntentIntensity(screenCenter);
        const boostBonus = this.input.isBoostPressed() ? 0.35 : 0;
        const movementIntensity = Math.max(0, Math.min(1, intent * 0.75 + boostBonus));
        getMusicManager().setMovementIntensity(movementIntensity);

        // Update player
        this.player.update(dt);

        // Tempo follows real speed (subtle). Uses post-update velocity so boosts/pickups are included.
        const dtSec = dt / 1000;
        if (dtSec > 0) {
            const speedPerSec = this.player.velocity.magnitude() / dtSec;
            const speedFactor = speedPerSec / Config.SNAKE_BASE_SPEED;
            getMusicManager().setSpeedFactor(speedFactor);
        } else {
            getMusicManager().setSpeedFactor(1);
        }

        // Boost particles
        if (this.particlesEnabled && this.player.isBoosting) {
            const tailPos = this.player.segments[this.player.segments.length - 1].position;
            this.particles.boostTrail(tailPos, this.player.palette.primary);
        }

        // Update bots
        const allSnakes = [this.player, ...this.bots];
        const foods = this.foodManager.getAll();

        for (const bot of this.bots) {
            if (bot.isAlive) {
                // Use previous frame's collision grid for "nearby" lookups (good enough for intent),
                // then rebuild the grid later for exact collisions.
                this.collisionSystem.getNearbySnakesInto(bot.position, 2, this.aiNearbySnakes);
                this.collisionSystem.getNearbyFoodsInto(bot.position, 2, this.aiNearbyFoods);
                this.aiSystem.update(bot, this.aiNearbySnakes, this.aiNearbyFoods, dt);
                bot.update(dt);

                if (this.particlesEnabled && bot.isBoosting) {
                    const tailPos = bot.segments[bot.segments.length - 1].position;
                    this.particles.boostTrail(tailPos, bot.palette.primary);
                }
            }
        }

        // Update food
        this.foodManager.update(dt);

        // Update Boss
        if (this.boss) {
            this.boss.update(dt, allSnakes, foods);
            if (!this.boss.isAlive) {
                this.handleBossDeath();
            }
            // Ambient boss VFX (lightweight)
            if (this.particlesEnabled) {
                this.bossVfxMs += dt;
                const interval = (this.graphicsQuality === 'medium' || this.graphicsQuality === 'low') ? 320 : 160;
                if (this.bossVfxMs >= interval) {
                    const head = this.boss.segments[0]?.position ?? this.boss.position;
                    const jitter = Random.inCircle(this.boss.headRadius * 0.6);
                    this.particles.emit(head.add(jitter), '#ff2a2a', 1, 1.6, 4, 26);
                    this.bossVfxMs = 0;
                }
            }
        } else if (!this.fateSpawned && this.player.score >= Config.BOSS_FATE_SCORE_THRESHOLD) {
            this.spawnBoss('FATE');
        } else if (this.fateSpawned && !this.nonoSpawned && this.player.score >= Config.BOSS_NONO_SCORE_THRESHOLD) {
            this.spawnBoss('NONO');
        }

        // Update particles
        this.particles.update(dt);

        // Build collision grid
        this.collisionSystem.clear();
        const collisionStepBots = this.fpsGenBetaEnabled ? 4 : ((this.graphicsQuality === 'medium' || this.graphicsQuality === 'low') ? 2 : 1);
        for (const snake of allSnakes) {
            if (!snake.isAlive) continue;
            const step = snake.isPlayer ? 1 : collisionStepBots;
            this.collisionSystem.registerSnake(snake, step);
        }
        for (const food of foods) {
            this.collisionSystem.registerFood(food);
        }

        // Check collisions
        this.checkCollisions(allSnakes);
        this.checkBossCollisions(allSnakes);

        // Cleanup and respawn
        this.foodManager.cleanup();
        this.respawnDeadBots();

        // Update camera
        this.renderer.followTarget(this.player.position, this.player.segments.length);

        // Auto performance tuning (once per second).
        this.tickPerformanceGovernor();
    }

    private tickPerformanceGovernor(): void {
        if (!this.isTouchDevice) return;
        const now = performance.now();
        if (this.perfLastEvalMs > 0 && now - this.perfLastEvalMs < 1000) return;
        this.perfLastEvalMs = now;

        const decision = this.perfGovernor.decide(this.gameLoop.getMetrics());
        if (!decision) return;

        this.recommendedUiUpdateIntervalMs = decision.recommendedUiIntervalMs;

        // Apply runtime reductions (never exceed base values).
        this.renderer.setPixelRatio(decision.pixelRatio);
        this.particles.setIntensity(decision.particleIntensity);

        const nextFood = Math.max(180, Math.min(1200, Math.floor(decision.foodCount)));
        this.foodManager.setTargetCount(nextFood);

        const nextBots = Math.max(6, Math.min(30, Math.floor(decision.botCount)));
        if (nextBots !== this.botTargetCount) {
            this.botTargetCount = nextBots;
            this.syncBotsToTarget();
        }
    }

    private checkCollisions(allSnakes: Snake[]): void {
        if (!this.player) return;

        // Player food collection
        const playerFood = this.collisionSystem.checkFoodCollisions(this.player);
        for (const food of playerFood) {
            food.consume();
            if (food.type === 'speed_boost') {
                // Boss drop: speed only (no huge growth)
                this.player.activateSpeedBoost(Config.BOSS_DROP_BOOST_DURATION, Config.BOSS_DROP_BOOST_MULTIPLIER);
                getAudioManager().play('levelUp');
                // Stronger vibration for power-ups
                this.onVibrate?.([8, 30, 8]);
            } else if (food.type === 'infinite_boost') {
                // NONO reward: infinite boost (no energy drain).
                this.player.activateInfiniteBoost();
                getAudioManager().play('levelUp', { volume: 1.0, pitchVariance: 0.02 });
                // Satisfying double-pulse for big reward
                this.onVibrate?.([10, 40, 10, 40, 10]);
            } else if (food.type === 'death') {
                // Death drops are juicy - slightly stronger feedback
                this.player.grow(food.value);
                getAudioManager().play('collect');
                this.onVibrate?.(6);
            } else {
                this.player.grow(food.value);
                getAudioManager().play('collect');
                // Light, snappy vibration for normal food
                this.onVibrate?.(4);
            }
            if (this.particlesEnabled) {
                this.particles.foodConsumed(food.position, food.color);
            }
        }

        // Bot food collection
        for (const bot of this.bots) {
            if (!bot.isAlive) continue;

            const botFood = this.collisionSystem.checkFoodCollisions(bot);
            for (const food of botFood) {
                if (food.type === 'speed_boost' || food.type === 'infinite_boost') continue;
                food.consume();
                bot.grow(food.value);
            }
        }

        // Boss eats food (especially NONO). This is intentionally quiet.
        if (this.boss && this.boss.isAlive) {
            const bossHead = this.boss.getHead();
            const bossRadius = this.boss.getHeadRadius() * (this.boss.kind === 'NONO' ? 1.6 : 1.0);
            const bossFood = this.collisionSystem.checkCircleFoodCollisions(bossHead, bossRadius);
            for (const food of bossFood) {
                food.consume();
            }
            if (bossFood.length > 0) {
                getAudioManager().play('collect', { volume: 0.28, pitchVariance: 0.02, cooldownMs: 140 });
            }
        }

        // Snake-snake collisions
        for (const snake of allSnakes) {
            if (!snake.isAlive) continue;

            const otherStep = this.fpsGenBetaEnabled && !snake.isPlayer
                ? 3
                : (((this.graphicsQuality === 'medium' || this.graphicsQuality === 'low') && !snake.isPlayer) ? 2 : 1);
            const collision = this.collisionSystem.checkSnakeCollisions(snake, allSnakes, otherStep);
            if (collision) {
                this.killSnake(collision.victim, collision.killer);
            }

            // Boundary collision
            if (this.collisionSystem.checkBoundaryCollision(snake)) {
                this.killSnake(snake, null);
            }
        }
    }

    private killSnake(victim: Snake, killer: Snake | null): void {
        if (!victim.isAlive) return;

        victim.die();

        // Death effects
        if (this.particlesEnabled) {
            this.particles.deathExplosion(victim.position, victim.palette.primary);
        }

        // Drop food from body
        if (victim.segments.length > 3) {
            const positions = victim.segments.map(s => s.position);
            this.foodManager.spawnFromDeath(positions, Math.floor(victim.segments.length / 2));
        }

        // Award points to killer
        if (killer) {
            killer.grow(Math.floor(victim.mass / 2));
        }

        // Check if player died
        if (victim === this.player) {
            this.lastKiller = killer ? killer.name : 'the boundary';
            this.endGame();
        }
    }

    private respawnDeadBots(): void {
        this.bots = this.bots.filter(bot => {
            if (!bot.isAlive) {
                this.aiSystem.unregisterBot(bot.id);
                return false;
            }
            return true;
        });

        // Maintain bot count (reduce count if boss is present)
        const targetCount = this.boss ? Math.max(4, Math.floor(this.botTargetCount / 2)) : this.botTargetCount;
        while (this.bots.length < targetCount) {
            this.spawnBot();
        }
    }

    private spawnBoss(kind: BossKind): void {
        if (!this.player) return;

        if (kind === 'FATE') this.fateSpawned = true;
        if (kind === 'NONO') this.nonoSpawned = true;
        getAudioManager().play('bossSpawn', { volume: 0.9, pitchVariance: 0.01 });

        // Spawn far away in front of player
        const spawnDist = kind === 'NONO' ? Config.BOSS_NONO_SAFE_DISTANCE : Config.BOSS_FATE_SAFE_DISTANCE;
        const spawnPos = this.player.position.add(this.player.direction.multiply(spawnDist));

        // Clamp to world
        spawnPos.x = Math.max(100, Math.min(Config.WORLD_WIDTH - 100, spawnPos.x));
        spawnPos.y = Math.max(100, Math.min(Config.WORLD_HEIGHT - 100, spawnPos.y));

        this.boss = new Boss(kind, spawnPos);
        this.bossVfxMs = 0;

        // Spawn shockwave-ish burst
        if (this.particlesEnabled) {
            this.particles.emit(spawnPos, '#ff2a2a', 22, 4.2, 7, 55);
            this.particles.emit(spawnPos, '#ffffff', 10, 2.8, 5, 45);
        }
    }

    private handleBossDeath(): void {
        if (!this.boss) return;

        getAudioManager().play('bossExplode', { volume: 1.0, pitchVariance: 0.01 });

        // Explosion effect
        if (this.particlesEnabled) {
            this.particles.deathExplosion(this.boss.position, '#ff0000');
            this.particles.emit(this.boss.position, '#ff2a2a', 45, 5.5, 7, 70);
        }

        // Spawn boss reward pickup
        if (this.boss.kind === 'NONO') {
            // Big green infinite-boost drop
            this.foodManager.spawnFood(this.boss.position, 'infinite_boost');
        } else {
            // Small speed-boost pickup
            this.foodManager.spawnFood(this.boss.position, 'speed_boost');
        }

        this.boss = null;
    }

    private checkBossCollisions(allSnakes: Snake[]): void {
        if (!this.boss || !this.boss.isAlive) return;

        const bossHead = this.boss.getHead();
        const bossHeadRadius = this.boss.getHeadRadius();
        const bossSegments = this.boss.segments;
        const tailHitStart = Math.floor(bossSegments.length * 0.65);
        const bodyStep = this.boss.kind === 'NONO' ? 3 : 2;

        for (const snake of allSnakes) {
            if (!snake.isAlive) continue;

            const snakeHead = snake.getHead();
            const snakeHeadRadius = snake.getCollisionRadius();

            // Fast path: head-to-head touch
            if (snakeHead.distance(bossHead) < snakeHeadRadius + bossHeadRadius) {
                if (this.boss.kind === 'NONO') {
                    // NONO is non-lethal: gently push the snake out of overlap.
                    const delta = snakeHead.subtract(bossHead);
                    const dir = delta.magnitude() > 0 ? delta.normalize() : snake.direction;
                    snake.position = bossHead.add(dir.multiply(snakeHeadRadius + bossHeadRadius + 6));
                    snake.velocity = Vector2.zero();
                } else {
                    this.killSnake(snake, null);
                    if (this.particlesEnabled) {
                        this.particles.deathExplosion(snakeHead, snake.palette.primary);
                    }
                }
                continue;
            }

            // Snake head touching boss body
            // (Boss is large, but we keep it cheap by stepping segments.)
            for (let i = 0; i < bossSegments.length; i += bodyStep) {
                const seg = bossSegments[i];
                if (snakeHead.distance(seg.position) < snakeHeadRadius + seg.radius) {
                    // Player can damage the boss by hitting the tail while boosting.
                    // This gives the player a real win-condition besides just surviving.
                    const canDamageBoss = snake.isPlayer && snake.isBoosting && i >= tailHitStart;
                    if (canDamageBoss) {
                        this.boss.takeDamage(1);
                        if (!snake.infiniteBoost) snake.boostEnergy = Math.max(0, snake.boostEnergy - 35);
                        if (snake.segments.length > 6) snake.shrink(1);
                        // Push the player slightly away to avoid repeated hits in the same spot.
                        snake.position = snake.position.add(snake.direction.multiply(-Math.max(20, snakeHeadRadius * 1.8)));
                        snake.velocity = Vector2.zero();

                        if (this.particlesEnabled) {
                            this.particles.emit(snakeHead, '#ffffff', 8, 3.0, 5, 34);
                        }
                        getAudioManager().play('bossTick', { volume: 0.7, pitchVariance: 0.0, cooldownMs: 120 });
                    } else {
                        if (this.boss.kind === 'NONO') {
                            // NONO is non-lethal: push away so touch controls don't "freeze" in a death loop.
                            const delta = snakeHead.subtract(seg.position);
                            const dir = delta.magnitude() > 0 ? delta.normalize() : snake.direction;
                            snake.position = seg.position.add(dir.multiply(snakeHeadRadius + seg.radius + 6));
                            snake.velocity = Vector2.zero();
                        } else {
                            this.killSnake(snake, null);
                            if (this.particlesEnabled) {
                                this.particles.deathExplosion(snakeHead, snake.palette.primary);
                            }
                        }
                    }
                    break;
                }
            }

            if (!snake.isAlive) continue;

            // Boss head touching snake body (also kills snake)
            // Avoid scanning long snakes unless they are nearby.
            if (this.boss.kind === 'NONO') continue;
            const closeEnough = snakeHead.distance(bossHead) < bossHeadRadius + 250;
            if (!closeEnough) continue;

            for (let i = 0; i < snake.segments.length; i += 3) {
                const seg = snake.segments[i];
                if (bossHead.distance(seg.position) < bossHeadRadius + seg.radius) {
                    this.killSnake(snake, null);
                    if (this.particlesEnabled) {
                        this.particles.deathExplosion(snakeHead, snake.palette.primary);
                    }
                    break;
                }
            }
        }
    }

    /**
     * Main render loop
     */
    private render(alpha: number): void {
        // EXTREME MOBILE OPTIMIZATION: Frame skipping
        this.renderFrameCount++;
        if (this.renderSkipFrames > 1 && this.renderFrameCount % this.renderSkipFrames !== 0) {
            // Skip this render frame - saves battery on high refresh displays
            return;
        }

        this.renderer.clear();

        if (this.state === 'playing' && this.player) {
            // EXTREME: Clear distance cache every 5 frames for LOD
            if (this.renderFrameCount % 5 === 0) {
                this.entityDistanceCache.clear();
                this.distanceCacheFrame = this.renderFrameCount;
            }
            const renderOptions: RenderOptions = {
                quality: this.graphicsQuality,
                glowEnabled: this.glowEnabled,
                colorScheme: this.uiTheme,
                ice: this.uiTheme === 'light',
                labelColor: this.renderer.getLabelColor(),
            };
            this.renderer.beginCamera();

            // Determine top-ranked snake (highest score) and mark it for crown rendering.
            let top: Snake = this.player;
            let topScore = top.score;
            // Prefer player on ties so it feels rewarding.
            const consider = (s: Snake): void => {
                if (!s.isAlive) return;
                if (s.score > topScore) {
                    topScore = s.score;
                    top = s;
                    return;
                }
                if (s.score === topScore && top && !top.isPlayer && s.isPlayer) {
                    top = s;
                }
            };
            for (const b of this.bots) consider(b);

            const topId = top.id;
            this.player.isTopRank = this.player.id === topId;
            for (const b of this.bots) b.isTopRank = b.id === topId;

            // Draw grid
            if (this.showGrid) {
                this.renderer.drawGrid();
            }

            // Draw boundary
            this.renderer.drawBoundary();

            // Draw food
            const ctx = this.renderer.getContext();
            // Cull food rendering by view bounds (huge FPS win on mobile).
            const viewMargin = this.fpsGenBetaEnabled ? 140 : 200;
            const halfW = (this.renderer.width / this.renderer.camera.zoom) / 2;
            const halfH = (this.renderer.height / this.renderer.camera.zoom) / 2;
            const minX = Math.max(0, this.renderer.camera.position.x - halfW - viewMargin);
            const maxX = Math.min(Config.WORLD_WIDTH, this.renderer.camera.position.x + halfW + viewMargin);
            const minY = Math.max(0, this.renderer.camera.position.y - halfH - viewMargin);
            const maxY = Math.min(Config.WORLD_HEIGHT, this.renderer.camera.position.y + halfH + viewMargin);
            this.collisionSystem.getFoodsInAABBInto(minX, minY, maxX, maxY, this.visibleFoods);
            for (const f of this.visibleFoods) {
                f.render(ctx, renderOptions);
            }

            // Draw particles - skip rendering if FPS is low on mobile
            if (this.particlesEnabled) {
                // EXTREME: Reduce particle rendering on mobile
                if (this.isTouchDevice) {
                    // Render particles at half rate on mobile
                    if (this.renderFrameCount % 2 === 0) {
                        this.particles.render(ctx, { ...renderOptions, quality: 'medium' });
                    }
                } else {
                    this.particles.render(ctx, renderOptions);
                }
            }

            // Draw bots - with EXTREME distance culling for mobile
            const playerPos = this.player.position;
            const lodDistanceHigh = 600;  // Full detail
            const lodDistanceMed = 1200;  // Reduced detail  
            const lodDistanceLow = 2000;  // Minimal detail
            const cullDistance = 3000;    // Don't render beyond this

            for (const bot of this.bots) {
                if (!bot.isAlive) continue;

                // Quick visibility check first
                if (!this.renderer.isVisible(bot.position, 200)) continue;

                // Distance-based LOD
                const dist = playerPos.distance(bot.position);

                // Cull very distant bots
                if (dist > cullDistance) continue;

                // Apply LOD based on distance
                if (dist > lodDistanceLow) {
                    // Far bots: render at half rate (every other frame)
                    if (this.renderFrameCount % 2 !== 0) continue;
                    bot.render(ctx, { ...renderOptions, quality: 'low' });
                } else if (dist > lodDistanceMed) {
                    // Medium distance: medium quality
                    bot.render(ctx, { ...renderOptions, quality: 'medium' });
                } else {
                    // Close bots: full quality
                    bot.render(ctx, renderOptions);
                }
            }

            // Draw Boss
            if (this.boss && this.boss.isAlive && this.renderer.isVisible(this.boss.position, 900)) {
                this.boss.render(ctx, renderOptions);
            }

            // Draw player
            if (this.player.isAlive) {
                this.player.render(ctx, renderOptions);
            }

            this.renderer.endCamera();
        }
    }

    // Getters for UI
    public getPlayer(): Snake | null {
        return this.player;
    }

    public getPlayerName(): string {
        return this.playerName;
    }

    public getHighScore(): number {
        return this.highScore;
    }

    public getLastKiller(): string | null {
        return this.lastKiller;
    }

    public getFPS(): number {
        return this.gameLoop.currentFPS;
    }

    public getPerformanceMetrics(): { fps: number; updateTime: number; renderTime: number } {
        return {
            fps: this.gameLoop.currentFPS,
            updateTime: this.gameLoop.lastUpdateTime,
            renderTime: this.gameLoop.lastRenderTime
        };
    }

    public getLeaderboard(): { name: string; score: number; isPlayer: boolean }[] {
        const entries: { name: string; score: number; isPlayer: boolean }[] = [];

        if (this.player && this.player.isAlive) {
            entries.push({ name: this.playerName, score: this.player.score, isPlayer: true });
        }

        for (const bot of this.bots) {
            if (bot.isAlive) {
                entries.push({ name: bot.name, score: bot.score, isPlayer: false });
            }
        }

        return entries.sort((a, b) => b.score - a.score).slice(0, 10);
    }

    public getInput(): InputManager {
        return this.input;
    }

    public getFPSManager(): FPSManager | null {
        return this.fpsManager;
    }

    /**
     * Get all snakes in the game (player + bots)
     */
    public getAllSnakes(): Snake[] {
        const snakes: Snake[] = [];
        if (this.player && this.player.isAlive) {
            snakes.push(this.player);
        }
        for (const bot of this.bots) {
            if (bot.isAlive) {
                snakes.push(bot);
            }
        }
        return snakes;
    }

    // Boss Interaction
    public getBoss(): Boss | null {
        return this.boss;
    }

    public getBossTimeRemaining(): number {
        return this.boss ? this.boss.lifetime : 0;
    }

    public getRecommendedUiUpdateIntervalMs(): number {
        return this.recommendedUiUpdateIntervalMs;
    }

    public getPerfStats(): {
        fps: number;
        updateMs: number;
        renderMs: number;
        droppedSteps: number;
        bots: number;
        foods: number;
        particles: number;
        pixelRatio: number;
    } {
        const m = this.gameLoop.getMetrics();
        return {
            fps: m.fps,
            updateMs: m.updateMs,
            renderMs: m.renderMs,
            droppedSteps: m.droppedSteps,
            bots: this.bots.length,
            foods: this.foodManager.getCount(),
            particles: this.particles.getCount(),
            pixelRatio: this.renderer.getPixelRatio(),
        };
    }
}
