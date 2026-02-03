import { Vector2, Random } from '../../utils/utils';
import { Config } from '../../config';
import type { RenderOptions } from '../render/RenderOptions';

/**
 * Particle - Visual effect particle
 */
export class Particle {
    public position: Vector2;
    public velocity: Vector2;
    public color: string;
    public radius: number;
    public life: number;
    public maxLife: number;
    public isAlive: boolean = true;

    constructor() {
        this.position = new Vector2();
        this.velocity = new Vector2();
        this.color = '#ffffff';
        this.radius = 2;
        this.life = 0;
        this.maxLife = 0;
        this.isAlive = false;
    }

    public reset(x: number, y: number, vx: number, vy: number, color: string, radius: number, life: number): void {
        this.position.set(x, y);
        this.velocity.set(vx, vy);
        this.color = color;
        this.radius = radius;
        this.life = life;
        this.maxLife = life;
        this.isAlive = true;
    }

    public update(dt: number): void {
        // Fixed-timestep game loop; keep particle update allocation-free.
        void dt;
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;
        this.velocity.x *= 0.98; // friction
        this.velocity.y *= 0.98;
        this.life -= 1;

        if (this.life <= 0) {
            this.isAlive = false;
        }
    }

    public render(ctx: CanvasRenderingContext2D, options?: RenderOptions): void {
        const alpha = this.life / this.maxLife;
        const currentRadius = this.radius * alpha;
        const glowEnabled = options?.glowEnabled === true;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        if (glowEnabled) {
            ctx.shadowBlur = 6;
            ctx.shadowColor = this.color;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}

/**
 * ParticleSystem - Manages all particle effects
 */
export class ParticleSystem {
    private particles: Particle[] = [];
    private pool: Particle[] = [];
    private enabled: boolean = true;
    private intensity: number = 1;

    public getCount(): number {
        return this.particles.length;
    }

    public getPoolCount(): number {
        return this.pool.length;
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.clear();
        }
    }

    public setIntensity(multiplier: number): void {
        this.intensity = Math.max(0, Math.min(2, multiplier || 1));
    }

    /**
     * Emit particles at a position
     */
    public emit(
        position: Vector2,
        color: string,
        count: number = 5,
        speed: number = 2,
        radius: number = 3,
        life: number = 30
    ): void {
        if (!this.enabled) return;
        const finalCount = Math.max(0, Math.floor(count * this.intensity));
        if (finalCount <= 0) return;

        for (let i = 0; i < finalCount; i++) {
            const angle = Random.float(0, Math.PI * 2);
            const velScale = Random.float(0.5, 1) * speed;
            const vx = Math.cos(angle) * velScale;
            const vy = Math.sin(angle) * velScale;

            const particle = this.pool.pop() ?? new Particle();
            particle.reset(
                position.x,
                position.y,
                vx,
                vy,
                color,
                Random.float(radius * 0.5, radius),
                Random.int(life * 0.7, life)
            );

            this.particles.push(particle);
        }
    }

    /**
     * Create boost trail particles
     */
    public boostTrail(position: Vector2, color: string): void {
        this.emit(position, color, 2, 1, 4, 20);
    }

    /**
     * Create death explosion
     */
    public deathExplosion(position: Vector2, color: string): void {
        this.emit(position, color, 30, 5, 6, 60);
        this.emit(position, '#ffffff', 10, 3, 4, 40);
    }

    /**
     * Create food consumed effect
     */
    public foodConsumed(position: Vector2, color: string): void {
        this.emit(position, color, 8, 3, 4, 25);
    }

    /**
     * Update all particles
     */
    public update(dt: number): void {
        if (!this.enabled) return;
        let write = 0;
        const parts = this.particles;
        for (let read = 0; read < parts.length; read++) {
            const p = parts[read];
            p.update(dt);
            if (p.isAlive) {
                parts[write++] = p;
            } else {
                this.pool.push(p);
            }
        }
        parts.length = write;
    }

    /**
     * Render all particles
     */
    public render(ctx: CanvasRenderingContext2D, options?: RenderOptions): void {
        if (!this.enabled) return;
        for (const particle of this.particles) {
            particle.render(ctx, options);
        }
    }

    /**
     * Clear all particles
     */
    public clear(): void {
        for (const p of this.particles) this.pool.push(p);
        this.particles.length = 0;
    }
}
