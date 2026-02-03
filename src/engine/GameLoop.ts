import { getDeviceProfile, getDetectedRefreshHz, type DeviceProfile } from '../utils/performance';

export type GameState = 'menu' | 'playing' | 'gameover';

export interface GameEvents {
    stateChange: (state: GameState) => void;
    scoreChange: (score: number) => void;
    playerDeath: (score: number, killer: string | null) => void;
    foodEaten: (value: number) => void;
    botKilled: (botName: string) => void;
}

export interface LoopMetrics {
    fps: number;
    updateMs: number;
    renderMs: number;
    updateSteps: number;
    renderSkipped: number;
    droppedSteps: number;
    targetUpdateHz: number;
    targetRenderHz: number;
}

/**
 * GameLoop - Main game loop with configurable update/render rates
 * 
 * Key design changes:
 * - Single source of truth for timing (no external frameSkip logic)
 * - Separate update and render rates for flexibility
 * - Uses unified DeviceProfile from performance.ts
 * - No double frame-cutting bugs
 */
export class GameLoop {
    // Timing
    private lastTime: number = 0;
    private accumulatedTime: number = 0;
    private isRunning: boolean = false;
    private animationFrameId: number = 0;
    private boundLoop: (timestamp: number) => void;

    // Configurable rates
    private targetUpdateHz: number = 60;
    private targetRenderHz: number = 60;
    private updateIntervalMs: number = 1000 / 60;
    private renderIntervalMs: number = 1000 / 60;
    private lastRenderMs: number = 0;

    // Device profile (cached)
    private readonly deviceProfile: DeviceProfile;
    private readonly MAX_UPDATES_PER_FRAME: number;

    // Callbacks
    private updateCallback: ((dt: number) => void) | null = null;
    private renderCallback: ((alpha: number) => void) | null = null;

    // Performance monitoring
    private perfFrameCount: number = 0;
    private fpsTime: number = 0;
    public currentFPS: number = 0;
    public lastUpdateTime: number = 0;
    public lastRenderTime: number = 0;

    // Metrics
    private updateStepsThisFrame: number = 0;
    private renderSkippedThisSecond: number = 0;
    private droppedStepsThisSecond: number = 0;
    public droppedStepsLastSecond: number = 0;
    private renderSkippedLastSecond: number = 0;

    constructor(initialUpdateHz?: number, initialRenderHz?: number) {
        this.boundLoop = this.loop.bind(this);

        // Use unified device profile
        this.deviceProfile = getDeviceProfile();

        // Set reasonable defaults based on device tier
        if (this.deviceProfile.isLowEnd) {
            this.MAX_UPDATES_PER_FRAME = 1;
            this.setTargetUpdateHz(30);
            this.setTargetRenderHz(30);
        } else if (this.deviceProfile.isTouch) {
            this.MAX_UPDATES_PER_FRAME = 2;
            this.setTargetUpdateHz(60);
            this.setTargetRenderHz(60);
        } else {
            this.MAX_UPDATES_PER_FRAME = 3;
            this.setTargetUpdateHz(60);
            this.setTargetRenderHz(60);
        }

        // Allow overrides from constructor
        if (initialUpdateHz !== undefined) {
            this.setTargetUpdateHz(initialUpdateHz);
        }
        if (initialRenderHz !== undefined) {
            this.setTargetRenderHz(initialRenderHz);
        }
    }

    public onUpdate(callback: (dt: number) => void): void {
        this.updateCallback = callback;
    }

    public onRender(callback: (alpha: number) => void): void {
        this.renderCallback = callback;
    }

    /**
     * Set target update rate (Hz)
     */
    public setTargetUpdateHz(hz: number): void {
        const clamped = Math.max(15, Math.min(120, hz));
        this.targetUpdateHz = clamped;
        this.updateIntervalMs = 1000 / clamped;
    }

    /**
     * Set target render rate (Hz)
     */
    public setTargetRenderHz(hz: number): void {
        const clamped = Math.max(15, Math.min(120, hz));
        this.targetRenderHz = clamped;
        this.renderIntervalMs = 1000 / clamped;
    }

    public getTargetUpdateHz(): number {
        return this.targetUpdateHz;
    }

    public getTargetRenderHz(): number {
        return this.targetRenderHz;
    }

    public start(): void {
        if (this.isRunning) return;

        this.isRunning = true;
        this.lastTime = performance.now();
        this.lastRenderMs = this.lastTime;
        this.accumulatedTime = 0;
        this.perfFrameCount = 0;
        this.fpsTime = this.lastTime;

        this.animationFrameId = requestAnimationFrame(this.boundLoop);
    }

    public stop(): void {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    public getMetrics(): LoopMetrics {
        return {
            fps: this.currentFPS,
            updateMs: this.lastUpdateTime,
            renderMs: this.lastRenderTime,
            updateSteps: this.updateStepsThisFrame,
            renderSkipped: this.renderSkippedLastSecond,
            droppedSteps: this.droppedStepsLastSecond,
            targetUpdateHz: this.targetUpdateHz,
            targetRenderHz: this.targetRenderHz,
        };
    }

    // Legacy compatibility
    public getTargetFPS(): number {
        return this.targetRenderHz;
    }

    public isLowEndDevice(): boolean {
        return this.deviceProfile.isLowEnd;
    }

    public getDetectedRefreshRate(): number {
        return getDetectedRefreshHz();
    }

    public getDeviceProfile(): DeviceProfile {
        return this.deviceProfile;
    }

    private loop(timestamp: number): void {
        if (!this.isRunning) return;

        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        this.accumulatedTime += deltaTime;

        // Prevent spiral of death - cap max accumulation
        const maxAccumulation = this.deviceProfile.isLowEnd ? 100 : 150;
        if (this.accumulatedTime > maxAccumulation) {
            const droppedSteps = Math.floor((this.accumulatedTime - this.updateIntervalMs) / this.updateIntervalMs);
            this.droppedStepsThisSecond += Math.max(0, droppedSteps);
            this.accumulatedTime = this.updateIntervalMs;
        }

        // Fixed timestep updates
        const updateStart = performance.now();
        let updates = 0;
        while (this.accumulatedTime >= this.updateIntervalMs && updates < this.MAX_UPDATES_PER_FRAME) {
            if (this.updateCallback) {
                this.updateCallback(this.updateIntervalMs);
            }
            this.accumulatedTime -= this.updateIntervalMs;
            updates++;
        }
        this.updateStepsThisFrame = updates;

        // If we still have accumulated time beyond max updates, drop it
        if (this.accumulatedTime >= this.updateIntervalMs) {
            const remaining = Math.floor(this.accumulatedTime / this.updateIntervalMs);
            this.droppedStepsThisSecond += remaining;
            this.accumulatedTime = this.accumulatedTime % this.updateIntervalMs;
        }

        if (updates > 0) {
            this.lastUpdateTime = performance.now() - updateStart;
        }

        // Render (with simple gating based on target render rate)
        const timeSinceRender = timestamp - this.lastRenderMs;
        const shouldRender = timeSinceRender >= this.renderIntervalMs * 0.9;

        if (shouldRender) {
            const renderStart = performance.now();
            const alpha = this.accumulatedTime / this.updateIntervalMs;

            if (this.renderCallback) {
                this.renderCallback(alpha);
            }

            this.lastRenderTime = performance.now() - renderStart;
            this.lastRenderMs = timestamp;
            this.perfFrameCount++;
        } else {
            this.renderSkippedThisSecond++;
        }

        // FPS calculation (every second)
        if (timestamp - this.fpsTime >= 1000) {
            this.currentFPS = Math.round(this.perfFrameCount * 1000 / (timestamp - this.fpsTime));
            this.perfFrameCount = 0;
            this.fpsTime = timestamp;
            this.droppedStepsLastSecond = this.droppedStepsThisSecond;
            this.droppedStepsThisSecond = 0;
            this.renderSkippedLastSecond = this.renderSkippedThisSecond;
            this.renderSkippedThisSecond = 0;
        }

        this.animationFrameId = requestAnimationFrame(this.boundLoop);
    }
}
