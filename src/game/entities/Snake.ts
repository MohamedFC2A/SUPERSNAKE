import { Vector2, Random, ColorUtils } from '../../utils/utils';
import { Config, SnakePalette } from '../../config';
import type { RenderOptions } from '../render/RenderOptions';
import { drawCrown } from '../render/drawCrown';

export interface SnakeSegment {
    position: Vector2;
    radius: number;
}

/**
 * Snake - Player or Bot snake entity
 */
export class Snake {
    public id: string;
    public name: string;
    public isPlayer: boolean;
    public isAlive: boolean = true;

    // Position and movement
    public position: Vector2;
    public velocity: Vector2 = new Vector2();
    public direction: Vector2 = new Vector2(1, 0);
    public targetDirection: Vector2 = new Vector2(1, 0);
    public angle: number = 0;

    // Body segments
    public segments: SnakeSegment[] = [];
    private historyX: Float32Array = new Float32Array(0);
    private historyY: Float32Array = new Float32Array(0);
    private historyHead: number = 0; // index of newest sample
    private historySize: number = 0;
    private historyCapacity: number = 0;

    // Stats
    public score: number = 0;
    public mass: number = 0;
    public speed: number = Config.SNAKE_BASE_SPEED;
    public isBoosting: boolean = false;
    public boostEnergy: number = Config.BOOST_MAX_ENERGY;
    public speedBoostTimer: number = 0;
    public speedBoostMultiplier: number = Config.SPEED_BOOST_MULTIPLIER;
    public infiniteBoost: boolean = false;

    // AI (bots only)
    public aiLevel: 1 | 2 | 3 = 1;

    // CollisionSystem scratch (dedupe nearby lists without allocating Sets)
    public _nearbyStamp: number = 0;

    // Visual: top-ranked snake gets a crown
    public isTopRank: boolean = false;

    public activateSpeedBoost(duration: number, multiplier: number = Config.SPEED_BOOST_MULTIPLIER): void {
        this.speedBoostTimer = duration;
        this.speedBoostMultiplier = multiplier;
    }

    public activateInfiniteBoost(): void {
        this.infiniteBoost = true;
        this.boostEnergy = Config.BOOST_MAX_ENERGY;
    }

    // Appearance
    public palette: SnakePalette;
    public headRadius: number = Config.SNAKE_SEGMENT_SIZE;

    constructor(
        id: string,
        name: string,
        position: Vector2,
        isPlayer: boolean = false,
        initialLength: number = Config.SNAKE_INITIAL_LENGTH
    ) {
        this.id = id;
        this.name = name;
        this.position = position.clone();
        this.isPlayer = isPlayer;
        this.aiLevel = 1;
        this.palette = isPlayer
            ? Config.SNAKE_PALETTES[0]
            : Random.choice([...Config.SNAKE_PALETTES]);

        // Initialize body segments
        this.initializeBody(initialLength);
        this.calculateMass();
    }

    private initializeBody(length: number): void {
        this.segments = [];

        for (let i = 0; i < length; i++) {
            const segPos = new Vector2(
                this.position.x - i * Config.SNAKE_SEGMENT_SPACING,
                this.position.y
            );

            // Segment size tapers towards tail
            const ratio = 1 - (i / length) * 0.5;
            const radius = this.headRadius * ratio;

            this.segments.push({ position: segPos, radius });
        }

        this.rebuildHistoryFromSegments();
    }

    private rebuildHistoryFromSegments(): void {
        const desired = this.getDesiredHistoryCapacity();
        this.ensureHistoryCapacity(desired);
        this.historySize = 0;
        this.historyHead = 0;

        // Fill history so that offset 0 is the head and older offsets map down the body.
        for (let i = this.segments.length - 1; i >= 0; i--) {
            const p = this.segments[i].position;
            for (let j = 0; j < 3; j++) {
                this.pushHistory(p.x, p.y);
            }
        }
    }

    private getDesiredHistoryCapacity(): number {
        return Math.max(32, this.segments.length * 3 + 10);
    }

    private ensureHistoryCapacity(minCapacity: number): void {
        const nextCap = Math.max(32, Math.floor(Number.isFinite(minCapacity) ? minCapacity : 32));
        if (this.historyCapacity >= nextCap) return;

        const oldSize = this.historySize;
        const oldCap = this.historyCapacity;
        const oldHead = this.historyHead;
        const oldX = this.historyX;
        const oldY = this.historyY;

        this.historyX = new Float32Array(nextCap);
        this.historyY = new Float32Array(nextCap);
        this.historyCapacity = nextCap;
        this.historySize = 0;
        this.historyHead = 0;

        // Re-insert samples from oldest -> newest to preserve offset semantics.
        if (oldCap > 0 && oldSize > 0) {
            for (let offset = oldSize - 1; offset >= 0; offset--) {
                const idx = (() => {
                    let i = oldHead - offset;
                    if (i < 0) i += oldCap;
                    return i;
                })();
                this.pushHistory(oldX[idx], oldY[idx]);
            }
        }
    }

    private pushHistory(x: number, y: number): void {
        if (this.historyCapacity <= 0) return;
        if (this.historySize === 0) {
            this.historyHead = 0;
            this.historySize = 1;
        } else {
            this.historyHead = (this.historyHead + 1) % this.historyCapacity;
            if (this.historySize < this.historyCapacity) this.historySize++;
        }
        this.historyX[this.historyHead] = x;
        this.historyY[this.historyHead] = y;
    }

    private getHistoryIndex(offset: number): number {
        if (this.historySize <= 0) return -1;
        const o = Math.max(0, Math.min(this.historySize - 1, Math.floor(Number.isFinite(offset) ? offset : 0)));
        let idx = this.historyHead - o;
        if (idx < 0) idx += this.historyCapacity;
        return idx;
    }

    private calculateMass(): void {
        this.mass = this.segments.reduce((sum, seg) => sum + seg.radius * seg.radius, 0) / 100;

        // Update head size based on mass
        this.headRadius = Config.SNAKE_SEGMENT_SIZE + Math.sqrt(this.mass) * 0.5;

        // Speed decreases slightly with size
        const next = Config.SNAKE_BASE_SPEED * (1 - Math.min(this.mass * 0.01, 0.3));
        this.speed = Math.max(Config.SNAKE_MIN_MOVE_SPEED, Math.min(Config.SNAKE_MAX_MOVE_SPEED, next));
    }

    /**
     * Set the target direction for the snake to turn towards
     */
    public setDirection(direction: Vector2): void {
        const mag = direction.magnitude();
        if (mag > 0) {
            this.targetDirection.set(direction.x / mag, direction.y / mag);
        }
    }

    /**
     * Set boost state
     */
    public setBoost(active: boolean): void {
        if (active && (this.infiniteBoost || this.boostEnergy > 0)) {
            this.isBoosting = true;
        } else {
            this.isBoosting = false;
        }
    }

    /**
     * Update snake position and body
     */
    /**
     * Update snake position and body
     */
    public update(dt: number): void {
        if (!this.isAlive) return;

        const dtSec = dt / 1000;

        if (this.infiniteBoost) {
            // Keep the HUD charge full and avoid any drift from other logic.
            this.boostEnergy = Config.BOOST_MAX_ENERGY;
        }

        // Turn towards target direction
        const targetAngle = Math.atan2(this.targetDirection.y, this.targetDirection.x);
        let angleDiff = targetAngle - this.angle;

        // Normalize angle difference
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Apply turn rate limit
        const maxTurn = Config.SNAKE_MAX_TURN_RATE * dtSec;
        if (Math.abs(angleDiff) > maxTurn) {
            angleDiff = Math.sign(angleDiff) * maxTurn;
        }

        this.angle += angleDiff;
        this.direction.set(Math.cos(this.angle), Math.sin(this.angle));

        // Calculate speed
        let currentSpeed = this.speed;

        // Apply Speed Boost (Pickup)
        if (this.speedBoostTimer > 0) {
            this.speedBoostTimer -= dtSec;
            currentSpeed *= this.speedBoostMultiplier;
            if (this.speedBoostTimer <= 0) {
                this.speedBoostMultiplier = Config.SPEED_BOOST_MULTIPLIER;
            }
        }

        if (this.isBoosting && (this.infiniteBoost || this.boostEnergy > 0)) {
            currentSpeed = Config.SNAKE_BOOST_SPEED; // Boost overrides normal speed, maybe stack?
            if (this.speedBoostTimer > 0) {
                currentSpeed *= this.speedBoostMultiplier; // Stack logic
            }
            if (!this.infiniteBoost) {
                this.boostEnergy -= Config.SNAKE_BOOST_COST * dtSec;

                // Lose mass while boosting (reduced rate for a more fun feel with higher boost capacity)
                if (this.segments.length > 5 && Random.bool(3.25 * dtSec)) {
                    this.shrink(1);
                }
            }
        } else {
            if (!this.infiniteBoost) {
                // Regenerate boost energy (approx 12 per second)
                this.boostEnergy = Math.min(Config.BOOST_MAX_ENERGY, this.boostEnergy + Config.BOOST_REGEN_PER_SEC * dtSec);
            } else {
                this.boostEnergy = Config.BOOST_MAX_ENERGY;
            }
        }

        // Move head (in-place: avoids allocations every frame)
        const move = currentSpeed * dtSec;
        this.velocity.set(this.direction.x * move, this.direction.y * move);
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        // Keep within world bounds
        this.position.x = Math.max(this.headRadius, Math.min(Config.WORLD_WIDTH - this.headRadius, this.position.x));
        this.position.y = Math.max(this.headRadius, Math.min(Config.WORLD_HEIGHT - this.headRadius, this.position.y));

        // Add current position to history (ring buffer)
        this.ensureHistoryCapacity(this.getDesiredHistoryCapacity());
        this.pushHistory(this.position.x, this.position.y);

        // Update segment positions to follow history (no allocations)
        for (let i = 0; i < this.segments.length; i++) {
            const historyOffset = i * 3 + 2;
            const idx = this.getHistoryIndex(historyOffset);
            if (idx >= 0) {
                this.segments[i].position.set(this.historyX[idx], this.historyY[idx]);
            } else {
                this.segments[i].position.set(this.position.x, this.position.y);
            }
        }
    }

    /**
     * Grow the snake by adding segments
     */
    public grow(amount: number = 1): void {
        for (let i = 0; i < amount; i++) {
            const lastSegment = this.segments[this.segments.length - 1];
            const ratio = 1 - (this.segments.length / (this.segments.length + 1)) * 0.5;

            this.segments.push({
                position: lastSegment.position.clone(),
                radius: this.headRadius * ratio,
            });

            this.score += 1;
        }

        this.calculateMass();
        this.ensureHistoryCapacity(this.getDesiredHistoryCapacity());
    }

    /**
     * Shrink the snake by removing segments
     */
    public shrink(amount: number = 1): void {
        for (let i = 0; i < amount && this.segments.length > 3; i++) {
            this.segments.pop();
        }
        this.calculateMass();
        // Keep history capacity; no shrink needed.
    }

    /**
     * Kill the snake
     */
    public die(): void {
        this.isAlive = false;
    }

    /**
     * Get head position
     */
    public getHead(): Vector2 {
        return this.position;
    }

    /**
     * Get collision radius
     */
    public getCollisionRadius(): number {
        return this.headRadius;
    }

    /**
     * Render the snake
     */
    public render(ctx: CanvasRenderingContext2D, options?: RenderOptions): void {
        if (!this.isAlive) return;
        const glowEnabled = options?.glowEnabled === true;
        const q = options?.quality ?? 'high';
        const fast = q === 'medium' || q === 'low';
        const ultra = q === 'ultra' || q === 'super_ultra';
        const ice = options?.ice === true;
        const iceDetailed = ice && ultra; // expensive gradients only on higher presets

        const mixWithWhite = (hex: string, amount: number, alpha: number): string => {
            const rgb = ColorUtils.hexToRgb(hex);
            if (!rgb) return hex;
            const a = Math.max(0, Math.min(1, amount));
            const r = Math.round(rgb[0] + (255 - rgb[0]) * a);
            const g = Math.round(rgb[1] + (255 - rgb[1]) * a);
            const b = Math.round(rgb[2] + (255 - rgb[2]) * a);
            return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
        };
        const primary = this.palette.primary;
        const secondary = this.palette.secondary;
        const iceFill0 = iceDetailed ? mixWithWhite(primary, 0.70, 0.95) : '';
        const iceFill1 = iceDetailed ? mixWithWhite(primary, 0.15, 0.98) : '';
        const iceFill2 = iceDetailed ? mixWithWhite(secondary, 0.05, 0.98) : '';

        // Draw segments from tail to head
        const step = fast ? (this.isPlayer ? 1 : 2) : 1;
        for (let i = this.segments.length - 1; i >= 0; i -= step) {
            const segment = this.segments[i];
            const radius = segment.radius;

            // Base fill
            if (iceDetailed) {
                const g = ctx.createRadialGradient(
                    segment.position.x - radius * 0.25,
                    segment.position.y - radius * 0.25,
                    radius * 0.15,
                    segment.position.x,
                    segment.position.y,
                    radius
                );
                g.addColorStop(0, iceFill0);
                g.addColorStop(0.55, iceFill1);
                g.addColorStop(1, iceFill2);
                ctx.fillStyle = g;
            } else {
                // Ice in fast presets uses a single, cheap fill.
                if (ice) {
                    ctx.fillStyle = i === 0 ? primary : secondary;
                } else {
                    ctx.fillStyle = i === 0 ? primary : secondary;
                }
            }

            // Add glow to head
            if (i === 0) {
                if (glowEnabled) {
                    ctx.shadowBlur = 18;
                    ctx.shadowColor = this.palette.primary;
                } else {
                    ctx.shadowBlur = 0;
                }
            }

            ctx.beginPath();
            ctx.arc(segment.position.x, segment.position.y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Ice rim light
            if (iceDetailed) {
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.stroke();
            }

            if (i === 0) {
                ctx.shadowBlur = 0;

                // Draw eyes
                this.drawEyes(ctx);

                // Small head highlight (ice sparkle)
                if (iceDetailed) {
                    const hx = this.position.x + this.direction.x * this.headRadius * 0.15;
                    const hy = this.position.y + this.direction.y * this.headRadius * 0.15;
                    ctx.beginPath();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
                    ctx.arc(hx - this.direction.y * this.headRadius * 0.25, hy + this.direction.x * this.headRadius * 0.25, this.headRadius * 0.45, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Crown for #1 snake (always readable).
        if (this.isTopRank) {
            const baseY = this.position.y - this.headRadius - Math.max(10, this.headRadius * 0.45);
            drawCrown(ctx, this.position.x, baseY, Math.max(18, this.headRadius * 1.05), options);
        }

        // Draw name above head
        if (!this.isPlayer && !fast) {
            ctx.font = '12px Rajdhani';
            ctx.textAlign = 'center';

            const labelY = this.position.y - this.headRadius - 10;
            ctx.fillStyle = options?.labelColor || 'rgba(255, 255, 255, 0.85)';
            ctx.fillText(this.name, this.position.x, labelY);

            // AI level badge: dots next to name (1 green, 2 yellow, 3 red)
            const metrics = ctx.measureText(this.name);
            const dots = this.aiLevel;
            const dotRadius = 3;
            const dotGap = 4;
            const totalDotsWidth = dots * (dotRadius * 2) + (dots - 1) * dotGap;

            const startX = this.position.x + metrics.width / 2 + 8;
            const dotY = labelY - 4;

            const dotColor = dots === 3 ? '#ef4444' : dots === 2 ? '#f59e0b' : '#22c55e';
            ctx.fillStyle = dotColor;
            for (let i = 0; i < dots; i++) {
                const x = startX + i * (dotRadius * 2 + dotGap);
                ctx.beginPath();
                ctx.arc(x, dotY, dotRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    private drawEyes(ctx: CanvasRenderingContext2D): void {
        const eyeOffset = this.headRadius * 0.4;
        const eyeRadius = this.headRadius * 0.25;
        const pupilRadius = eyeRadius * 0.6;

        // Calculate eye positions based on direction
        const perpendicular = new Vector2(-this.direction.y, this.direction.x);
        const eyeForward = this.direction.multiply(this.headRadius * 0.3);

        const leftEyePos = this.position.add(eyeForward).add(perpendicular.multiply(eyeOffset));
        const rightEyePos = this.position.add(eyeForward).add(perpendicular.multiply(-eyeOffset));

        // Draw eye whites
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(leftEyePos.x, leftEyePos.y, eyeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rightEyePos.x, rightEyePos.y, eyeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw pupils (looking in direction)
        const pupilOffset = this.direction.multiply(eyeRadius * 0.3);
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(leftEyePos.x + pupilOffset.x, leftEyePos.y + pupilOffset.y, pupilRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rightEyePos.x + pupilOffset.x, rightEyePos.y + pupilOffset.y, pupilRadius, 0, Math.PI * 2);
        ctx.fill();
    }
}
