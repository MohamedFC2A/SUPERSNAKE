export type GameState = 'menu' | 'playing' | 'gameover';

export interface GameEvents {
    stateChange: (state: GameState) => void;
    scoreChange: (score: number) => void;
    playerDeath: (score: number, killer: string | null) => void;
    foodEaten: (value: number) => void;
    botKilled: (botName: string) => void;
}

// Detect mobile/low-end devices
function isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function isLowEndDevice(): boolean {
    const memory = (navigator as any).deviceMemory;
    const cores = navigator.hardwareConcurrency;
    return (memory && memory <= 4) || (cores && cores <= 4);
}

/**
 * Detect display refresh rate - attempts to determine if running on 120Hz display
 */
function detectRefreshRate(): number {
    // Check for high refresh rate using modern APIs
    if ('getScreenDetails' in window) {
        // @ts-ignore - Experimental API
        const screenDetails = window.getScreenDetails?.();
        if (screenDetails?.currentScreen?.refreshRate) {
            return screenDetails.currentScreen.refreshRate;
        }
    }
    
    // Check standard screen properties
    // @ts-ignore
    if (window.screen?.refreshRate) {
        // @ts-ignore
        return window.screen.refreshRate;
    }
    
    // Default assumption - most devices are 60Hz
    return 60;
}

/**
 * GameLoop - Main game loop with fixed timestep
 * Optimized for mobile performance with 120Hz cap
 */
export class GameLoop {
    private lastTime: number = 0;
    private accumulatedTime: number = 0;
    private FIXED_TIMESTEP: number = 1000 / 60;
    private readonly MAX_UPDATES_PER_FRAME: number;
    private isRunning: boolean = false;
    private animationFrameId: number = 0;
    
    // Mobile optimization
    private readonly isTouch: boolean;
    private readonly isLowEnd: boolean;
    private frameSkip: number = 1;
    private frameCount: number = 0;
    
    // 120Hz display handling
    private readonly targetFPS: number;
    private readonly minFrameTime: number;
    private lastRenderTimestamp: number = 0;
    private readonly detectedRefreshRate: number;
    private highRefreshDetected: boolean = false;

    private updateCallback: ((dt: number) => void) | null = null;
    private renderCallback: ((alpha: number) => void) | null = null;

    // Performance monitoring
    private perfFrameCount: number = 0;
    private fpsTime: number = 0;
    public currentFPS: number = 0;
    public lastUpdateTime: number = 0;
    public lastRenderTime: number = 0;
    private droppedStepsThisSecond: number = 0;
    public droppedStepsLastSecond: number = 0;
    
    // Adaptive quality
    private slowFrames: number = 0;
    private adaptiveQuality: boolean = true;

    public onUpdate(callback: (dt: number) => void): void {
        this.updateCallback = callback;
    }

    public onRender(callback: (alpha: number) => void): void {
        this.renderCallback = callback;
    }

    private boundLoop: (timestamp: number) => void;

    constructor(targetFPS?: number) {
        this.boundLoop = this.loop.bind(this);
        
        // Detect device capabilities
        this.isTouch = isTouchDevice();
        this.isLowEnd = isLowEndDevice();
        this.detectedRefreshRate = detectRefreshRate();
        
        // CAP AT 60 FPS MAX - even on 120Hz displays
        // This prevents battery drain and overheating on mobile
        if (targetFPS) {
            this.targetFPS = Math.min(targetFPS, 60); // Hard cap at 60
        } else if (this.isLowEnd) {
            this.targetFPS = 30;
        } else if (this.isTouch) {
            // FORCE 60 FPS CAP on mobile, even if display is 120Hz
            this.targetFPS = 60;
            // If we detect 120Hz, enable frame skipping
            if (this.detectedRefreshRate >= 90) {
                this.highRefreshDetected = true;
                this.frameSkip = 2; // Skip every other frame on 120Hz
            }
        } else {
            this.targetFPS = 60;
        }
        
        // Calculate minimum time between frames for capping
        this.minFrameTime = 1000 / this.targetFPS;
        
        // Adjust settings based on device
        if (this.isLowEnd) {
            this.MAX_UPDATES_PER_FRAME = 1;
            this.FIXED_TIMESTEP = 1000 / 30; // 30fps updates for low-end
            this.frameSkip = Math.max(this.frameSkip, 2);
        } else if (this.isTouch) {
            this.MAX_UPDATES_PER_FRAME = 1;
            this.FIXED_TIMESTEP = 1000 / 60;
            // frameSkip may already be 2 for 120Hz displays
        } else {
            this.MAX_UPDATES_PER_FRAME = 2;
            this.FIXED_TIMESTEP = 1000 / 60;
            this.frameSkip = 1;
        }
    }

    public start(): void {
        if (this.isRunning) return;

        this.isRunning = true;
        this.lastTime = performance.now();
        this.lastRenderTimestamp = this.lastTime;
        this.accumulatedTime = 0;
        this.perfFrameCount = 0;
        this.fpsTime = this.lastTime;
        this.slowFrames = 0;

        this.animationFrameId = requestAnimationFrame(this.boundLoop);
    }

    public stop(): void {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    public getMetrics(): { fps: number; updateMs: number; renderMs: number; droppedSteps: number; targetFPS: number } {
        return {
            fps: this.currentFPS,
            updateMs: this.lastUpdateTime,
            renderMs: this.lastRenderTime,
            droppedSteps: this.droppedStepsLastSecond,
            targetFPS: this.targetFPS,
        };
    }
    
    public isLowEndDevice(): boolean {
        return this.isLowEnd;
    }
    
    public getTargetFPS(): number {
        return this.targetFPS;
    }
    
    public getDetectedRefreshRate(): number {
        return this.detectedRefreshRate;
    }

    private loop(timestamp: number): void {
        if (!this.isRunning) return;
        
        // === 120Hz CAP ENFORCEMENT ===
        // Time-based throttling to strictly enforce FPS cap
        const timeSinceLastRender = timestamp - this.lastRenderTimestamp;
        if (timeSinceLastRender < this.minFrameTime * 0.9) {
            // Skip this frame - we're running too fast
            this.animationFrameId = requestAnimationFrame(this.boundLoop);
            return;
        }
        
        // Frame skipping for low-end devices and 120Hz displays
        this.frameCount++;
        if (this.frameCount % this.frameSkip !== 0) {
            this.animationFrameId = requestAnimationFrame(this.boundLoop);
            return;
        }

        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        this.accumulatedTime += deltaTime;

        // Prevent spiral of death - more aggressive on mobile
        const maxAccumulation = this.isLowEnd ? 100 : 200;
        if (this.accumulatedTime > maxAccumulation) {
            this.accumulatedTime = this.FIXED_TIMESTEP;
            this.droppedStepsThisSecond++;
        }

        // Fixed timestep updates
        const updateStart = performance.now();
        let updates = 0;
        while (this.accumulatedTime >= this.FIXED_TIMESTEP) {
            if (updates >= this.MAX_UPDATES_PER_FRAME) {
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
        this.lastRenderTimestamp = timestamp;
        
        // Adaptive quality: detect slow frames
        if (this.adaptiveQuality && this.isTouch) {
            const frameTime = this.lastUpdateTime + this.lastRenderTime;
            const targetFrameTime = 1000 / (this.isLowEnd ? 30 : 60);
            
            if (frameTime > targetFrameTime * 1.5) {
                this.slowFrames++;
                // If too many slow frames, reduce quality
                if (this.slowFrames > 10) {
                    this.frameSkip = Math.min(this.frameSkip + 1, 3);
                    this.slowFrames = 0;
                }
            } else {
                this.slowFrames = Math.max(0, this.slowFrames - 1);
            }
        }

        // FPS calculation
        this.perfFrameCount++;
        if (timestamp - this.fpsTime >= 1000) {
            this.currentFPS = Math.round(this.perfFrameCount * 1000 / (timestamp - this.fpsTime));
            this.perfFrameCount = 0;
            this.fpsTime = timestamp;
            this.droppedStepsLastSecond = this.droppedStepsThisSecond;
            this.droppedStepsThisSecond = 0;
        }

        this.animationFrameId = requestAnimationFrame(this.boundLoop);
    }
}
