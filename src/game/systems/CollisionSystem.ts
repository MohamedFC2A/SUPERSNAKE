import { Vector2 } from '../../utils/utils';
import { Snake } from '../entities/Snake';
import { Food } from '../entities/Food';
import { Config } from '../../config';

interface GridCell {
    snakes: Snake[];
    foods: Food[];
}

/**
 * CollisionSystem - Spatial partitioning for efficient collision detection
 */
export class CollisionSystem {
    private readonly cellSize: number = Config.GRID_CELL_SIZE;
    private readonly gridW: number;
    private readonly gridH: number;
    private readonly cells: GridCell[];
    private readonly cellStamp: Uint32Array;
    private frameStamp: number = 1;
    private activeCells: number[] = [];

    // Dedupe for getNearbySnakes without allocating Sets.
    private snakeStampCounter: number = 1;

    constructor() {
        this.gridW = Math.max(1, Math.ceil(Config.WORLD_WIDTH / this.cellSize));
        this.gridH = Math.max(1, Math.ceil(Config.WORLD_HEIGHT / this.cellSize));
        const count = this.gridW * this.gridH;
        this.cells = Array.from({ length: count }, () => ({ snakes: [], foods: [] }));
        this.cellStamp = new Uint32Array(count);
    }

    private clampCellX(cx: number): number {
        return Math.max(0, Math.min(this.gridW - 1, cx));
    }

    private clampCellY(cy: number): number {
        return Math.max(0, Math.min(this.gridH - 1, cy));
    }

    private getCellIndex(x: number, y: number): number {
        const cellX = this.clampCellX(Math.floor(x / this.cellSize));
        const cellY = this.clampCellY(Math.floor(y / this.cellSize));
        return cellY * this.gridW + cellX;
    }

    private touchCell(index: number): GridCell {
        if (this.cellStamp[index] !== this.frameStamp) {
            this.cellStamp[index] = this.frameStamp;
            const c = this.cells[index];
            c.snakes.length = 0;
            c.foods.length = 0;
            this.activeCells.push(index);
        }
        return this.cells[index];
    }

    /**
     * Clear the grid
     */
    public clear(): void {
        // Bump stamp so cells are lazily cleared on first use this frame.
        this.frameStamp = (this.frameStamp + 1) >>> 0;
        if (this.frameStamp === 0) {
            // Extremely unlikely, but keep correctness.
            this.frameStamp = 1;
            this.cellStamp.fill(0);
        }
        this.activeCells.length = 0;
    }

    /**
     * Register a snake in the grid
     */
    public registerSnake(snake: Snake, segmentStep: number = 1): void {
        if (!snake.isAlive) return;
        const step = Math.max(1, Math.floor(Number.isFinite(segmentStep) ? segmentStep : 1));

        // Register head
        const headIdx = this.getCellIndex(snake.position.x, snake.position.y);
        this.touchCell(headIdx).snakes.push(snake);

        // Register body segments in relevant cells (cheap dedupe: adjacent segments usually share cells)
        let lastIdx = headIdx;
        for (let i = 0; i < snake.segments.length; i += step) {
            const segment = snake.segments[i];
            const idx = this.getCellIndex(segment.position.x, segment.position.y);
            if (idx !== lastIdx) {
                this.touchCell(idx).snakes.push(snake);
                lastIdx = idx;
            }
        }
    }

    /**
     * Register food in the grid
     */
    public registerFood(food: Food): void {
        if (food.isConsumed) return;

        const idx = this.getCellIndex(food.position.x, food.position.y);
        this.touchCell(idx).foods.push(food);
    }

    /**
     * Get nearby snakes from adjacent cells
     */
    public getNearbySnakes(position: Vector2): Snake[] {
        return this.getNearbySnakesRadius(position, 1);
    }

    public getNearbySnakesRadius(position: Vector2, radiusCells: number): Snake[] {
        const out: Snake[] = [];
        this.getNearbySnakesInto(position, radiusCells, out);
        return out;
    }

    public getNearbySnakesInto(position: Vector2, radiusCells: number, out: Snake[]): void {
        out.length = 0;
        const r = Math.max(1, Math.floor(Number.isFinite(radiusCells) ? radiusCells : 1));
        const cellX = this.clampCellX(Math.floor(position.x / this.cellSize));
        const cellY = this.clampCellY(Math.floor(position.y / this.cellSize));

        let stamp = (this.snakeStampCounter + 1) >>> 0;
        if (stamp === 0) stamp = 1;
        this.snakeStampCounter = stamp;

        for (let dx = -r; dx <= r; dx++) {
            const cx = this.clampCellX(cellX + dx);
            for (let dy = -r; dy <= r; dy++) {
                const cy = this.clampCellY(cellY + dy);
                const idx = cy * this.gridW + cx;
                if (this.cellStamp[idx] !== this.frameStamp) continue;
                const cell = this.cells[idx];
                for (const s of cell.snakes) {
                    if (s._nearbyStamp === stamp) continue;
                    s._nearbyStamp = stamp;
                    out.push(s);
                }
            }
        }
    }

    /**
     * Get nearby foods from adjacent cells
     */
    public getNearbyFoods(position: Vector2): Food[] {
        return this.getNearbyFoodsRadius(position, 1);
    }

    public getNearbyFoodsRadius(position: Vector2, radiusCells: number): Food[] {
        const foods: Food[] = [];
        this.getNearbyFoodsInto(position, radiusCells, foods);
        return foods;
    }

    public getNearbyFoodsInto(position: Vector2, radiusCells: number, out: Food[]): void {
        out.length = 0;
        const r = Math.max(1, Math.floor(Number.isFinite(radiusCells) ? radiusCells : 1));
        const cellX = this.clampCellX(Math.floor(position.x / this.cellSize));
        const cellY = this.clampCellY(Math.floor(position.y / this.cellSize));

        for (let dx = -r; dx <= r; dx++) {
            const cx = this.clampCellX(cellX + dx);
            for (let dy = -r; dy <= r; dy++) {
                const cy = this.clampCellY(cellY + dy);
                const idx = cy * this.gridW + cx;
                if (this.cellStamp[idx] !== this.frameStamp) continue;
                const cell = this.cells[idx];
                for (const f of cell.foods) out.push(f);
            }
        }
    }

    /**
     * Get foods inside an axis-aligned bounding box (world coordinates).
     * Used for render culling to avoid iterating every food each frame.
     */
    public getFoodsInAABBInto(minX: number, minY: number, maxX: number, maxY: number, out: Food[]): void {
        out.length = 0;

        const cellMinX = this.clampCellX(Math.floor(minX / this.cellSize));
        const cellMaxX = this.clampCellX(Math.floor(maxX / this.cellSize));
        const cellMinY = this.clampCellY(Math.floor(minY / this.cellSize));
        const cellMaxY = this.clampCellY(Math.floor(maxY / this.cellSize));

        for (let cx = cellMinX; cx <= cellMaxX; cx++) {
            for (let cy = cellMinY; cy <= cellMaxY; cy++) {
                const idx = cy * this.gridW + cx;
                if (this.cellStamp[idx] !== this.frameStamp) continue;
                const cell = this.cells[idx];
                for (const f of cell.foods) {
                    if (!f.isConsumed) out.push(f);
                }
            }
        }
    }

    public getFoodsInAABB(minX: number, minY: number, maxX: number, maxY: number): Food[] {
        const foods: Food[] = [];
        this.getFoodsInAABBInto(minX, minY, maxX, maxY, foods);
        return foods;
    }

    /**
     * Check snake-food collisions
     */
    public checkFoodCollisions(snake: Snake): Food[] {
        const collided: Food[] = [];
        const nearbyFoods = this.getNearbyFoods(snake.position);

        for (const food of nearbyFoods) {
            if (food.isConsumed) continue;

            const distance = snake.position.distance(food.position);
            if (distance < snake.headRadius + food.radius) {
                collided.push(food);
            }
        }

        return collided;
    }

    /**
     * Check food collisions for any circular entity (e.g., bosses)
     */
    public checkCircleFoodCollisions(position: Vector2, radius: number): Food[] {
        const collided: Food[] = [];
        const nearbyFoods = this.getNearbyFoods(position);

        for (const food of nearbyFoods) {
            if (food.isConsumed) continue;
            const distance = position.distance(food.position);
            if (distance < radius + food.radius) {
                collided.push(food);
            }
        }

        return collided;
    }

    /**
     * Check snake-snake collisions
     * Returns the snake that was hit (if head hits body) or null
     */
    public checkSnakeCollisions(snake: Snake, allSnakes: Snake[], otherSegmentStep: number = 1): { victim: Snake; killer: Snake } | null {
        if (!snake.isAlive) return null;
        const step = Math.max(1, Math.floor(Number.isFinite(otherSegmentStep) ? otherSegmentStep : 1));

        const nearbySnakes = this.getNearbySnakes(snake.position);

        for (const other of nearbySnakes) {
            if (other.id === snake.id || !other.isAlive) continue;

            // Check if snake's head hits other's body
            for (let i = 1; i < other.segments.length; i += step) {
                const segment = other.segments[i];
                const distance = snake.position.distance(segment.position);

                if (distance < snake.headRadius + segment.radius) {
                    // Snake dies, other survives
                    return { victim: snake, killer: other };
                }
            }

            // Check head-on collision
            const headDistance = snake.position.distance(other.position);
            if (headDistance < snake.headRadius + other.headRadius) {
                // Smaller snake dies
                if (snake.mass < other.mass) {
                    return { victim: snake, killer: other };
                } else if (other.mass < snake.mass) {
                    return { victim: other, killer: snake };
                }
                // Equal size - both survive (push away)
            }
        }

        return null;
    }

    /**
     * Check if snake is out of bounds
     */
    public checkBoundaryCollision(snake: Snake): boolean {
        const margin = snake.headRadius;
        return (
            snake.position.x < margin ||
            snake.position.x > Config.WORLD_WIDTH - margin ||
            snake.position.y < margin ||
            snake.position.y > Config.WORLD_HEIGHT - margin
        );
    }
}
