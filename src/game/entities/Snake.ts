import { Vector2, Random } from '../../utils/utils';
import { Config, SnakePalette } from '../../config';
import type { RenderOptions } from '../render/RenderOptions';

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
    private positionHistory: Vector2[] = [];

    // Stats
    public score: number = 0;
    public mass: number = 0;
    public speed: number = Config.SNAKE_BASE_SPEED;
    public isBoosting: boolean = false;
    public boostEnergy: number = 100;
    public speedBoostTimer: number = 0;
    public speedBoostMultiplier: number = Config.SPEED_BOOST_MULTIPLIER;

    // AI (bots only)
    public aiLevel: 1 | 2 | 3 = 1;

    public activateSpeedBoost(duration: number, multiplier: number = Config.SPEED_BOOST_MULTIPLIER): void {
        this.speedBoostTimer = duration;
        this.speedBoostMultiplier = multiplier;
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
        this.positionHistory = [];

        for (let i = 0; i < length; i++) {
            const segPos = new Vector2(
                this.position.x - i * Config.SNAKE_SEGMENT_SPACING,
                this.position.y
            );

            // Segment size tapers towards tail
            const ratio = 1 - (i / length) * 0.5;
            const radius = this.headRadius * ratio;

            this.segments.push({ position: segPos, radius });

            // Add multiple history points per segment for smooth following
            for (let j = 0; j < 3; j++) {
                this.positionHistory.push(segPos.clone());
            }
        }
    }

    private calculateMass(): void {
        this.mass = this.segments.reduce((sum, seg) => sum + seg.radius * seg.radius, 0) / 100;

        // Update head size based on mass
        this.headRadius = Config.SNAKE_SEGMENT_SIZE + Math.sqrt(this.mass) * 0.5;

        // Speed decreases slightly with size
        this.speed = Config.SNAKE_BASE_SPEED * (1 - Math.min(this.mass * 0.01, 0.3));
    }

    /**
     * Set the target direction for the snake to turn towards
     */
    public setDirection(direction: Vector2): void {
        if (direction.magnitude() > 0) {
            this.targetDirection = direction.normalize();
        }
    }

    /**
     * Set boost state
     */
    public setBoost(active: boolean): void {
        if (active && this.boostEnergy > 0) {
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
        this.direction = Vector2.fromAngle(this.angle);

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

        if (this.isBoosting && this.boostEnergy > 0) {
            currentSpeed = Config.SNAKE_BOOST_SPEED; // Boost overrides normal speed, maybe stack?
            if (this.speedBoostTimer > 0) {
                currentSpeed *= this.speedBoostMultiplier; // Stack logic
            }
            this.boostEnergy -= Config.SNAKE_BOOST_COST * dtSec;

            // Lose mass while boosting (approx 6 times per second)
            if (this.segments.length > 5 && Random.bool(6 * dtSec)) {
                this.shrink(1);
            }
        } else {
            // Regenerate boost energy (approx 12 per second)
            this.boostEnergy = Math.min(100, this.boostEnergy + 12 * dtSec);
        }

        // Move head
        this.velocity = this.direction.multiply(currentSpeed * dtSec);
        this.position = this.position.add(this.velocity);

        // Keep within world bounds
        this.position.x = Math.max(this.headRadius, Math.min(Config.WORLD_WIDTH - this.headRadius, this.position.x));
        this.position.y = Math.max(this.headRadius, Math.min(Config.WORLD_HEIGHT - this.headRadius, this.position.y));

        // Add current position to history
        this.positionHistory.unshift(this.position.clone());

        // Update segment positions to follow history
        for (let i = 0; i < this.segments.length; i++) {
            const historyIndex = Math.min(i * 3 + 2, this.positionHistory.length - 1);
            this.segments[i].position = this.positionHistory[historyIndex];
        }

        // Trim history
        const maxHistory = this.segments.length * 3 + 10;
        if (this.positionHistory.length > maxHistory) {
            this.positionHistory.length = maxHistory;
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
    }

    /**
     * Shrink the snake by removing segments
     */
    public shrink(amount: number = 1): void {
        for (let i = 0; i < amount && this.segments.length > 3; i++) {
            this.segments.pop();
        }
        this.calculateMass();
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

        // Draw segments from tail to head
        for (let i = this.segments.length - 1; i >= 0; i--) {
            const segment = this.segments[i];
            const ratio = i / this.segments.length;

            // Gradient from secondary to primary color
            ctx.fillStyle = i === 0 ? this.palette.primary : this.palette.secondary;

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
            ctx.arc(segment.position.x, segment.position.y, segment.radius, 0, Math.PI * 2);
            ctx.fill();

            if (i === 0) {
                ctx.shadowBlur = 0;

                // Draw eyes
                this.drawEyes(ctx);
            }
        }

        // Draw name above head
        if (!this.isPlayer) {
            ctx.font = '12px Rajdhani';
            ctx.textAlign = 'center';

            const labelY = this.position.y - this.headRadius - 10;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
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
