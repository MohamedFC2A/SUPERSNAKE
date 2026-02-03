export interface PerformanceBase {
    pixelRatio: number;
    particleIntensity: number;
    botCount: number;
    foodCount: number;
}

export interface PerformanceMetrics {
    fps: number;
    updateMs: number;
    renderMs: number;
    droppedSteps: number;
}

export interface PerformanceDecision {
    level: 0 | 1 | 2 | 3;
    targetMode: '60' | '120';
    pixelRatio: number;
    particleIntensity: number;
    botCount: number;
    foodCount: number;
    recommendedUiIntervalMs: number;
}

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/**
 * PerformanceGovernor - auto-tunes a few "big levers" to keep gameplay smooth on mobile:
 * - pixel ratio (render cost)
 * - particle intensity
 * - bot count
 * - food count
 *
 * It never exceeds the configured base values; it only reduces load when needed.
 */
export class PerformanceGovernor {
    private base: PerformanceBase | null = null;
    private level: 0 | 1 | 2 | 3 = 0;
    private targetMode: '60' | '120' = '60';
    private highRefreshConfidence: number = 0;
    private goodSeconds: number = 0;
    private lastDecision: PerformanceDecision | null = null;

    constructor(private readonly isTouchDevice: boolean) { }

    public setBase(base: PerformanceBase): void {
        this.base = { ...base };
        // If the ceiling changes (settings), keep the current level but recompute outputs.
        this.lastDecision = null;
    }

    public getState(): { level: 0 | 1 | 2 | 3; targetMode: '60' | '120' } {
        return { level: this.level, targetMode: this.targetMode };
    }

    public decide(metrics: PerformanceMetrics): PerformanceDecision | null {
        if (!this.isTouchDevice) return null;
        if (!this.base) return null;

        const fps = Number.isFinite(metrics.fps) ? metrics.fps : 0;
        const dropped = Number.isFinite(metrics.droppedSteps) ? metrics.droppedSteps : 0;

        // Detect high-refresh devices opportunistically.
        if (fps >= 95) this.highRefreshConfidence = Math.min(5, this.highRefreshConfidence + 1);
        else this.highRefreshConfidence = Math.max(0, this.highRefreshConfidence - 1);
        this.targetMode = this.highRefreshConfidence >= 3 ? '120' : '60';

        const targetMin = this.targetMode === '120' ? 95 : 55;
        const targetGood = this.targetMode === '120' ? 110 : 58;

        const updateMs = Number.isFinite(metrics.updateMs) ? metrics.updateMs : 0;
        const renderMs = Number.isFinite(metrics.renderMs) ? metrics.renderMs : 0;

        const bad =
            dropped > 0 ||
            fps < targetMin ||
            // If the game is spending too long inside update/render, the device will stutter even if FPS looks ok.
            updateMs > 12 ||
            renderMs > 14;

        if (bad) {
            this.goodSeconds = 0;
            this.level = (Math.min(3, this.level + 1) as 0 | 1 | 2 | 3);
        } else if (fps >= targetGood && dropped === 0) {
            this.goodSeconds += 1;
            if (this.goodSeconds >= 3 && this.level > 0) {
                this.level = (Math.max(0, this.level - 1) as 0 | 1 | 2 | 3);
                this.goodSeconds = 0;
            }
        } else {
            this.goodSeconds = 0;
        }

        const base = this.base;
        const pixelRatio = clamp(base.pixelRatio - 0.15 * this.level, 1, base.pixelRatio);
        const particleIntensity = clamp(base.particleIntensity * (1 - 0.25 * this.level), 0.35, base.particleIntensity);
        const botCount = Math.max(6, Math.round(base.botCount - 2 * this.level));
        const foodCount = Math.max(180, Math.round(base.foodCount - 60 * this.level));
        const recommendedUiIntervalMs = this.level === 0 ? 0 : this.level === 1 ? 60 : this.level === 2 ? 90 : 120;

        const decision: PerformanceDecision = {
            level: this.level,
            targetMode: this.targetMode,
            pixelRatio,
            particleIntensity,
            botCount,
            foodCount,
            recommendedUiIntervalMs,
        };

        // Avoid re-applying the same values.
        if (
            this.lastDecision &&
            this.lastDecision.level === decision.level &&
            this.lastDecision.targetMode === decision.targetMode &&
            Math.abs(this.lastDecision.pixelRatio - decision.pixelRatio) < 0.01 &&
            Math.abs(this.lastDecision.particleIntensity - decision.particleIntensity) < 0.01 &&
            this.lastDecision.botCount === decision.botCount &&
            this.lastDecision.foodCount === decision.foodCount &&
            this.lastDecision.recommendedUiIntervalMs === decision.recommendedUiIntervalMs
        ) {
            return null;
        }

        this.lastDecision = decision;
        return decision;
    }
}

