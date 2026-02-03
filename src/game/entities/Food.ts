import { Vector2, Random } from '../../utils/utils';
import { Config } from '../../config';
import type { RenderOptions } from '../render/RenderOptions';

export type FoodType = 'normal' | 'rare' | 'power' | 'speed_boost';

/**
 * Food - Consumable items that grow snakes
 */
export class Food {
    public id: string;
    public position: Vector2;
    public type: FoodType;
    public radius: number;
    public value: number;
    public color: string;
    public isConsumed: boolean = false;

    // Animation
    private pulsePhase: number = 0;
    private baseRadius: number;

    constructor(id: string, position: Vector2, type: FoodType = 'normal') {
        this.id = id;
        this.position = position;
        this.type = type;
        this.pulsePhase = Random.float(0, Math.PI * 2);

        switch (type) {
            case 'rare':
                this.radius = Random.float(Config.FOOD_SIZE_MAX, Config.FOOD_SIZE_MAX * 1.5);
                this.value = Config.FOOD_VALUE_RARE;
                this.color = Config.COLORS.NEON_PURPLE;
                break;
            case 'power':
                this.radius = Config.FOOD_SIZE_MAX * 2;
                this.value = Config.FOOD_VALUE_POWER;
                this.color = Config.COLORS.NEON_MAGENTA;
                break;
            case 'speed_boost':
                // Small pickup; effect is handled by game logic (not by "value")
                this.radius = Config.BOSS_DROP_RADIUS;
                this.value = 0;
                this.color = Config.COLORS.BOSS_EYE;
                break;
            default:
                this.radius = Random.float(Config.FOOD_SIZE_MIN, Config.FOOD_SIZE_MAX);
                this.value = Config.FOOD_VALUE_NORMAL;
                this.color = Random.choice([
                    Config.COLORS.NEON_CYAN,
                    Config.COLORS.NEON_GREEN,
                    Config.COLORS.NEON_ORANGE,
                    Config.COLORS.NEON_PINK,
                ]);
        }

        this.baseRadius = this.radius;
    }

    /**
     * Update animation
     */
    public update(dt: number): void {
        this.pulsePhase += 0.05;

        // Pulsing effect
        const pulseAmount = this.type === 'power' ? 0.3 : 0.15;
        this.radius = this.baseRadius * (1 + Math.sin(this.pulsePhase) * pulseAmount);
    }

    /**
     * Mark as consumed
     */
    public consume(): void {
        this.isConsumed = true;
    }

    /**
     * Render the food item
     */
    public render(ctx: CanvasRenderingContext2D, options?: RenderOptions): void {
        if (this.isConsumed) return;
        const glowEnabled = options?.glowEnabled === true;

        // Outer glow (optional; disabled for clean/crisp mode)
        if (glowEnabled) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
        } else {
            ctx.shadowBlur = 0;
        }

        // Draw main circle
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(
            this.position.x - this.radius * 0.2,
            this.position.y - this.radius * 0.2,
            this.radius * 0.3,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Special effects for power pellets
        if (this.type === 'power') {
            ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, this.radius * 1.5, 0, Math.PI * 2);
            ctx.stroke();
        } else if (this.type === 'speed_boost') {
            // Subtle highlight so it reads as special without being obnoxious
            if (glowEnabled) {
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 12;
            } else {
                ctx.shadowBlur = 0;
            }
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, Math.max(2, this.radius * 0.45), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

/**
 * FoodManager - Handles food spawning and object pooling
 */
export class FoodManager {
    private foods: Map<string, Food> = new Map();
    private foodPool: Food[] = [];
    private nextId: number = 0;
    private activeCache: Food[] | null = null;
    private targetCount: number = Config.FOOD_COUNT;
    private animationEnabled: boolean = true;

    /**
     * Initialize with starting food
     */
    public initialize(targetCount: number = this.targetCount): void {
        this.setTargetCount(targetCount);
        while (this.foods.size < this.targetCount) {
            this.spawnFood();
        }
    }

    public setTargetCount(count: number): void {
        const next = Math.max(120, Math.min(1200, Math.floor(Number.isFinite(count) ? count : Config.FOOD_COUNT)));
        if (this.targetCount === next) return;
        this.targetCount = next;
        this.trimToTarget();
        this.activeCache = null;
    }

    public setAnimationEnabled(enabled: boolean): void {
        this.animationEnabled = !!enabled;
    }

    public getTargetCount(): number {
        return this.targetCount;
    }

    private trimToTarget(): void {
        if (this.foods.size <= this.targetCount) return;

        // Prefer removing normal/rare/power food; keep speed-boost drops.
        const removable: string[] = [];
        const speedBoost: string[] = [];
        this.foods.forEach((food, id) => {
            if (food.type === 'speed_boost') speedBoost.push(id);
            else removable.push(id);
        });

        let idx = 0;
        while (this.foods.size > this.targetCount && idx < removable.length) {
            this.foods.delete(removable[idx++]);
        }

        // If we're still above target (only speed_boost remains), trim anyway.
        idx = 0;
        while (this.foods.size > this.targetCount && idx < speedBoost.length) {
            this.foods.delete(speedBoost[idx++]);
        }
    }

    /**
     * Spawn a new food item
     */
    public spawnFood(position?: Vector2, typeOverride?: FoodType): Food {
        const pos = position || new Vector2(
            Random.float(50, Config.WORLD_WIDTH - 50),
            Random.float(50, Config.WORLD_HEIGHT - 50)
        );

        // Determine food type
        let type: FoodType;
        if (typeOverride) {
            type = typeOverride;
        } else {
            const roll = Random.float(0, 1);
            type = 'normal';
            if (roll < 0.02) type = 'power';
            else if (roll < 0.1) type = 'rare';
        }

        const id = `food_${this.nextId++}`;
        const food = new Food(id, pos, type);
        this.foods.set(id, food);
        this.activeCache = null;

        return food;
    }

    /**
     * Spawn food from dead snake
     */
    public spawnFromDeath(positions: Vector2[], amount: number): void {
        for (let i = 0; i < Math.min(amount, positions.length); i++) {
            const pos = positions[i].add(Random.inCircle(20));
            this.spawnFood(pos);
        }
    }

    /**
     * Remove consumed food and maintain count
     */
    public cleanup(): void {
        const toRemove: string[] = [];

        this.foods.forEach((food, id) => {
            if (food.isConsumed) {
                toRemove.push(id);
            }
        });

        toRemove.forEach(id => this.foods.delete(id));
        if (toRemove.length > 0) {
            this.activeCache = null;
        }

        // Maintain target food count (and trim if too many).
        while (this.foods.size < this.targetCount) {
            this.spawnFood();
        }
        if (this.foods.size > this.targetCount) {
            this.trimToTarget();
            this.activeCache = null;
        }
    }

    /**
     * Update all food
     */
    public update(dt: number): void {
        if (!this.animationEnabled) return;
        this.foods.forEach(food => food.update(dt));
    }

    /**
     * Render all food
     */
    public render(ctx: CanvasRenderingContext2D, options?: RenderOptions): void {
        this.foods.forEach(food => food.render(ctx, options));
    }

    /**
     * Get all active food items
     */
    public getAll(): Food[] {
        if (this.activeCache) return this.activeCache;

        const active: Food[] = [];
        this.foods.forEach((food) => {
            if (!food.isConsumed) active.push(food);
        });
        this.activeCache = active;
        return active;
    }

    /**
     * Get food near a position
     */
    public getNear(position: Vector2, radius: number): Food[] {
        return this.getAll().filter(
            food => food.position.distance(position) < radius
        );
    }
}
