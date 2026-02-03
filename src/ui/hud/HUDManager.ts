/**
 * HUD Manager - Orchestrates all in-game HUD components
 * Enhanced with in-game FPS display and performance metrics
 */

import { t, onLocaleChange } from '../../i18n';

export interface HUDData {
    score: number;
    mass: number;
    rank: number;
    boostCharge: number;
    maxBoost: number;
    fps?: number;
    deviceTier?: string;
    quality?: string;
}

export class HUDManager {
    private container: HTMLElement;
    private scoreEl: HTMLElement | null = null;
    private massEl: HTMLElement | null = null;
    private rankEl: HTMLElement | null = null;
    private boostBar: HTMLElement | null = null;
    private boostFill: HTMLElement | null = null;
    private fpsEl: HTMLElement | null = null;
    private fpsBarEl: HTMLElement | null = null;
    private deviceTierEl: HTMLElement | null = null;
    private boostWasReady: boolean = true;

    private lastData: HUDData = { score: 0, mass: 0, rank: 1, boostCharge: 100, maxBoost: 100, fps: 60 };
    private isVisible: boolean = false;
    private unsubscribeLocale: (() => void) | null = null;
    private fpsUpdateQueued: boolean = false;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'game-hud';
        this.container.className = 'hud hidden';
        this.render();

        // Subscribe to locale changes
        this.unsubscribeLocale = onLocaleChange(() => {
            this.render();
            this.update(this.lastData);
        });
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="hud-stats">
                <div class="hud-stat score">
                    <span class="hud-label">${t('hud.score')}</span>
                    <span class="hud-value" id="hudScore">0</span>
                </div>
                <div class="hud-stat mass">
                    <span class="hud-label">${t('hud.mass')}</span>
                    <span class="hud-value" id="hudMass">0</span>
                </div>
                <div class="hud-stat rank">
                    <span class="hud-label">${t('hud.rank')}</span>
                    <span class="hud-value" id="hudRank">#1</span>
                </div>
            </div>
            
            <!-- In-Game FPS Display -->
            <div class="hud-fps" id="hudFps">
                <div class="hud-fps-inner">
                    <span class="hud-fps-value" id="hudFpsValue">60</span>
                    <span class="hud-fps-label">FPS</span>
                    <div class="hud-fps-bar-container">
                        <div class="hud-fps-bar" id="hudFpsBar"></div>
                    </div>
                </div>
                <div class="hud-device-tier" id="hudDeviceTier"></div>
            </div>
            
            <div class="boost-bar" id="boostBar">
                <div class="boost-bar-bg"></div>
                <div class="boost-fill" id="boostFill"></div>
                <span class="boost-label">${t('hud.boost')}</span>
            </div>
        `;

        this.scoreEl = this.container.querySelector('#hudScore');
        this.massEl = this.container.querySelector('#hudMass');
        this.rankEl = this.container.querySelector('#hudRank');
        this.boostBar = this.container.querySelector('#boostBar');
        this.boostFill = this.container.querySelector('#boostFill');
        this.fpsEl = this.container.querySelector('#hudFpsValue');
        this.fpsBarEl = this.container.querySelector('#hudFpsBar');
        this.deviceTierEl = this.container.querySelector('#hudDeviceTier');
    }

    getElement(): HTMLElement {
        return this.container;
    }

    show(): void {
        this.isVisible = true;
        this.container.classList.remove('hidden');
        this.container.classList.add('fade-in');
    }

    hide(): void {
        this.isVisible = false;
        this.container.classList.add('hidden');
        this.container.classList.remove('fade-in');
    }

    update(data: Partial<HUDData>): void {
        this.lastData = { ...this.lastData, ...data };

        if (this.scoreEl && data.score !== undefined) {
            this.animateValue(this.scoreEl, data.score);
        }

        if (this.massEl && data.mass !== undefined) {
            this.massEl.textContent = Math.floor(data.mass).toString();
        }

        if (this.rankEl && data.rank !== undefined) {
            this.rankEl.textContent = `#${data.rank}`;
        }

        // Update FPS display (throttled)
        if (data.fps !== undefined && !this.fpsUpdateQueued) {
            this.fpsUpdateQueued = true;
            requestAnimationFrame(() => {
                this.updateFpsDisplay(data.fps!, data.deviceTier, data.quality);
                this.fpsUpdateQueued = false;
            });
        }

        if (this.boostFill && (data.boostCharge !== undefined || data.maxBoost !== undefined)) {
            const percent = this.lastData.maxBoost > 0 ? (this.lastData.boostCharge / this.lastData.maxBoost) * 100 : 0;
            this.boostFill.style.width = `${percent}%`;

            // Glow effect when boost is available
            if (percent >= 100) {
                this.boostBar?.classList.add('boost-ready');
                this.boostBar?.classList.remove('boost-low');
                if (!this.boostWasReady) {
                    this.boostBar?.classList.add('boost-just-ready');
                    window.setTimeout(() => this.boostBar?.classList.remove('boost-just-ready'), 650);
                }
                this.boostWasReady = true;
            } else {
                this.boostBar?.classList.remove('boost-ready');
                this.boostWasReady = false;
                if (percent <= 18) this.boostBar?.classList.add('boost-low');
                else this.boostBar?.classList.remove('boost-low');
            }
        }
    }

    private updateFpsDisplay(fps: number, tier?: string, quality?: string): void {
        if (!this.fpsEl || !this.fpsBarEl) return;

        // Color based on FPS performance
        let color = '#22C55E'; // Green
        let glowColor = 'rgba(34, 197, 94, 0.8)';
        let barWidth = Math.min(100, (fps / 60) * 100);

        if (fps < 30) {
            color = '#EF4444'; // Red
            glowColor = 'rgba(239, 68, 68, 0.8)';
        } else if (fps < 50) {
            color = '#F59E0B'; // Yellow
            glowColor = 'rgba(245, 158, 11, 0.8)';
        }

        this.fpsEl.textContent = fps.toString();
        this.fpsEl.style.color = color;
        this.fpsEl.style.textShadow = `0 0 10px ${glowColor}`;
        
        this.fpsBarEl.style.width = `${barWidth}%`;
        this.fpsBarEl.style.background = `linear-gradient(90deg, ${color}, ${glowColor})`;
        this.fpsBarEl.style.boxShadow = `0 0 10px ${glowColor}`;

        // Update device tier display
        if (this.deviceTierEl && tier) {
            const qualityEmoji = quality === 'ultra' ? '🔥' : 
                               quality === 'high' ? '⚡' : 
                               quality === 'medium' ? '✓' : 
                               quality === 'low' ? '▼' : '⏬';
            this.deviceTierEl.textContent = `${tier.toUpperCase()} ${qualityEmoji}`;
        }
    }

    private animateValue(element: HTMLElement, value: number): void {
        const current = parseInt(element.textContent || '0');
        if (value > current) {
            element.classList.add('value-increase');
            setTimeout(() => element.classList.remove('value-increase'), 300);
        }
        element.textContent = value.toString();
    }

    /**
     * Flash danger warning on HUD
     */
    flashDanger(): void {
        this.container.classList.add('hud-danger');
        setTimeout(() => this.container.classList.remove('hud-danger'), 500);
    }

    destroy(): void {
        this.unsubscribeLocale?.();
    }
}
