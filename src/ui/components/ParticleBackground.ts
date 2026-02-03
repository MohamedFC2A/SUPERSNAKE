/**
 * ParticleBackground - Dynamic animated background for game-like feel
 * Optimized for mobile performance
 */

export interface ParticleOptions {
    color?: string;
    particleCount?: number;
    speed?: number;
    connectParticles?: boolean;
}

// Mobile detection
function isTouchDevice(): boolean {
    return (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    );
}

function isLowEndDevice(): boolean {
    // Check for low-end devices
    const memory = (navigator as any).deviceMemory;
    const cores = navigator.hardwareConcurrency;
    
    if (memory && memory <= 4) return true;
    if (cores && cores <= 4) return true;
    
    // Check for older iPhones or Android
    const ua = navigator.userAgent;
    if (/iPhone OS (10|11|12|13)_/.test(ua)) return true;
    if (/Android [4-8]\./.test(ua)) return true;
    
    return false;
}

export class ParticleBackground {
    private container: HTMLElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private particles: Particle[] = [];
    private animationId: number | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private isTouch: boolean;
    private isLowEnd: boolean;
    private frameCount: number = 0;
    private lastTime: number = 0;

    constructor(container: HTMLElement, options: ParticleOptions = {}) {
        this.container = container;
        this.isTouch = isTouchDevice();
        this.isLowEnd = isLowEndDevice();
        
        // Skip particles entirely on very low-end devices
        if (this.isLowEnd) {
            this.canvas = null as any;
            this.ctx = null as any;
            this.container = container;
            return;
        }
        
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
            opacity: ${this.isTouch ? 0.4 : 0.6};
        `;
        
        const ctx = this.canvas.getContext('2d', { 
            alpha: true,
            desynchronized: true // Performance optimization
        });
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
        
        // Handle resize with debouncing
        let resizeTimeout: number;
        this.resizeObserver = new ResizeObserver(() => {
            window.clearTimeout(resizeTimeout);
            resizeTimeout = window.setTimeout(() => this.resize(), 100);
        });
        this.resizeObserver.observe(this.container);
        
        // Pause animation when tab is hidden
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    private handleVisibilityChange = (): void => {
        if (document.hidden) {
            this.stopAnimation();
        } else {
            this.startAnimation();
        }
    };

    private resize(): void {
        const rect = this.container.getBoundingClientRect();
        // Cap DPR for performance on mobile
        const dpr = this.isTouch 
            ? Math.min(1.5, window.devicePixelRatio || 1)
            : Math.min(2, window.devicePixelRatio || 1);
        
        this.canvas.width = Math.floor(rect.width * dpr);
        this.canvas.height = Math.floor(rect.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
    }

    private createParticles(options: ParticleOptions): void {
        // Reduce particle count on mobile
        let count = options.particleCount || 50;
        if (this.isTouch) {
            count = Math.floor(count * 0.4); // 60% reduction on mobile
        }
        if (this.isLowEnd) {
            count = Math.floor(count * 0.2); // 80% reduction on low-end
        }
        
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
                vx: (Math.random() - 0.5) * (options.speed || 0.5) * (this.isTouch ? 0.5 : 1),
                vy: (Math.random() - 0.5) * (options.speed || 0.5) * (this.isTouch ? 0.5 : 1),
                radius: Math.random() * (this.isTouch ? 2 : 3) + 1,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: Math.random() * 0.5 + 0.2,
                pulse: Math.random() * Math.PI * 2,
                pulseSpeed: 0.02 + Math.random() * 0.03,
            });
        }
    }

    private startAnimation(): void {
        if (this.animationId) return;
        
        const animate = (timestamp: number) => {
            // Skip frames on mobile for performance (30fps on mobile vs 60fps desktop)
            if (this.isTouch) {
                this.frameCount++;
                if (this.frameCount % 2 !== 0) {
                    this.animationId = requestAnimationFrame(animate);
                    return;
                }
            }
            
            const rect = this.container.getBoundingClientRect();
            this.ctx.clearRect(0, 0, rect.width, rect.height);

            // Batch draw operations for better performance
            this.drawParticles(rect);
            
            // Skip connections and grid on mobile for better performance
            if (!this.isTouch) {
                this.drawConnections();
                this.drawGrid(timestamp);
            }

            this.animationId = requestAnimationFrame(animate);
        };

        this.animationId = requestAnimationFrame(animate);
    }

    private stopAnimation(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    private drawParticles(rect: DOMRect): void {
        // Batch particle drawing by color
        const colorBatches = new Map<string, Particle[]>();
        
        for (const p of this.particles) {
            // Update position
            p.x += p.vx;
            p.y += p.vy;
            p.pulse += p.pulseSpeed;

            // Wrap around edges
            if (p.x < 0) p.x = rect.width;
            if (p.x > rect.width) p.x = 0;
            if (p.y < 0) p.y = rect.height;
            if (p.y > rect.height) p.y = 0;

            // Batch by color
            if (!colorBatches.has(p.color)) {
                colorBatches.set(p.color, []);
            }
            colorBatches.get(p.color)!.push(p);
        }

        // Draw batched particles
        for (const [color, particles] of colorBatches) {
            for (const p of particles) {
                const pulseAlpha = p.alpha + Math.sin(p.pulse) * 0.2;
                const currentAlpha = Math.max(0.1, Math.min(0.8, pulseAlpha));
                
                // Simplified drawing for mobile - skip glow on mobile
                if (this.isTouch) {
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    this.ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${currentAlpha + 0.2})`);
                    this.ctx.fill();
                } else {
                    // Glow effect for desktop
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
                }
            }
        }
    }

    private drawConnections(): void {
        const maxDistance = 150;
        const maxConnections = 3;

        this.ctx.lineWidth = 0.5;
        
        for (let i = 0; i < this.particles.length; i++) {
            let connections = 0;
            for (let j = i + 1; j < this.particles.length && connections < maxConnections; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const distanceSq = dx * dx + dy * dy;

                if (distanceSq < maxDistance * maxDistance) {
                    const distance = Math.sqrt(distanceSq);
                    const alpha = (1 - distance / maxDistance) * 0.2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    this.ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
                    this.ctx.stroke();
                    connections++;
                }
            }
        }
    }

    private drawGrid(timestamp: number): void {
        const rect = this.container.getBoundingClientRect();
        const gridSize = 80;
        const time = timestamp * 0.0005;
        
        this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.03)';
        this.ctx.lineWidth = 1;
        
        // Only draw grid lines every other frame for performance
        if (this.frameCount % 2 === 0) {
            // Vertical lines with wave effect
            for (let x = 0; x < rect.width; x += gridSize) {
                this.ctx.beginPath();
                for (let y = 0; y < rect.height; y += 20) { // Skip more pixels
                    const waveX = x + Math.sin(y * 0.01 + time) * 10;
                    if (y === 0) {
                        this.ctx.moveTo(waveX, y);
                    } else {
                        this.ctx.lineTo(waveX, y);
                    }
                }
                this.ctx.stroke();
            }
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
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        this.stopAnimation();
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.remove();
        }
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
