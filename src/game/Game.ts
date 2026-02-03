import { Vector2, Random } from '../utils/utils';
import { Config } from '../config';
import { GameLoop, GameState } from '../engine/GameLoop';
import { InputManager } from '../engine/InputManager';
import { Renderer } from '../engine/Renderer';
import { Snake } from './entities/Snake';
import { Food, FoodManager } from './entities/Food';
import { ParticleSystem } from './entities/Particle';
import { CollisionSystem } from './systems/CollisionSystem';
import { AISystem } from './systems/AISystem';
import { Boss } from './entities/Boss';
import { getAudioManager, getMusicManager } from '../audio';
import type { GameSettings } from './SettingsManager';
import type { GraphicsQuality, RenderOptions } from './render/RenderOptions';

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
    private bossSpawned: boolean = false;
    private bossVfxMs: number = 0;

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

        this.setupGameLoop();
    }

    public applySettings(settings: GameSettings): void {
        this.graphicsQuality = settings.graphics.quality;
        this.showGrid = settings.graphics.showGrid;
        this.particlesEnabled = settings.graphics.particles;
        this.uiTheme = settings.ui.theme === 'light' ? 'light' : 'dark';

        // Clean visuals: glow is disabled across all presets (Ultra explicitly requires 0 glow).
        this.glowEnabled = false;

        const dpr = window.devicePixelRatio || 1;
        let desiredPixelRatio = 1;
        let particleIntensity = 1;

        switch (this.graphicsQuality) {
            case 'low':
                desiredPixelRatio = 1;
                particleIntensity = 0.35;
                break;
            case 'medium':
                desiredPixelRatio = Math.min(1.5, dpr);
                particleIntensity = 0.65;
                break;
            case 'high':
                desiredPixelRatio = Math.min(2, dpr);
                particleIntensity = 1.0;
                break;
            case 'ultra':
                desiredPixelRatio = Math.min(3, dpr);
                particleIntensity = 1.15;
                break;
        }

        this.renderer.setPixelRatio(desiredPixelRatio);
        this.renderer.resize({ logicalWidth: window.innerWidth, logicalHeight: window.innerHeight });

        this.particles.setEnabled(this.particlesEnabled);
        this.particles.setIntensity(particleIntensity);
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
        this.bossSpawned = false;

        // Initialize world
        this.foodManager.initialize();
        this.particles.clear();

        // Create player
        const playerPos = new Vector2(
            Config.WORLD_WIDTH / 2,
            Config.WORLD_HEIGHT / 2
        );
        this.player = new Snake('player', this.playerName, playerPos, true);

        // Create bots
        this.bots = [];
        for (let i = 0; i < Config.BOT_COUNT; i++) {
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
                this.aiSystem.update(bot, allSnakes, foods, dt);
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
            this.boss.update(dt, allSnakes);
            if (!this.boss.isAlive) {
                this.handleBossDeath();
            }
            // Ambient boss VFX (lightweight)
            if (this.particlesEnabled) {
                this.bossVfxMs += dt;
                if (this.bossVfxMs >= 160) {
                    const head = this.boss.segments[0]?.position ?? this.boss.position;
                    const jitter = Random.inCircle(this.boss.headRadius * 0.6);
                    this.particles.emit(head.add(jitter), '#ff2a2a', 1, 1.6, 4, 26);
                    this.bossVfxMs = 0;
                }
            }
        } else if (!this.bossSpawned && this.player.score >= Config.BOSS_SCORE_THRESHOLD) {
            this.spawnBoss();
        }

        // Update particles
        this.particles.update(dt);

        // Build collision grid
        this.collisionSystem.clear();
        for (const snake of allSnakes) {
            if (snake.isAlive) this.collisionSystem.registerSnake(snake);
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
            } else {
                this.player.grow(food.value);
                getAudioManager().play('collect');
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
                if (food.type === 'speed_boost') continue;
                food.consume();
                bot.grow(food.value);
            }
        }

        // Snake-snake collisions
        for (const snake of allSnakes) {
            if (!snake.isAlive) continue;

            const collision = this.collisionSystem.checkSnakeCollisions(snake, allSnakes);
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
        const targetCount = this.boss ? Math.floor(Config.BOT_COUNT / 2) : Config.BOT_COUNT;
        while (this.bots.length < targetCount) {
            this.spawnBot();
        }
    }

    private spawnBoss(): void {
        if (!this.player) return;

        this.bossSpawned = true;
        getAudioManager().play('bossSpawn', { volume: 0.9, pitchVariance: 0.01 });

        // Spawn far away in front of player
        const spawnDist = Config.BOSS_SAFE_DISTANCE;
        const spawnPos = this.player.position.add(this.player.direction.multiply(spawnDist));

        // Clamp to world
        spawnPos.x = Math.max(100, Math.min(Config.WORLD_WIDTH - 100, spawnPos.x));
        spawnPos.y = Math.max(100, Math.min(Config.WORLD_HEIGHT - 100, spawnPos.y));

        this.boss = new Boss(spawnPos);
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

        // Spawn a small speed-boost pickup
        this.foodManager.spawnFood(this.boss.position, 'speed_boost');

        this.boss = null;
    }

    private checkBossCollisions(allSnakes: Snake[]): void {
        if (!this.boss || !this.boss.isAlive) return;

        const bossHead = this.boss.segments[0]?.position ?? this.boss.position;
        const bossHeadRadius = this.boss.segments[0]?.radius ?? this.boss.headRadius;
        const bossSegments = this.boss.segments;

        for (const snake of allSnakes) {
            if (!snake.isAlive) continue;

            const snakeHead = snake.getHead();
            const snakeHeadRadius = snake.getCollisionRadius();

            // Fast path: head-to-head touch
            if (snakeHead.distance(bossHead) < snakeHeadRadius + bossHeadRadius) {
                this.killSnake(snake, null);
                if (this.particlesEnabled) {
                    this.particles.deathExplosion(snakeHead, snake.palette.primary);
                }
                continue;
            }

            // Snake head touching boss body (kills snake)
            // (Boss is large, but we keep it cheap by stepping segments.)
            for (let i = 0; i < bossSegments.length; i += 2) {
                const seg = bossSegments[i];
                if (snakeHead.distance(seg.position) < snakeHeadRadius + seg.radius) {
                    this.killSnake(snake, null);
                    if (this.particlesEnabled) {
                        this.particles.deathExplosion(snakeHead, snake.palette.primary);
                    }
                    break;
                }
            }

            if (!snake.isAlive) continue;

            // Boss head touching snake body (also kills snake)
            // Avoid scanning long snakes unless they are nearby.
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
        this.renderer.clear();

        if (this.state === 'playing' && this.player) {
            const renderOptions: RenderOptions = {
                quality: this.graphicsQuality,
                glowEnabled: this.glowEnabled,
                colorScheme: this.uiTheme,
                ice: this.uiTheme === 'light',
                labelColor: this.renderer.getLabelColor(),
            };
            this.renderer.beginCamera();

            // Draw grid
            if (this.showGrid) {
                this.renderer.drawGrid();
            }

            // Draw boundary
            this.renderer.drawBoundary();

            // Draw food
            const ctx = this.renderer.getContext();
            this.foodManager.render(ctx, renderOptions);

            // Draw particles
            this.particles.render(ctx, renderOptions);

            // Draw bots
            for (const bot of this.bots) {
                if (bot.isAlive && this.renderer.isVisible(bot.position, 200)) {
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
}
