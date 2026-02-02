import { Vector2, Random } from '../../utils/utils';
import { Config } from '../../config';

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

    constructor(position: Vector2, velocity: Vector2, color: string, radius: number, life: number) {
        this.position = position.clone();
        this.velocity = velocity;
        this.color = color;
        this.radius = radius;
        this.life = life;
        this.maxLife = life;
    }

    public update(dt: number): void {
        this.position = this.position.add(this.velocity);
        this.velocity = this.velocity.multiply(0.98); // Friction
        this.life--;

        if (this.life <= 0) {
            this.isAlive = false;
        }
    }

    public render(ctx: CanvasRenderingContext2D): void {
        const alpha = this.life / this.maxLife;
        const currentRadius = this.radius * alpha;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;

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
        for (let i = 0; i < count; i++) {
            const angle = Random.float(0, Math.PI * 2);
            const velocity = new Vector2(
                Math.cos(angle) * Random.float(0.5, 1) * speed,
                Math.sin(angle) * Random.float(0.5, 1) * speed
            );

            const particle = new Particle(
                position,
                velocity,
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
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);

            if (!this.particles[i].isAlive) {
                this.particles.splice(i, 1);
            }
        }
    }

    /**
     * Render all particles
     */
    public render(ctx: CanvasRenderingContext2D): void {
        for (const particle of this.particles) {
            particle.render(ctx);
        }
    }

    /**
     * Clear all particles
     */
    public clear(): void {
        this.particles = [];
    }
}
