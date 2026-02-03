import type { RenderOptions } from './RenderOptions';

/**
 * Draw a big, readable gold crown (world-space).
 *
 * baseX/baseY define the bottom center of the crown.
 * size controls overall scale (recommended: ~headRadius).
 */
export function drawCrown(
    ctx: CanvasRenderingContext2D,
    baseX: number,
    baseY: number,
    size: number,
    options?: RenderOptions
): void {
    const q = options?.quality ?? 'high';
    const detailed = q === 'ultra' || q === 'super_ultra';

    const reducedMotion = (() => {
        try {
            return document.documentElement.classList.contains('reduced-motion');
        } catch {
            return false;
        }
    })();

    const pulse = !reducedMotion && detailed ? (0.94 + 0.06 * Math.sin(performance.now() / 240)) : 1;
    const w = Math.max(18, size * 2.4) * pulse;
    const h = Math.max(14, size * 1.55) * pulse;

    ctx.save();
    ctx.translate(baseX, baseY);

    // Soft gold glow (kept small for performance).
    ctx.shadowBlur = detailed ? Math.max(10, size * 0.6) : 0;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.22)';

    // Crown path (simple 3-spike silhouette).
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.lineTo(-w * 0.38, -h * 0.72);
    ctx.lineTo(-w * 0.20, -h * 0.45);
    ctx.lineTo(0, -h * 1.05);
    ctx.lineTo(w * 0.20, -h * 0.45);
    ctx.lineTo(w * 0.38, -h * 0.72);
    ctx.lineTo(w * 0.5, 0);
    ctx.closePath();

    // Fill
    if (detailed) {
        const g = ctx.createLinearGradient(-w * 0.5, -h, w * 0.5, 0);
        g.addColorStop(0, '#FFF3B0');
        g.addColorStop(0.25, '#FDE047');
        g.addColorStop(0.55, '#EAB308');
        g.addColorStop(0.85, '#A16207');
        g.addColorStop(1, '#FDE68A');
        ctx.fillStyle = g;
    } else {
        ctx.fillStyle = '#EAB308';
    }
    ctx.fill();

    // Outline highlight
    ctx.shadowBlur = 0;
    ctx.strokeStyle = detailed ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.stroke();

    // Gems / sparkle dots (cheap, but makes it feel "premium").
    if (detailed) {
        const gemR = Math.max(2.2, size * 0.18);
        const gems: Array<[number, number, string]> = [
            [-w * 0.28, -h * 0.26, 'rgba(56, 189, 248, 0.9)'],
            [0, -h * 0.16, 'rgba(244, 63, 94, 0.9)'],
            [w * 0.28, -h * 0.26, 'rgba(34, 197, 94, 0.9)'],
        ];
        for (const [gx, gy, c] of gems) {
            ctx.beginPath();
            ctx.fillStyle = c;
            ctx.arc(gx, gy, gemR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.arc(gx - gemR * 0.25, gy - gemR * 0.25, gemR * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}

