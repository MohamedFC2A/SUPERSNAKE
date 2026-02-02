import { Vector2 } from '../utils/utils';
import { Config } from '../config';

export interface Camera {
    position: Vector2;
    zoom: number;
    targetZoom: number;
}

/**
 * Renderer - Canvas 2D rendering system with camera support
 */
export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    public camera: Camera = {
        position: new Vector2(Config.WORLD_WIDTH / 2, Config.WORLD_HEIGHT / 2),
        zoom: 1,
        targetZoom: 1,
    };

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.resize();

        window.addEventListener('resize', () => this.resize());
    }

    private resize(): void {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    public get width(): number {
        return this.canvas.width;
    }

    public get height(): number {
        return this.canvas.height;
    }

    public get screenCenter(): Vector2 {
        return new Vector2(this.width / 2, this.height / 2);
    }

    /**
     * Clear the canvas
     */
    public clear(): void {
        this.ctx.fillStyle = Config.COLORS.BACKGROUND;
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
        this.camera.targetZoom = Math.max(
            Config.CAMERA_ZOOM_MIN,
            Math.min(Config.CAMERA_ZOOM_MAX, 1.2 - (sizeRatio * 0.05))
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
        const gridSize = 80;
        const startX = Math.floor((this.camera.position.x - this.width / 2 / this.camera.zoom) / gridSize) * gridSize;
        const startY = Math.floor((this.camera.position.y - this.height / 2 / this.camera.zoom) / gridSize) * gridSize;
        const endX = startX + this.width / this.camera.zoom + gridSize * 2;
        const endY = startY + this.height / this.camera.zoom + gridSize * 2;

        this.ctx.strokeStyle = Config.COLORS.GRID_LINE;
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
        this.ctx.strokeStyle = Config.COLORS.NEON_MAGENTA;
        this.ctx.lineWidth = 4;
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = Config.COLORS.NEON_MAGENTA;

        this.ctx.strokeRect(0, 0, Config.WORLD_WIDTH, Config.WORLD_HEIGHT);

        this.ctx.shadowBlur = 0;
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
