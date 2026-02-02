import { Vector2 } from '../../utils/utils';
import { Config } from '../../config';
import { Snake, SnakeSegment } from './Snake';

export class Boss {
    public position: Vector2;
    public velocity: Vector2 = new Vector2();
    public direction: Vector2 = new Vector2(1, 0);

    public headRadius: number = Config.BOSS_HEAD_RADIUS;
    public segmentRadius: number = Config.BOSS_SEGMENT_RADIUS;
    public speed: number = Config.BOSS_SPEED;
    public isAlive: boolean = true;
    public lifetime: number = Config.BOSS_LIFETIME_SECONDS;

    // Appearance
    public color: string = Config.COLORS.BOSS_RED;
    public eyeColor: string = Config.COLORS.BOSS_EYE;

    // Body (snake-like)
    public segments: SnakeSegment[] = [];
    private positionHistory: Vector2[] = [];
    private targetId: string | null = null;
    private retargetMs: number = 0;

    constructor(position: Vector2) {
        this.position = position.clone();
        this.initializeBody();
    }

    public update(dt: number, snakes: Snake[]): void {
        if (!this.isAlive) return;

        const dtSec = dt / 1000;
        this.lifetime -= dtSec;

        if (this.lifetime <= 0) {
            this.die();
            return;
        }

        this.retargetMs -= dt;
        const target = this.getTargetSnake(snakes);
        if (target) {
            const desired = this.getPredictedTargetPosition(target);
            const targetDir = desired.subtract(this.position).normalize();

            const currentAngle = Math.atan2(this.direction.y, this.direction.x);
            const targetAngle = Math.atan2(targetDir.y, targetDir.x);
            let angleDiff = targetAngle - currentAngle;

            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            const turnRate = Config.BOSS_TURN_RATE * dtSec;
            if (Math.abs(angleDiff) > turnRate) {
                angleDiff = Math.sign(angleDiff) * turnRate;
            }

            const newAngle = currentAngle + angleDiff;
            this.direction = Vector2.fromAngle(newAngle);
        }

        // Move head
        this.velocity = this.direction.multiply(this.speed * dtSec);
        this.position = this.position.add(this.velocity);

        // Keep within world bounds
        this.position.x = Math.max(this.headRadius, Math.min(Config.WORLD_WIDTH - this.headRadius, this.position.x));
        this.position.y = Math.max(this.headRadius, Math.min(Config.WORLD_HEIGHT - this.headRadius, this.position.y));

        // Update body follow
        this.positionHistory.unshift(this.position.clone());

        for (let i = 0; i < this.segments.length; i++) {
            const historyIndex = Math.min(i * 3 + 2, this.positionHistory.length - 1);
            this.segments[i].position = this.positionHistory[historyIndex];
        }

        const maxHistory = this.segments.length * 3 + 10;
        if (this.positionHistory.length > maxHistory) {
            this.positionHistory.length = maxHistory;
        }
    }

    public die(): void {
        this.isAlive = false;
    }

    public getBoundsRadius(): number {
        return this.headRadius + (this.segments.length - 1) * Config.BOSS_SEGMENT_SPACING;
    }

    public render(ctx: CanvasRenderingContext2D): void {
        if (!this.isAlive) return;

        // Body (tail -> neck). Head is drawn separately for a stronger silhouette.
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';

        for (let i = this.segments.length - 1; i >= 1; i--) {
            const segment = this.segments[i];
            const ratio = i / this.segments.length;

            // Subtle striping + depth (darker tail)
            const stripe = (i % 7 === 0) ? -18 : 0;
            const base = 125 - Math.floor(70 * ratio) + stripe;
            const greenBlue = Math.max(18, Math.min(140, base));
            ctx.fillStyle = `rgb(210, ${greenBlue}, ${greenBlue})`;

            // Slight body shadow for depth
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(segment.position.x, segment.position.y, segment.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Tiny highlight "scale" (cheap)
            if (i % 4 === 0) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.beginPath();
                ctx.arc(segment.position.x - segment.radius * 0.25, segment.position.y - segment.radius * 0.25, Math.max(1, segment.radius * 0.35), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Spikes/ridges near head for a scarier profile (limited count for performance)
        this.drawRidge(ctx);

        // Head
        this.drawHead(ctx);

        ctx.restore();
    }

    private initializeBody(): void {
        this.segments = [];
        this.positionHistory = [];

        for (let i = 0; i < Config.BOSS_LENGTH; i++) {
            const segPos = new Vector2(
                this.position.x - i * Config.BOSS_SEGMENT_SPACING,
                this.position.y
            );

            const taper = 1 - (i / Config.BOSS_LENGTH) * 0.35;
            const radius = (i === 0 ? this.headRadius : this.segmentRadius) * taper;

            this.segments.push({ position: segPos, radius });

            for (let j = 0; j < 3; j++) {
                this.positionHistory.push(segPos.clone());
            }
        }
    }

    private getNearestSnake(snakes: Snake[]): Snake | null {
        let nearest: Snake | null = null;
        let bestDistSq = Infinity;

        for (const snake of snakes) {
            if (!snake.isAlive) continue;
            const dx = snake.position.x - this.position.x;
            const dy = snake.position.y - this.position.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                nearest = snake;
            }
        }

        return nearest;
    }

    private getTargetSnake(snakes: Snake[]): Snake | null {
        // Keep a target for a short time to avoid jittery retargeting, but still switch if a much closer snake appears.
        const current = this.targetId ? snakes.find(s => s.isAlive && s.id === this.targetId) ?? null : null;
        const nearest = this.getNearestSnake(snakes);

        if (!nearest) {
            this.targetId = null;
            return null;
        }

        if (!current) {
            this.targetId = nearest.id;
            this.retargetMs = 650;
            return nearest;
        }

        if (this.retargetMs <= 0) {
            this.targetId = nearest.id;
            this.retargetMs = 650;
            return nearest;
        }

        // Switch early only if the nearest is significantly closer than current.
        const currentDist = current.position.distance(this.position);
        const nearestDist = nearest.position.distance(this.position);
        if (nearest.id !== current.id && nearestDist < currentDist * 0.7) {
            this.targetId = nearest.id;
            this.retargetMs = 650;
            return nearest;
        }

        return current;
    }

    private getPredictedTargetPosition(target: Snake): Vector2 {
        // Predict target position so the boss feels "smart" even while slow.
        const dist = target.position.distance(this.position);
        const leadSeconds = Math.min(1.4, Math.max(0.25, dist / Math.max(1, this.speed)));

        // target.velocity is per-update velocity; scale with ~60fps equivalence.
        const predicted = target.position.add(target.velocity.multiply(leadSeconds * 60));

        // Cut-off bias (small sideways offset) to feel more threatening.
        const toTarget = predicted.subtract(this.position).normalize();
        const perp = new Vector2(-toTarget.y, toTarget.x);
        const side = Math.sign(this.direction.x * perp.x + this.direction.y * perp.y) || 1;
        const offset = perp.multiply(this.headRadius * 0.9 * side);

        return predicted.add(offset);
    }

    private drawEye(ctx: CanvasRenderingContext2D): void {
        const head = this.segments[0]?.position ?? this.position;
        const angle = Math.atan2(this.direction.y, this.direction.x);

        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);

        const eyeOffset = this.headRadius * 0.62;
        const eyeRadius = this.headRadius * 0.26;

        // Sclera (bloodshot)
        ctx.fillStyle = '#ffe0e0';
        ctx.beginPath();
        ctx.arc(eyeOffset, 0, eyeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Iris glow (more menacing)
        const pulse = 0.22 + 0.14 * Math.sin(performance.now() / 120);
        ctx.fillStyle = '#ff3b00';
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.arc(eyeOffset, 0, eyeRadius * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Pupil (slit)
        ctx.fillStyle = '#020202';
        ctx.beginPath();
        ctx.ellipse(eyeOffset + eyeRadius * 0.12, 0, eyeRadius * 0.14, eyeRadius * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();

        // Small highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.beginPath();
        ctx.arc(eyeOffset - eyeRadius * 0.15, -eyeRadius * 0.25, eyeRadius * 0.18, 0, Math.PI * 2);
        ctx.fill();

        // Veins (tiny, cheap)
        ctx.strokeStyle = 'rgba(170, 0, 0, 0.25)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(eyeOffset - eyeRadius * 0.4, (i - 1) * eyeRadius * 0.25);
            ctx.lineTo(eyeOffset - eyeRadius * 0.05, (i - 1) * eyeRadius * 0.35);
            ctx.stroke();
        }

        ctx.restore();
    }

    private drawMouth(ctx: CanvasRenderingContext2D): void {
        const head = this.segments[0]?.position ?? this.position;
        const angle = Math.atan2(this.direction.y, this.direction.x);

        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);

        const mouthOffset = this.headRadius * 0.7;
        const mouthWidth = this.headRadius * 1.0;
        const mouthHeightBase = this.headRadius * 0.34;
        const chomp = 0.78 + 0.22 * Math.sin(performance.now() / 110);
        const mouthHeight = mouthHeightBase * chomp;

        // Dark mouth cavity
        ctx.fillStyle = 'rgba(10, 0, 0, 0.85)';
        ctx.beginPath();
        ctx.ellipse(mouthOffset, 0, mouthWidth * 0.45, mouthHeight * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Teeth (simple triangles)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        const toothCount = 9;
        for (let i = 0; i < toothCount; i++) {
            const t = (i / (toothCount - 1) - 0.5) * mouthHeight * 1.4;
            const x = mouthOffset + mouthWidth * 0.15;
            const y = t;
            const tooth = this.headRadius * 0.08;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + tooth, y - tooth * 0.8);
            ctx.lineTo(x + tooth, y + tooth * 0.8);
            ctx.closePath();
            ctx.fill();
        }

        // Tongue flick (subtle)
        const tongue = 0.25 + 0.75 * Math.max(0, Math.sin(performance.now() / 180));
        ctx.strokeStyle = 'rgba(180, 0, 0, 0.65)';
        ctx.lineWidth = Math.max(2, this.headRadius * 0.045);
        ctx.beginPath();
        ctx.moveTo(mouthOffset + mouthWidth * 0.05, 0);
        ctx.lineTo(mouthOffset + mouthWidth * (0.3 + 0.18 * tongue), 0);
        ctx.stroke();

        ctx.restore();
    }

    private drawHead(ctx: CanvasRenderingContext2D): void {
        const head = this.segments[0]?.position ?? this.position;
        const angle = Math.atan2(this.direction.y, this.direction.x);

        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(angle);

        // Head base (ellipse) for a stronger snake silhouette
        const rx = this.headRadius * 1.25;
        const ry = this.headRadius * 0.95;

        const grad = ctx.createRadialGradient(rx * 0.35, -ry * 0.25, this.headRadius * 0.25, 0, 0, rx * 1.2);
        grad.addColorStop(0, 'rgba(255, 90, 90, 1)');
        grad.addColorStop(0.6, 'rgba(180, 0, 0, 1)');
        grad.addColorStop(1, 'rgba(60, 0, 0, 1)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        // Jaw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        ctx.ellipse(rx * 0.2, ry * 0.25, rx * 0.7, ry * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        // Outline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Horns
        ctx.fillStyle = 'rgba(20, 0, 0, 0.85)';
        const horn = this.headRadius * 0.35;
        const hornY = -ry * 0.75;
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(-rx * 0.12, hornY + s * ry * 0.18);
            ctx.lineTo(-rx * 0.12 - horn, hornY + s * ry * 0.18 - horn * 0.35);
            ctx.lineTo(-rx * 0.12 - horn * 0.15, hornY + s * ry * 0.18 + horn * 0.35);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // Eye + mouth drawn in world space with their own transforms
        this.drawEye(ctx);
        this.drawMouth(ctx);
    }

    private drawRidge(ctx: CanvasRenderingContext2D): void {
        const segs = this.segments;
        if (segs.length < 6) return;

        ctx.save();
        ctx.fillStyle = 'rgba(30, 0, 0, 0.75)';

        const max = Math.min(22, segs.length - 2);
        for (let i = 2; i < max; i += 3) {
            const a = segs[i - 1].position;
            const b = segs[i].position;
            const dir = a.subtract(b).normalize();
            const perp = new Vector2(-dir.y, dir.x);

            const base = b.add(perp.multiply(segs[i].radius * 0.55));
            const tip = b.add(perp.multiply(segs[i].radius * 1.2)).add(dir.multiply(segs[i].radius * 0.35));
            const base2 = b.add(perp.multiply(segs[i].radius * 0.15));

            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(tip.x, tip.y);
            ctx.lineTo(base2.x, base2.y);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }
}
