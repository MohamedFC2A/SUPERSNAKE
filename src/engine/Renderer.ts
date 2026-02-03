import { Vector2 } from '../utils/utils';
import { Config } from '../config';

export interface Camera {
    position: Vector2;
    zoom: number;
    targetZoom: number;
}

export interface RendererResizeOptions {
    logicalWidth?: number;
    logicalHeight?: number;
}

/**
 * Renderer - Canvas 2D rendering system with camera support
 */
export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private logicalWidth: number = 0;
    private logicalHeight: number = 0;
    private pixelRatio: number = 1;
    private lastThemeKey: string | null = null;
    private themeColors: { bgA: string; bgB: string; grid: string; boundary: string; label: string; scheme: 'dark' | 'light' } = {
        bgA: Config.COLORS.BACKGROUND,
        bgB: '#05070A',
        grid: Config.COLORS.GRID_LINE,
        boundary: 'rgba(255, 255, 255, 0.18)',
        label: 'rgba(255, 255, 255, 0.85)',
        scheme: 'dark',
    };
    private backgroundCacheKey: string | null = null;
    private bgGradient: CanvasGradient | null = null;
    private vignetteGradient: CanvasGradient | null = null;

    public camera: Camera = {
        position: new Vector2(Config.WORLD_WIDTH / 2, Config.WORLD_HEIGHT / 2),
        zoom: 1,
        targetZoom: 1,
    };

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        // Prefer a faster, opaque canvas on mobile.
        const fastCtx = canvas.getContext('2d', { alpha: false, desynchronized: true } as any) as CanvasRenderingContext2D | null;
        this.ctx = fastCtx || canvas.getContext('2d')!;
        this.resize();
    }

    private refreshThemeCacheIfNeeded(): void {
        const root = document.documentElement;
        const theme = root.dataset.theme === 'light' ? 'light' : 'dark';
        const colorblind = root.dataset.colorblindMode || '';
        const highContrast = root.classList.contains('high-contrast') ? '1' : '0';
        const key = `${theme}|${colorblind}|${highContrast}`;
        if (key === this.lastThemeKey) return;
        this.lastThemeKey = key;

        const cs = getComputedStyle(root);
        const pick = (name: string, fallback: string): string => {
            const v = cs.getPropertyValue(name).trim();
            return v || fallback;
        };

        this.themeColors = {
            scheme: theme,
            bgA: pick('--game-bg-a', theme === 'light' ? '#F6FCFF' : Config.COLORS.BACKGROUND),
            bgB: pick('--game-bg-b', theme === 'light' ? '#DFF3FF' : '#05070A'),
            grid: pick('--game-grid', Config.COLORS.GRID_LINE),
            boundary: pick('--game-boundary', 'rgba(255, 255, 255, 0.18)'),
            label: pick('--game-label', theme === 'light' ? 'rgba(11, 18, 32, 0.75)' : 'rgba(255, 255, 255, 0.85)'),
        };

        // Theme changed: rebuild cached background gradients on next clear().
        this.backgroundCacheKey = null;
    }

    private ensureBackgroundCache(): void {
        const key = `${this.lastThemeKey || ''}|${this.width}x${this.height}`;
        if (key === this.backgroundCacheKey && this.bgGradient && this.vignetteGradient) return;
        this.backgroundCacheKey = key;

        // Background gradient (Ice theme in light mode)
        const bg = this.ctx.createLinearGradient(0, 0, 0, this.height);
        bg.addColorStop(0, this.themeColors.bgA);
        bg.addColorStop(1, this.themeColors.bgB);
        this.bgGradient = bg;

        // Subtle vignette (keeps edges readable, especially on light backgrounds).
        const outer = Math.max(this.width, this.height) * 0.78;
        const inner = Math.min(this.width, this.height) * 0.22;
        const vignette = this.ctx.createRadialGradient(
            this.width / 2,
            this.height / 2,
            inner,
            this.width / 2,
            this.height / 2,
            outer
        );
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, this.themeColors.scheme === 'light' ? 'rgba(2, 6, 23, 0.08)' : 'rgba(0, 0, 0, 0.20)');
        this.vignetteGradient = vignette;
    }

    public getLabelColor(): string {
        this.refreshThemeCacheIfNeeded();
        return this.themeColors.label;
    }

    public setPixelRatio(pixelRatio: number): void {
        // Detect mobile for aggressive performance optimization
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isLowEnd = (navigator as any).deviceMemory <= 4 || navigator.hardwareConcurrency <= 4;
        
        let next = Math.max(1, Math.min(3, pixelRatio || 1));
        
        // Cap pixel ratio on mobile for performance
        if (isTouch) {
            const maxDpr = isLowEnd ? 1 : 1.5;
            next = Math.min(next, maxDpr);
        }
        
        if (Math.abs(this.pixelRatio - next) < 0.01) return;
        this.pixelRatio = next;
        this.resize();
    }

    public resize(options: RendererResizeOptions = {}): void {
        const logicalWidth = options.logicalWidth ?? window.innerWidth;
        const logicalHeight = options.logicalHeight ?? window.innerHeight;

        this.logicalWidth = Math.max(1, Math.floor(logicalWidth));
        this.logicalHeight = Math.max(1, Math.floor(logicalHeight));

        // Keep CSS size in logical pixels (so the rest of the game can use normal coordinates).
        this.canvas.style.width = `${this.logicalWidth}px`;
        this.canvas.style.height = `${this.logicalHeight}px`;

        // Backing store in device pixels for crisp rendering.
        this.canvas.width = Math.floor(this.logicalWidth * this.pixelRatio);
        this.canvas.height = Math.floor(this.logicalHeight * this.pixelRatio);

        // Map logical pixels -> backing pixels.
        this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

        // Size changed: rebuild cached background gradients on next clear().
        this.backgroundCacheKey = null;
    }

    public get width(): number {
        return this.logicalWidth;
    }

    public get height(): number {
        return this.logicalHeight;
    }

    public getPixelRatio(): number {
        return this.pixelRatio;
    }

    public get screenCenter(): Vector2 {
        return new Vector2(this.width / 2, this.height / 2);
    }

    /**
     * Clear the canvas
     */
    public clear(): void {
        this.refreshThemeCacheIfNeeded();
        this.ensureBackgroundCache();

        this.ctx.fillStyle = this.bgGradient!;
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.fillStyle = this.vignetteGradient!;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * Begin camera transform
     */
    public beginCamera(): void {
        this.ctx.save();
        this.ctx.translate(this.width / 2, this.height / 2);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.position.x, -this.camera.position.y);
    }

    /**
     * End camera transform
     */
    public endCamera(): void {
        this.ctx.restore();
    }

    /**
     * Update camera to follow a target
     */
    public followTarget(target: Vector2, snakeSize: number): void {
        // Lerp camera position
        this.camera.position = this.camera.position.lerp(target, Config.CAMERA_LERP_SPEED);

        // Adjust zoom based on snake size
        const sizeRatio = snakeSize / Config.SNAKE_INITIAL_LENGTH;
        const baseZoom = 1.2 - (sizeRatio * 0.05);

        // Mobile portrait: zoom out a bit to show more area (better playability).
        const isPortrait = this.height > this.width;
        const minDim = Math.min(this.width, this.height);
        const smallScreenFactor = minDim < 780 ? (0.82 + 0.18 * (minDim / 780)) : 1;

        const zoomMin = Config.CAMERA_ZOOM_MIN * (isPortrait ? 0.72 : 1);
        const zoomMax = Config.CAMERA_ZOOM_MAX * (isPortrait ? 0.92 : 1);

        this.camera.targetZoom = Math.max(
            zoomMin,
            Math.min(zoomMax, baseZoom * smallScreenFactor)
        );

        // Lerp zoom
        this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 0.05;
    }

    /**
     * Convert world coordinates to screen coordinates
     */
    public worldToScreen(worldPos: Vector2): Vector2 {
        const x = (worldPos.x - this.camera.position.x) * this.camera.zoom + this.width / 2;
        const y = (worldPos.y - this.camera.position.y) * this.camera.zoom + this.height / 2;
        return new Vector2(x, y);
    }

    /**
     * Convert screen coordinates to world coordinates
     */
    public screenToWorld(screenPos: Vector2): Vector2 {
        const x = (screenPos.x - this.width / 2) / this.camera.zoom + this.camera.position.x;
        const y = (screenPos.y - this.height / 2) / this.camera.zoom + this.camera.position.y;
        return new Vector2(x, y);
    }

    /**
     * Check if a world position is visible on screen
     */
    public isVisible(worldPos: Vector2, margin: number = 100): boolean {
        const screenPos = this.worldToScreen(worldPos);
        return (
            screenPos.x > -margin &&
            screenPos.x < this.width + margin &&
            screenPos.y > -margin &&
            screenPos.y < this.height + margin
        );
    }

    /**
     * Draw the background grid
     */
    public drawGrid(): void {
        this.refreshThemeCacheIfNeeded();
        const gridSize = 80;
        const startX = Math.floor((this.camera.position.x - this.width / 2 / this.camera.zoom) / gridSize) * gridSize;
        const startY = Math.floor((this.camera.position.y - this.height / 2 / this.camera.zoom) / gridSize) * gridSize;
        const endX = startX + this.width / this.camera.zoom + gridSize * 2;
        const endY = startY + this.height / this.camera.zoom + gridSize * 2;

        this.ctx.strokeStyle = this.themeColors.grid;
        this.ctx.lineWidth = 1;

        this.ctx.beginPath();

        for (let x = startX; x <= endX; x += gridSize) {
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
        }

        for (let y = startY; y <= endY; y += gridSize) {
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
        }

        this.ctx.stroke();
    }

    /**
     * Draw world boundary
     */
    public drawBoundary(): void {
        this.refreshThemeCacheIfNeeded();
        // Clean boundary (no heavy glow)
        this.ctx.strokeStyle = this.themeColors.boundary;
        this.ctx.lineWidth = 3;
        this.ctx.shadowBlur = 0;

        this.ctx.strokeRect(0, 0, Config.WORLD_WIDTH, Config.WORLD_HEIGHT);
    }

    /**
     * Draw a circle
     */
    public drawCircle(x: number, y: number, radius: number, color: string, glow: boolean = false): void {
        if (glow) {
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = color;
        }

        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();

        if (glow) {
            this.ctx.shadowBlur = 0;
        }
    }

    /**
     * Draw a line
     */
    public drawLine(x1: number, y1: number, x2: number, y2: number, color: string, width: number = 1): void {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }

    /**
     * Draw text
     */
    public drawText(text: string, x: number, y: number, color: string, size: number = 16, align: CanvasTextAlign = 'center'): void {
        this.ctx.fillStyle = color;
        this.ctx.font = `${size}px 'Orbitron', monospace`;
        this.ctx.textAlign = align;
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x, y);
    }

    /**
     * Get the canvas context for custom rendering
     */
    public getContext(): CanvasRenderingContext2D {
        return this.ctx;
    }
}
