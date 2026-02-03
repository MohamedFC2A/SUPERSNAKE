import type { RenderOptions } from './RenderOptions';

/**
 * Draw a big, readable yellow crown (world-space).
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

    const pulse = !reducedMotion && detailed ? (0.95 + 0.05 * Math.sin(performance.now() / 260)) : 1;
    const w = Math.max(22, size * 2.65) * pulse;
    const h = Math.max(16, size * 1.75) * pulse;

    ctx.save();
    ctx.translate(baseX, baseY);

    // Soft yellow glow (kept small for performance).
    ctx.shadowBlur = detailed ? Math.max(12, size * 0.72) : Math.max(6, size * 0.45);
    ctx.shadowColor = detailed ? 'rgba(255, 230, 120, 0.28)' : 'rgba(255, 230, 120, 0.16)';

    const fill = (() => {
        if (!detailed) return '#FFD400'; // pure yellow
        const g = ctx.createLinearGradient(-w * 0.55, -h * 1.05, w * 0.55, h * 0.1);
        // Keep it strictly yellow tones (no brown).
        g.addColorStop(0, '#FFF7B3');
        g.addColorStop(0.25, '#FFE066');
        g.addColorStop(0.55, '#FFD400');
        g.addColorStop(0.8, '#FFEA80');
        g.addColorStop(1, '#FFF7B3');
        return g;
    })();

    // Base band (rounded)
    const bandH = h * 0.34;
    const bandW = w * 0.92;
    const bandY = -bandH * 0.05;
    const r = Math.max(6, size * 0.35);

    ctx.fillStyle = fill as any;
    ctx.beginPath();
    ctx.moveTo(-bandW * 0.5 + r, bandY);
    ctx.arcTo(bandW * 0.5, bandY, bandW * 0.5, bandY + bandH, r);
    ctx.arcTo(bandW * 0.5, bandY + bandH, -bandW * 0.5, bandY + bandH, r);
    ctx.arcTo(-bandW * 0.5, bandY + bandH, -bandW * 0.5, bandY, r);
    ctx.arcTo(-bandW * 0.5, bandY, bandW * 0.5, bandY, r);
    ctx.closePath();
    ctx.fill();

    // Crown spikes (5 peaks) on top of the band.
    ctx.beginPath();
    ctx.moveTo(-bandW * 0.52, bandY);
    const peaks = [
        [-w * 0.40, -h * 0.78],
        [-w * 0.20, -h * 0.52],
        [0, -h * 1.08],
        [w * 0.20, -h * 0.52],
        [w * 0.40, -h * 0.78],
    ] as const;
    const teeth = [
        [-w * 0.30, -h * 0.20],
        [-w * 0.10, -h * 0.16],
        [w * 0.10, -h * 0.16],
        [w * 0.30, -h * 0.20],
    ] as const;
    // Alternating: peak -> valley -> peak...
    for (let i = 0; i < peaks.length; i++) {
        const [px, py] = peaks[i];
        ctx.lineTo(px, py);
        if (i < teeth.length) {
            const [tx, ty] = teeth[i];
            ctx.lineTo(tx, ty);
        }
    }
    ctx.lineTo(bandW * 0.52, bandY);
    ctx.closePath();
    ctx.fillStyle = fill as any;
    ctx.fill();

    // Outline highlight
    ctx.shadowBlur = 0;
    ctx.strokeStyle = detailed ? 'rgba(255, 255, 255, 0.62)' : 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = Math.max(2, size * 0.13);
    ctx.stroke();

    // Pearls / sparkle dots (pure yellow/white only).
    if (detailed) {
        const pearlR = Math.max(2.2, size * 0.16);
        const pearls: Array<[number, number]> = [
            [-bandW * 0.32, bandY + bandH * 0.52],
            [0, bandY + bandH * 0.52],
            [bandW * 0.32, bandY + bandH * 0.52],
        ];
        for (const [gx, gy] of pearls) {
            ctx.beginPath();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
            ctx.arc(gx, gy, pearlR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.arc(gx - pearlR * 0.25, gy - pearlR * 0.25, pearlR * 0.38, 0, Math.PI * 2);
            ctx.fill();
        }

        // Shine streak across the band (subtle, feels glossy)
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = Math.max(2, size * 0.10);
        ctx.beginPath();
        ctx.moveTo(-bandW * 0.38, bandY + bandH * 0.28);
        ctx.quadraticCurveTo(0, bandY + bandH * 0.05, bandW * 0.38, bandY + bandH * 0.28);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}
