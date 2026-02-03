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
    private grid: Map<string, GridCell> = new Map();
    private cellSize: number = Config.GRID_CELL_SIZE;

    /**
     * Get cell key from position
     */
    private getCellKey(x: number, y: number): string {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return `${cellX},${cellY}`;
    }

    /**
     * Get or create a cell
     */
    private getCell(key: string): GridCell {
        if (!this.grid.has(key)) {
            this.grid.set(key, { snakes: [], foods: [] });
        }
        return this.grid.get(key)!;
    }

    /**
     * Clear the grid
     */
    public clear(): void {
        this.grid.clear();
    }

    /**
     * Register a snake in the grid
     */
    public registerSnake(snake: Snake, segmentStep: number = 1): void {
        if (!snake.isAlive) return;
        const step = Math.max(1, Math.floor(Number.isFinite(segmentStep) ? segmentStep : 1));

        // Register head
        const headKey = this.getCellKey(snake.position.x, snake.position.y);
        this.getCell(headKey).snakes.push(snake);

        // Register body segments in relevant cells
        const registeredCells = new Set<string>([headKey]);
        for (let i = 0; i < snake.segments.length; i += step) {
            const segment = snake.segments[i];
            const key = this.getCellKey(segment.position.x, segment.position.y);
            if (!registeredCells.has(key)) {
                this.getCell(key).snakes.push(snake);
                registeredCells.add(key);
            }
        }
    }

    /**
     * Register food in the grid
     */
    public registerFood(food: Food): void {
        if (food.isConsumed) return;

        const key = this.getCellKey(food.position.x, food.position.y);
        this.getCell(key).foods.push(food);
    }

    /**
     * Get nearby snakes from adjacent cells
     */
    public getNearbySnakes(position: Vector2): Snake[] {
        const snakes: Set<Snake> = new Set();
        const cellX = Math.floor(position.x / this.cellSize);
        const cellY = Math.floor(position.y / this.cellSize);

        // Check 3x3 grid of cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = `${cellX + dx},${cellY + dy}`;
                const cell = this.grid.get(key);
                if (cell) {
                    cell.snakes.forEach(snake => snakes.add(snake));
                }
            }
        }

        return Array.from(snakes);
    }

    /**
     * Get nearby foods from adjacent cells
     */
    public getNearbyFoods(position: Vector2): Food[] {
        const foods: Food[] = [];
        const cellX = Math.floor(position.x / this.cellSize);
        const cellY = Math.floor(position.y / this.cellSize);

        // Check 3x3 grid of cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = `${cellX + dx},${cellY + dy}`;
                const cell = this.grid.get(key);
                if (cell) {
                    foods.push(...cell.foods);
                }
            }
        }

        return foods;
    }

    /**
     * Get foods inside an axis-aligned bounding box (world coordinates).
     * Used for render culling to avoid iterating every food each frame.
     */
    public getFoodsInAABB(minX: number, minY: number, maxX: number, maxY: number): Food[] {
        const foods: Food[] = [];

        const cellMinX = Math.floor(minX / this.cellSize);
        const cellMaxX = Math.floor(maxX / this.cellSize);
        const cellMinY = Math.floor(minY / this.cellSize);
        const cellMaxY = Math.floor(maxY / this.cellSize);

        for (let cx = cellMinX; cx <= cellMaxX; cx++) {
            for (let cy = cellMinY; cy <= cellMaxY; cy++) {
                const key = `${cx},${cy}`;
                const cell = this.grid.get(key);
                if (!cell) continue;
                for (const f of cell.foods) {
                    if (!f.isConsumed) foods.push(f);
                }
            }
        }

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
