export type GameState = 'menu' | 'playing' | 'gameover';

export interface GameEvents {
    stateChange: (state: GameState) => void;
    scoreChange: (score: number) => void;
    playerDeath: (score: number, killer: string | null) => void;
    foodEaten: (value: number) => void;
    botKilled: (botName: string) => void;
}

/**
 * GameLoop - Main game loop with fixed timestep
 */
export class GameLoop {
    private lastTime: number = 0;
    private accumulatedTime: number = 0;
    private readonly FIXED_TIMESTEP: number = 1000 / 60;
    private readonly MAX_UPDATES_PER_FRAME: number = 2;
    private isRunning: boolean = false;
    private animationFrameId: number = 0;

    private updateCallback: ((dt: number) => void) | null = null;
    private renderCallback: ((alpha: number) => void) | null = null;

    // Performance monitoring
    private frameCount: number = 0;
    private fpsTime: number = 0;
    public currentFPS: number = 0;
    public lastUpdateTime: number = 0;
    public lastRenderTime: number = 0;
    private droppedStepsThisSecond: number = 0;
    public droppedStepsLastSecond: number = 0;

    public onUpdate(callback: (dt: number) => void): void {
        this.updateCallback = callback;
    }

    public onRender(callback: (alpha: number) => void): void {
        this.renderCallback = callback;
    }

    private boundLoop: (timestamp: number) => void;

    constructor() {
        this.boundLoop = this.loop.bind(this);
    }

    public start(): void {
        if (this.isRunning) return;

        this.isRunning = true;
        this.lastTime = performance.now();
        this.accumulatedTime = 0;
        this.frameCount = 0;
        this.fpsTime = this.lastTime;

        this.animationFrameId = requestAnimationFrame(this.boundLoop);
    }

    public stop(): void {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    public getMetrics(): { fps: number; updateMs: number; renderMs: number; droppedSteps: number } {
        return {
            fps: this.currentFPS,
            updateMs: this.lastUpdateTime,
            renderMs: this.lastRenderTime,
            droppedSteps: this.droppedStepsLastSecond,
        };
    }

    private loop(timestamp: number): void {
        if (!this.isRunning) return;

        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        this.accumulatedTime += deltaTime;

        // Prevent spiral of death
        if (this.accumulatedTime > 200) {
            this.accumulatedTime = this.FIXED_TIMESTEP;
        }

        // Fixed timestep updates
        const updateStart = performance.now();
        let updates = 0;
        while (this.accumulatedTime >= this.FIXED_TIMESTEP) {
            if (updates >= this.MAX_UPDATES_PER_FRAME) {
                // Drop the rest. Prevents "catch-up" spirals that feel like the game froze on mobile.
                this.droppedStepsThisSecond += Math.max(1, Math.floor(this.accumulatedTime / this.FIXED_TIMESTEP));
                this.accumulatedTime = 0;
                break;
            }
            if (this.updateCallback) {
                this.updateCallback(this.FIXED_TIMESTEP);
            }
            this.accumulatedTime -= this.FIXED_TIMESTEP;
            updates++;
        }
        if (updates > 0) {
            this.lastUpdateTime = performance.now() - updateStart;
        }

        // Render with interpolation
        const renderStart = performance.now();
        const alpha = this.accumulatedTime / this.FIXED_TIMESTEP;
        if (this.renderCallback) {
            this.renderCallback(alpha);
        }
        this.lastRenderTime = performance.now() - renderStart;

        // FPS calculation
        this.frameCount++;
        if (timestamp - this.fpsTime >= 1000) {
            this.currentFPS = this.frameCount;
            this.frameCount = 0;
            this.fpsTime = timestamp;
            this.droppedStepsLastSecond = this.droppedStepsThisSecond;
            this.droppedStepsThisSecond = 0;
        }

        this.animationFrameId = requestAnimationFrame(this.boundLoop);
    }
}
