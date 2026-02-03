/**
 * ParticleBackground - Dynamic animated background for game-like feel
 * Creates floating particles and grid effects
 */

export interface ParticleOptions {
    color?: string;
    particleCount?: number;
    speed?: number;
    connectParticles?: boolean;
}

export class ParticleBackground {
    private container: HTMLElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private particles: Particle[] = [];
    private animationId: number | null = null;
    private resizeObserver: ResizeObserver | null = null;

    constructor(container: HTMLElement, options: ParticleOptions = {}) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'particle-background';
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
            opacity: 0.6;
        `;
        
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get canvas context');
        }
        this.ctx = ctx;
        
        // Insert before first child
        if (this.container.firstChild) {
            this.container.insertBefore(this.canvas, this.container.firstChild);
        } else {
            this.container.appendChild(this.canvas);
        }

        this.init(options);
    }

    private init(options: ParticleOptions): void {
        this.resize();
        this.createParticles(options);
        this.startAnimation();
        
        // Handle resize
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);
    }

    private resize(): void {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
    }

    private createParticles(options: ParticleOptions): void {
        const count = options.particleCount || 50;
        const colors = [
            'rgba(59, 130, 246, 0.5)',   // Blue
            'rgba(34, 197, 94, 0.4)',    // Green
            'rgba(236, 72, 153, 0.4)',   // Pink
            'rgba(168, 85, 247, 0.4)',   // Purple
            'rgba(6, 182, 212, 0.4)',    // Cyan
        ];

        const rect = this.container.getBoundingClientRect();
        
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * rect.width,
                y: Math.random() * rect.height,
                vx: (Math.random() - 0.5) * (options.speed || 0.5),
                vy: (Math.random() - 0.5) * (options.speed || 0.5),
                radius: Math.random() * 3 + 1,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: Math.random() * 0.5 + 0.2,
                pulse: Math.random() * Math.PI * 2,
                pulseSpeed: 0.02 + Math.random() * 0.03,
            });
        }
    }

    private startAnimation(): void {
        const animate = () => {
            const rect = this.container.getBoundingClientRect();
            this.ctx.clearRect(0, 0, rect.width, rect.height);

            // Update and draw particles
            this.particles.forEach((p, i) => {
                // Update position
                p.x += p.vx;
                p.y += p.vy;
                p.pulse += p.pulseSpeed;

                // Wrap around edges
                if (p.x < 0) p.x = rect.width;
                if (p.x > rect.width) p.x = 0;
                if (p.y < 0) p.y = rect.height;
                if (p.y > rect.height) p.y = 0;

                // Draw particle with glow
                const pulseAlpha = p.alpha + Math.sin(p.pulse) * 0.2;
                const currentAlpha = Math.max(0.1, Math.min(0.8, pulseAlpha));
                
                // Glow effect
                const gradient = this.ctx.createRadialGradient(
                    p.x, p.y, 0,
                    p.x, p.y, p.radius * 4
                );
                gradient.addColorStop(0, p.color.replace(/[\d.]+\)$/, `${currentAlpha})`));
                gradient.addColorStop(1, 'transparent');
                
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
                this.ctx.fillStyle = gradient;
                this.ctx.fill();

                // Core
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${currentAlpha + 0.2})`);
                this.ctx.fill();
            });

            // Draw connections between nearby particles
            this.drawConnections();

            // Draw floating grid
            this.drawGrid();

            this.animationId = requestAnimationFrame(animate);
        };

        animate();
    }

    private drawConnections(): void {
        const maxDistance = 150;
        const maxConnections = 3;

        for (let i = 0; i < this.particles.length; i++) {
            let connections = 0;
            for (let j = i + 1; j < this.particles.length && connections < maxConnections; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < maxDistance) {
                    const alpha = (1 - distance / maxDistance) * 0.2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    this.ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.stroke();
                    connections++;
                }
            }
        }
    }

    private drawGrid(): void {
        const rect = this.container.getBoundingClientRect();
        const gridSize = 80;
        const time = Date.now() * 0.0005;
        
        this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.03)';
        this.ctx.lineWidth = 1;
        
        // Vertical lines with wave effect
        for (let x = 0; x < rect.width; x += gridSize) {
            this.ctx.beginPath();
            for (let y = 0; y < rect.height; y += 10) {
                const waveX = x + Math.sin(y * 0.01 + time) * 10;
                if (y === 0) {
                    this.ctx.moveTo(waveX, y);
                } else {
                    this.ctx.lineTo(waveX, y);
                }
            }
            this.ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y < rect.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(rect.width, y);
            this.ctx.stroke();
        }
    }

    destroy(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this.canvas.remove();
    }
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    color: string;
    alpha: number;
    pulse: number;
    pulseSpeed: number;
}
