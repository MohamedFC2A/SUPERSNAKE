import { Vector2, Random, MathUtils } from '../../utils/utils';
import { Snake } from '../entities/Snake';
import { Food } from '../entities/Food';
import { Config } from '../../config';

type BotState = 'wander' | 'hunt' | 'flee' | 'eat';

interface BotBrain {
    state: BotState;
    target: Vector2 | null;
    timeInStateMs: number;
    timeSinceDecisionMs: number;
    baseAggressiveness: number;
}

/**
 * AISystem - Bot snake intelligence
 */
export class AISystem {
    private brains: Map<string, BotBrain> = new Map();

    /**
     * Register a bot
     */
    public registerBot(snake: Snake): void {
        this.brains.set(snake.id, {
            state: 'wander',
            target: null,
            timeInStateMs: 0,
            timeSinceDecisionMs: 0,
            baseAggressiveness: Random.float(0.25, 0.7),
        });
    }

    /**
     * Remove a bot
     */
    public unregisterBot(snakeId: string): void {
        this.brains.delete(snakeId);
    }

    /**
     * Update bot behavior
     */
    public update(
        bot: Snake,
        nearbySnakes: Snake[],
        nearbyFoods: Food[],
        dt: number
    ): void {
        if (!bot.isAlive) return;

        const brain = this.brains.get(bot.id);
        if (!brain) return;

        brain.timeInStateMs += dt;
        brain.timeSinceDecisionMs += dt;

        const level = this.getBotLevel(bot);
        bot.aiLevel = level;

        // Evaluate situation and potentially change state
        const decisionIntervalMs = this.getDecisionIntervalMs(level);
        if (brain.timeSinceDecisionMs >= decisionIntervalMs) {
            this.evaluateState(bot, brain, nearbySnakes, nearbyFoods, level);
            brain.timeSinceDecisionMs = 0;
        }

        // Execute current behavior
        switch (brain.state) {
            case 'wander':
                this.wanderBehavior(bot, brain, level);
                break;
            case 'hunt':
                this.huntBehavior(bot, brain, nearbySnakes, level);
                break;
            case 'flee':
                this.fleeBehavior(bot, brain, nearbySnakes, level);
                break;
            case 'eat':
                this.eatBehavior(bot, brain, nearbyFoods, level);
                break;
        }

        // Smarter collision avoidance (especially at higher levels)
        if (level >= 2) {
            const smartLevel = level as 2 | 3;
            this.applyAdvancedSteering(bot, nearbySnakes, smartLevel);
        }

        // Avoid boundaries
        this.avoidBoundaries(bot);

        // If still unsafe, try a few candidate directions (failsafe)
        if (level >= 2) {
            const smartLevel = level as 2 | 3;
            if (!this.isPathSafe(bot, bot.targetDirection, this.getNearbyForPlanning(bot, nearbySnakes, smartLevel), smartLevel)) {
                const safer = this.chooseBestDirection(bot, bot.targetDirection, this.getNearbyForPlanning(bot, nearbySnakes, smartLevel), smartLevel);
                if (safer.magnitude() > 0) bot.setDirection(safer);
            }
        }
    }

    private evaluateState(
        bot: Snake,
        brain: BotBrain,
        allSnakes: Snake[],
        foods: Food[],
        level: 1 | 2 | 3
    ): void {
        const threatRadius = this.getThreatRadius(level);

        // Find nearby threats and prey
        const nearbySnakes = allSnakes.filter((s) => {
            if (s.id === bot.id || !s.isAlive) return false;
            return s.position.distance(bot.position) < threatRadius;
        });

        const threatFactor = level === 3 ? 1.05 : level === 2 ? 1.15 : 1.2;
        const preyFactor = level === 3 ? 0.9 : 0.8;
        const threats = nearbySnakes.filter(s => s.mass > bot.mass * threatFactor);
        const prey = nearbySnakes.filter(s => s.mass < bot.mass * preyFactor);
        const nearbyFood = foods.filter(f => !f.isConsumed && f.position.distance(bot.position) < 300);

        const aggressiveness = this.getAggressiveness(bot, brain, level);

        // Priority: Flee > Hunt (if aggressive) > Eat > Wander
        if (threats.length > 0) {
            const closestThreat = this.findClosest(bot.position, threats.map(t => t.position));
            if (closestThreat && bot.position.distance(closestThreat) < 200) {
                brain.state = 'flee';
                brain.target = closestThreat;
                brain.timeInStateMs = 0;
                return;
            }
        }

        if (prey.length > 0 && aggressiveness > 0.4 && bot.mass > 10) {
            const bestPrey = this.choosePrey(bot, prey, level);
            if (bestPrey) {
                brain.state = 'hunt';
                brain.target = bestPrey.position.clone();
                brain.timeInStateMs = 0;
                return;
            }
        }

        if (nearbyFood.length > 0) {
            brain.state = 'eat';
            brain.target = this.chooseFoodTarget(bot, nearbyFood, threats, level);
            brain.timeInStateMs = 0;
            return;
        }

        // Default to wandering
        if (brain.timeInStateMs > 1200 || brain.state !== 'wander') {
            brain.state = 'wander';
            brain.target = this.getRandomTarget(bot.position);
            brain.timeInStateMs = 0;
        }
    }

    private wanderBehavior(bot: Snake, brain: BotBrain, level: 1 | 2 | 3): void {
        const retargetMs = level === 3 ? 900 : level === 2 ? 1200 : 1600;
        if (!brain.target || bot.position.distance(brain.target) < 50 || brain.timeInStateMs > retargetMs) {
            brain.target = this.getRandomTarget(bot.position);
            brain.timeInStateMs = 0;
        }

        const direction = brain.target.subtract(bot.position).normalize();
        bot.setDirection(direction);
        bot.setBoost(false);
    }

    private huntBehavior(bot: Snake, brain: BotBrain, allSnakes: Snake[], level: 1 | 2 | 3): void {
        // Find the prey we're targeting
        const prey = this.resolvePrey(bot, allSnakes, brain.target);

        if (!prey) {
            brain.state = 'wander';
            return;
        }

        const direction = this.getHuntDirection(bot, prey, level);
        bot.setDirection(direction);

        // Boost if close enough
        const distance = bot.position.distance(prey.position);
        const boostThreshold = level === 3 ? 220 : level === 2 ? 170 : 130;
        // L3 boosts only if the path is safe (prevents suicide boosting)
        if (level === 3) {
            const nearby = this.getNearbyForPlanning(bot, allSnakes, 3);
            const safe = this.isPathSafe(bot, bot.targetDirection, nearby, 3);
            bot.setBoost(distance < boostThreshold && safe && bot.boostEnergy > 55);
        } else {
            bot.setBoost(distance < boostThreshold && bot.boostEnergy > (level === 2 ? 30 : 25));
        }
    }

    private fleeBehavior(bot: Snake, brain: BotBrain, allSnakes: Snake[], level: 1 | 2 | 3): void {
        if (!brain.target) {
            brain.state = 'wander';
            return;
        }

        // Flee in opposite direction
        const fleeDirection = bot.position.subtract(brain.target).normalize();

        // Add controlled randomness to avoid being predictable
        const randomAngle = Random.float(level === 3 ? -0.18 : -0.28, level === 3 ? 0.18 : 0.28);
        let rotatedDirection = fleeDirection.rotate(randomAngle);

        // Higher levels try to pick a direction that won't immediately kill them
        if (level >= 2) {
            const smartLevel = level as 2 | 3;
            const nearby = this.getNearbyForPlanning(bot, allSnakes, smartLevel);
            if (!this.isPathSafe(bot, rotatedDirection, nearby, smartLevel)) {
                const safer = this.chooseBestDirection(bot, rotatedDirection, nearby, smartLevel, fleeDirection);
                if (safer.magnitude() > 0) rotatedDirection = safer;
            }
        }

        bot.setDirection(rotatedDirection);

        // Boost when in danger
        const distance = bot.position.distance(brain.target);
        bot.setBoost(distance < (level === 3 ? 320 : 190) && bot.boostEnergy > (level === 3 ? 35 : 20));

        // Stop fleeing if threat is far enough
        if (distance > (level === 3 ? 420 : 320)) {
            brain.state = 'wander';
        }
    }

    private eatBehavior(bot: Snake, brain: BotBrain, foods: Food[], level: 1 | 2 | 3): void {
        if (!brain.target) {
            brain.state = 'wander';
            return;
        }

        // Find closest food
        const targetFood = foods.find(f =>
            !f.isConsumed &&
            f.position.distance(brain.target!) < 20
        );

        if (!targetFood) {
            // Food was eaten, find new target
            const nearbyFood = foods.filter(f => !f.isConsumed && f.position.distance(bot.position) < 300);
            if (nearbyFood.length > 0) {
                // Prefer better food at higher levels
                brain.target = this.chooseFoodTarget(bot, nearbyFood, [], level);
            } else {
                brain.state = 'wander';
            }
            return;
        }

        const direction = brain.target.subtract(bot.position).normalize();
        bot.setDirection(direction);
        bot.setBoost(level === 3 && bot.boostEnergy > 55 && bot.position.distance(targetFood.position) > 180);
    }

    private avoidBoundaries(bot: Snake): void {
        const margin = 150;
        const pos = bot.position;
        const avoidance = new Vector2();

        if (pos.x < margin) avoidance.x += (margin - pos.x) / margin;
        if (pos.x > Config.WORLD_WIDTH - margin) avoidance.x -= (pos.x - (Config.WORLD_WIDTH - margin)) / margin;
        if (pos.y < margin) avoidance.y += (margin - pos.y) / margin;
        if (pos.y > Config.WORLD_HEIGHT - margin) avoidance.y -= (pos.y - (Config.WORLD_HEIGHT - margin)) / margin;

        if (avoidance.magnitude() > 0) {
            const currentDir = bot.direction;
            const blended = currentDir.add(avoidance.multiply(2)).normalize();
            bot.setDirection(blended);
        }
    }

    private findClosest(from: Vector2, targets: (Vector2 | null)[]): Vector2 | null {
        let closest: Vector2 | null = null;
        let minDist = Infinity;

        for (const target of targets) {
            if (!target) continue;
            const dist = from.distance(target);
            if (dist < minDist) {
                minDist = dist;
                closest = target;
            }
        }

        return closest;
    }

    private getRandomTarget(from: Vector2): Vector2 {
        const angle = Random.float(0, Math.PI * 2);
        const distance = Random.float(200, 500);

        let target = from.add(new Vector2(
            Math.cos(angle) * distance,
            Math.sin(angle) * distance
        ));

        // Clamp to world bounds
        target.x = MathUtils.clamp(target.x, 100, Config.WORLD_WIDTH - 100);
        target.y = MathUtils.clamp(target.y, 100, Config.WORLD_HEIGHT - 100);

        return target;
    }

    // ===== Intelligence helpers =====

    private getBotLevel(bot: Snake): 1 | 2 | 3 {
        if (bot.score >= Config.BOT_AI_LEVEL3_SCORE) return 3;
        if (bot.score >= Config.BOT_AI_LEVEL2_SCORE) return 2;
        return 1;
    }

    private getThreatRadius(level: 1 | 2 | 3): number {
        if (level === 3) return Config.BOT_AI_THREAT_RADIUS_L3;
        if (level === 2) return Config.BOT_AI_THREAT_RADIUS_L2;
        return Config.BOT_AI_THREAT_RADIUS_L1;
    }

    private getDecisionIntervalMs(level: 1 | 2 | 3): number {
        if (level === 3) return Config.BOT_AI_DECISION_MS_L3;
        if (level === 2) return Config.BOT_AI_DECISION_MS_L2;
        return Config.BOT_AI_DECISION_MS_L1;
    }

    private getAggressiveness(bot: Snake, brain: BotBrain, level: 1 | 2 | 3): number {
        // Bigger snakes tend to be more dangerous; higher level boosts this tendency.
        const sizeFactor = MathUtils.clamp(bot.mass / 25, 0, 1);
        const levelBoost = level === 3 ? 0.35 : level === 2 ? 0.18 : 0;
        return MathUtils.clamp(brain.baseAggressiveness + sizeFactor * 0.25 + levelBoost, 0, 1);
    }

    private choosePrey(bot: Snake, prey: Snake[], level: 1 | 2 | 3): Snake | null {
        // Prefer: closest prey, but with a bias for much smaller prey at higher levels.
        let best: Snake | null = null;
        let bestScore = -Infinity;

        for (const p of prey) {
            const dist = bot.position.distance(p.position);
            const distScore = -dist;
            const sizeAdvantage = MathUtils.clamp((bot.mass - p.mass) / Math.max(1, bot.mass), 0, 1);
            const weight = level === 3 ? 220 : level === 2 ? 140 : 80;
            const score = distScore + sizeAdvantage * weight;
            if (score > bestScore) {
                bestScore = score;
                best = p;
            }
        }

        return best;
    }

    private chooseFoodTarget(bot: Snake, foods: Food[], threats: Snake[], level: 1 | 2 | 3): Vector2 | null {
        // Prefer higher value food, but avoid heading straight into threats (L2+).
        let best: Food | null = null;
        let bestScore = -Infinity;

        for (const f of foods) {
            const dist = bot.position.distance(f.position);
            const value = f.value || 1;
            let score = value * 35 - dist;

            if (level >= 2 && threats.length > 0) {
                const nearestThreatDist = this.nearestDistance(f.position, threats.map(t => t.position));
                if (nearestThreatDist < 180) {
                    score -= 250;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                best = f;
            }
        }

        return best ? best.position.clone() : null;
    }

    private resolvePrey(bot: Snake, allSnakes: Snake[], target: Vector2 | null): Snake | null {
        // Resolve a prey by being near the last known target point.
        if (!target) return null;
        let best: Snake | null = null;
        let bestDist = Infinity;

        for (const s of allSnakes) {
            if (!s.isAlive || s.id === bot.id) continue;
            if (s.mass >= bot.mass * 0.8) continue;
            const d = s.position.distance(target);
            if (d < 120 && d < bestDist) {
                bestDist = d;
                best = s;
            }
        }

        return best;
    }

    private getHuntDirection(bot: Snake, prey: Snake, level: 1 | 2 | 3): Vector2 {
        // Predict prey and try to cut it off at higher levels.
        const dist = bot.position.distance(prey.position);
        const botSpeed = Math.max(80, bot.speed);
        const interceptTime = MathUtils.clamp(dist / botSpeed, 0.3, level === 3 ? 1.2 : 0.9);

        const predicted = prey.position.add(prey.velocity.multiply(interceptTime * 60));

        // Level 3 tries to approach from the side to force mistakes, and aims ahead more aggressively.
        if (level === 3) {
            const toPrey = predicted.subtract(bot.position).normalize();
            const perp = new Vector2(-toPrey.y, toPrey.x);
            const side = Math.sign(bot.direction.x * perp.x + bot.direction.y * perp.y) || 1;
            const cut = predicted
                .add(perp.multiply(120 * side))
                .add(toPrey.multiply(90));
            return cut.subtract(bot.position).normalize();
        }

        return predicted.subtract(bot.position).normalize();
    }

    // ===== Collision avoidance =====

    private applyAdvancedSteering(bot: Snake, allSnakes: Snake[], level: 2 | 3): void {
        const nearby = this.getNearbyForPlanning(bot, allSnakes, level);

        const desired = bot.targetDirection.magnitude() > 0 ? bot.targetDirection.normalize() : bot.direction;
        const avoidance = this.computeAvoidance(bot, nearby, level);
        const blendWeight = level === 3 ? 1.4 : 1.0;
        const blended = avoidance.magnitude() > 0 ? desired.add(avoidance.multiply(blendWeight)).normalize() : desired;

        // Level 3 constantly plans the best safe direction (near-unbeatable).
        // Level 2 plans only when needed.
        if (level === 3) {
            const best = this.chooseBestDirection(bot, blended, nearby, 3);
            if (best.magnitude() > 0) bot.setDirection(best);
            return;
        }

        if (!this.isPathSafe(bot, blended, nearby, 2)) {
            const best = this.chooseBestDirection(bot, blended, nearby, 2);
            if (best.magnitude() > 0) bot.setDirection(best);
            return;
        }

        bot.setDirection(blended);
    }

    private getNearbyForPlanning(bot: Snake, allSnakes: Snake[], level: 2 | 3): Snake[] {
        const lookahead = level === 3 ? Config.BOT_AI_LOOKAHEAD_L3 : Config.BOT_AI_LOOKAHEAD_L2;
        const radius = lookahead * 1.6 + 380;

        const nearby: Snake[] = [];
        for (const s of allSnakes) {
            if (!s.isAlive || s.id === bot.id) continue;
            if (s.position.distance(bot.position) < radius) nearby.push(s);
        }
        return nearby;
    }

    private computeAvoidance(bot: Snake, allSnakes: Snake[], level: 2 | 3): Vector2 {
        const lookahead = level === 3 ? Config.BOT_AI_LOOKAHEAD_L3 : Config.BOT_AI_LOOKAHEAD_L2;
        const buffer = level === 3 ? Config.BOT_AI_SAFETY_BUFFER_L3 : Config.BOT_AI_SAFETY_BUFFER_L2;

        const forward = bot.targetDirection.magnitude() > 0 ? bot.targetDirection.normalize() : bot.direction;
        const probe = bot.position.add(forward.multiply(lookahead));

        // Repel from nearby segments around the probe point.
        const nearby = allSnakes.filter(s => s.isAlive && s.id !== bot.id && s.position.distance(probe) < 520);
        const repel = new Vector2();

        for (const s of nearby) {
            const step = level === 3 ? 4 : 6;
            for (let i = 0; i < s.segments.length; i += step) {
                const seg = s.segments[i];
                const dx = probe.x - seg.position.x;
                const dy = probe.y - seg.position.y;
                const distSq = dx * dx + dy * dy;
                const min = (bot.headRadius + seg.radius + buffer);
                const minSq = min * min;
                if (distSq < minSq && distSq > 0.0001) {
                    const dist = Math.sqrt(distSq);
                    const strength = (min - dist) / min;
                    repel.x += (dx / dist) * strength;
                    repel.y += (dy / dist) * strength;
                }
            }
        }

        return repel.magnitude() > 0 ? repel.normalize() : repel;
    }

    private isPathSafe(bot: Snake, dir: Vector2, allSnakes: Snake[], level: 2 | 3): boolean {
        const lookahead = level === 3 ? Config.BOT_AI_LOOKAHEAD_L3 : Config.BOT_AI_LOOKAHEAD_L2;
        const buffer = level === 3 ? Config.BOT_AI_SAFETY_BUFFER_L3 : Config.BOT_AI_SAFETY_BUFFER_L2;

        const d = dir.magnitude() > 0 ? dir.normalize() : bot.direction;
        const probes = level === 3 ? [0.35, 0.7, 1.0, 1.35] : [0.5, 1.0, 1.25];
        const segmentStep = level === 3 ? 4 : 6;

        for (const f of probes) {
            const probe = bot.position.add(d.multiply(lookahead * f));

            // Boundary safety
            const margin = bot.headRadius + 55;
            if (probe.x < margin || probe.x > Config.WORLD_WIDTH - margin || probe.y < margin || probe.y > Config.WORLD_HEIGHT - margin) {
                return false;
            }

            // Segment safety (sampled)
            for (const s of allSnakes) {
                if (!s.isAlive || s.id === bot.id) continue;

                // Head-to-head prediction (slightly future)
                const predictedHead = s.position.add(s.velocity.multiply(0.35 * f));
                if (probe.distance(predictedHead) < bot.headRadius + s.headRadius + buffer) return false;

                for (let i = 1; i < s.segments.length; i += segmentStep) {
                    const seg = s.segments[i];
                    if (probe.distance(seg.position) < bot.headRadius + seg.radius + buffer) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    private chooseBestDirection(
        bot: Snake,
        desired: Vector2,
        nearbySnakes: Snake[],
        level: 2 | 3,
        preferredFallback?: Vector2
    ): Vector2 {
        const base = (desired.magnitude() > 0 ? desired : (preferredFallback ?? bot.direction)).normalize();
        const angles = level === 3
            ? [0, 0.22, -0.22, 0.45, -0.45, 0.7, -0.7, 0.95, -0.95, 1.2, -1.2, 1.45, -1.45]
            : [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95];

        let bestDir: Vector2 | null = null;
        let bestScore = Infinity;

        for (const a of angles) {
            const cand = base.rotate(a).normalize();
            const score = this.scoreDirection(bot, cand, base, nearbySnakes, level);
            if (score < bestScore) {
                bestScore = score;
                bestDir = cand;
            }
        }

        if (bestDir) return bestDir;

        // If everything looks terrible, at least try to go away from the closest snake.
        let closest: Snake | null = null;
        let closestDist = Infinity;
        for (const s of nearbySnakes) {
            const d = s.position.distance(bot.position);
            if (d < closestDist) {
                closestDist = d;
                closest = s;
            }
        }

        if (closest) {
            return bot.position.subtract(closest.position).normalize();
        }

        return Vector2.zero();
    }

    private scoreDirection(
        bot: Snake,
        cand: Vector2,
        desired: Vector2,
        nearbySnakes: Snake[],
        level: 2 | 3
    ): number {
        const lookahead = level === 3 ? Config.BOT_AI_LOOKAHEAD_L3 : Config.BOT_AI_LOOKAHEAD_L2;
        const buffer = level === 3 ? Config.BOT_AI_SAFETY_BUFFER_L3 : Config.BOT_AI_SAFETY_BUFFER_L2;
        const probes = level === 3 ? [0.25, 0.55, 0.85, 1.15] : [0.4, 0.8, 1.1];
        const segmentStep = level === 3 ? 4 : 6;

        // Alignment bonus (lower score is better)
        let score = (1 - cand.dot(desired)) * (level === 3 ? 14 : 9);

        for (const f of probes) {
            const probe = bot.position.add(cand.multiply(lookahead * f));
            const margin = bot.headRadius + 55;
            if (probe.x < margin || probe.x > Config.WORLD_WIDTH - margin || probe.y < margin || probe.y > Config.WORLD_HEIGHT - margin) {
                return 10_000;
            }

            // Penalize closeness to any body/head near probe
            for (const s of nearbySnakes) {
                // Predict heads slightly
                const predictedHead = s.position.add(s.velocity.multiply(0.35 * f));
                const headDist = probe.distance(predictedHead);
                const headMin = bot.headRadius + s.headRadius + buffer;
                if (headDist < headMin) {
                    score += (headMin - headDist) * (level === 3 ? 6 : 4) * (1 / f);
                }

                for (let i = 1; i < s.segments.length; i += segmentStep) {
                    const seg = s.segments[i];
                    const dist = probe.distance(seg.position);
                    const min = bot.headRadius + seg.radius + buffer;
                    if (dist < min) {
                        score += (min - dist) * (level === 3 ? 4 : 2.5) * (1 / f);
                    }
                }
            }
        }

        return score;
    }

    private nearestDistance(from: Vector2, targets: Vector2[]): number {
        let best = Infinity;
        for (const t of targets) {
            const d = from.distance(t);
            if (d < best) best = d;
        }
        return best;
    }
}
