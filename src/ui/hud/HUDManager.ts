/**
 * HUD Manager - Orchestrates all in-game HUD components
 */

import { t, onLocaleChange } from '../../i18n';

export interface HUDData {
    score: number;
    mass: number;
    rank: number;
    boostCharge: number;
    maxBoost: number;
}

export class HUDManager {
    private container: HTMLElement;
    private scoreEl: HTMLElement | null = null;
    private massEl: HTMLElement | null = null;
    private rankEl: HTMLElement | null = null;
    private boostBar: HTMLElement | null = null;
    private boostFill: HTMLElement | null = null;

    private lastData: HUDData = { score: 0, mass: 0, rank: 1, boostCharge: 100, maxBoost: 100 };
    private isVisible: boolean = false;
    private unsubscribeLocale: (() => void) | null = null;

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

        if (this.boostFill && (data.boostCharge !== undefined || data.maxBoost !== undefined)) {
            const percent = (this.lastData.boostCharge / this.lastData.maxBoost) * 100;
            this.boostFill.style.width = `${percent}%`;

            // Glow effect when boost is available
            if (percent >= 100) {
                this.boostBar?.classList.add('boost-ready');
            } else {
                this.boostBar?.classList.remove('boost-ready');
            }
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
