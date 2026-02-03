/**
 * MiniMap - Shows real snake positions and world state
 * 
 * Features:
 * - Accurate world-to-minimap coordinate mapping
 * - Snake bodies drawn as polylines with distinct colors
 * - Player highlighted with glow effect
 * - Viewport rectangle showing current camera view
 * - Throttled rendering for performance
 * - 'M' key toggle
 */

import { Config } from '../../config';

export interface MiniMapSnake {
    segments: { x: number; y: number }[];
    color: string;
    isPlayer: boolean;
    name: string;
    isCrowned?: boolean;
}

export interface MiniMapConfig {
    worldWidth: number;
    worldHeight: number;
}

export class MiniMap {
    private container: HTMLElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: MiniMapConfig;
    private isVisible: boolean = true;

    private readonly mapSize = 140;
    private readonly padding = 4;

    // Throttling
    private lastUpdateTime: number = 0;
    private readonly updateInterval: number = 80; // ~12 FPS for minimap

    // Reusable arrays for performance
    private snakeCache: MiniMapSnake[] = [];

    constructor(config: MiniMapConfig) {
        this.config = config;
        this.container = document.createElement('div');
        this.container.className = 'minimap';

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.mapSize;
        this.canvas.height = this.mapSize;
        this.canvas.className = 'minimap-canvas';

        this.ctx = this.canvas.getContext('2d')!;

        this.render();
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="minimap-body" id="minimapBody"></div>
        `;

        const body = this.container.querySelector('#minimapBody') as HTMLElement | null;
        body?.appendChild(this.canvas);
    }

    getElement(): HTMLElement {
        return this.container;
    }

    /**
     * Update minimap with real snake data
     */
    update(
        playerX: number,
        playerY: number,
        snakes: MiniMapSnake[],
        viewportWidth?: number,
        viewportHeight?: number,
        crownMarkers?: { x: number; y: number }[]
    ): void {
        if (!this.isVisible) return;

        // Throttle updates
        const now = performance.now();
        if (now - this.lastUpdateTime < this.updateInterval) return;
        this.lastUpdateTime = now;

        const ctx = this.ctx;
        const size = this.mapSize;

        // Clear canvas with clean dark background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.fillRect(0, 0, size, size);

        // Scale factors
        const scaleX = size / this.config.worldWidth;
        const scaleY = size / this.config.worldHeight;

        // Draw world border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(1, 1, size - 2, size - 2);

        // Draw grid lines (subtle)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 0.5;
        const gridStep = size / 4;
        for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(i * gridStep, 0);
            ctx.lineTo(i * gridStep, size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * gridStep);
            ctx.lineTo(size, i * gridStep);
            ctx.stroke();
        }

        // Draw viewport rectangle if provided
        if (viewportWidth && viewportHeight) {
            const vpW = viewportWidth * scaleX;
            const vpH = viewportHeight * scaleY;
            const vpX = playerX * scaleX - vpW / 2;
            const vpY = playerY * scaleY - vpH / 2;

            ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(vpX, vpY, vpW, vpH);
        }

        // Draw snakes (bots first, then player on top)
        const sortedSnakes = [...snakes].sort((a, b) => {
            if (a.isPlayer) return 1;
            if (b.isPlayer) return -1;
            return 0;
        });

        for (const snake of sortedSnakes) {
            this.drawSnake(ctx, snake, scaleX, scaleY);
        }

        // Crown markers (top snake + bosses). Draw last so it's always visible.
        if (crownMarkers && crownMarkers.length > 0) {
            for (const m of crownMarkers) {
                const x = m.x * scaleX;
                const y = m.y * scaleY;
                this.drawCrownMarker(ctx, x, y);
            }
        }
    }

    private drawSnake(
        ctx: CanvasRenderingContext2D,
        snake: MiniMapSnake,
        scaleX: number,
        scaleY: number
    ): void {
        if (snake.segments.length === 0) return;

        const segments = snake.segments;
        const alpha = snake.isPlayer ? 1 : 0.7;

        // Draw body as polyline (thin, every few segments to reduce draw calls)
        ctx.strokeStyle = snake.isPlayer
            ? `rgba(59, 130, 246, ${alpha * 0.6})`
            : `rgba(239, 68, 68, ${alpha * 0.5})`;
        ctx.lineWidth = snake.isPlayer ? 2 : 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        const step = Math.max(1, Math.floor(segments.length / 20)); // Max 20 points per snake

        for (let i = 0; i < segments.length; i += step) {
            const x = segments[i].x * scaleX;
            const y = segments[i].y * scaleY;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Draw head (larger, brighter)
        const headX = segments[0].x * scaleX;
        const headY = segments[0].y * scaleY;
        const headSize = snake.isPlayer ? 4 : 3;

        // Glow for player
        if (snake.isPlayer) {
            ctx.beginPath();
            ctx.arc(headX, headY, headSize + 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
            ctx.fill();
        }

        // Head dot
        ctx.beginPath();
        ctx.arc(headX, headY, headSize, 0, Math.PI * 2);
        ctx.fillStyle = snake.isPlayer ? '#3B82F6' : snake.color;
        ctx.fill();

        // Small crown hint on the head for the top snake.
        if (snake.isCrowned) {
            this.drawCrownMarker(ctx, headX, headY);
        }
    }

    private drawCrownMarker(ctx: CanvasRenderingContext2D, x: number, y: number): void {
        // Big, bright yellow marker so players can locate the crowned entity quickly.
        const r = 7;
        ctx.save();
        ctx.translate(x, y);

        // Outer ring glow
        ctx.beginPath();
        ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 212, 0, 0.22)';
        ctx.fill();

        // Star-like crown dot
        ctx.beginPath();
        const spikes = 6;
        const outer = r;
        const inner = r * 0.55;
        for (let i = 0; i < spikes * 2; i++) {
            const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
            const rad = i % 2 === 0 ? outer : inner;
            const px = Math.cos(a) * rad;
            const py = Math.sin(a) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = '#FFD400';
        ctx.fill();

        // Tiny highlight
        ctx.beginPath();
        ctx.arc(-r * 0.18, -r * 0.18, r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fill();

        ctx.restore();
    }

    show(): void {
        this.isVisible = true;
        this.container.classList.remove('hidden');
    }

    hide(): void {
        this.isVisible = false;
        this.container.classList.add('hidden');
    }
}

// Re-export for backwards compatibility
export interface MiniMapEntity {
    x: number;
    y: number;
    size: number;
    color: string;
    isPlayer: boolean;
    isThreat: boolean;
}
