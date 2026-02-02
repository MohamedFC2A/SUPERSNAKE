/**
 * BoostButton - Dedicated boost control with visual feedback
 */

export interface BoostButtonConfig {
    size: number;
    position: 'left' | 'right';
}

export class BoostButton {
    private container: HTMLElement;
    private button: HTMLElement;
    private chargeRing: HTMLElement;
    private config: BoostButtonConfig;

    private isPressed: boolean = false;
    private chargePercent: number = 100;

    constructor(config: Partial<BoostButtonConfig> = {}) {
        this.config = {
            size: 80,
            position: 'right',
            ...config,
        };

        this.container = document.createElement('div');
        this.button = document.createElement('div');
        this.chargeRing = document.createElement('div');

        this.render();
        this.setupEventListeners();
    }

    private render(): void {
        const { size, position } = this.config;

        this.container.className = `boost-button-container boost-${position}`;
        this.container.style.cssText = `
            width: ${size}px;
            height: ${size}px;
        `;

        this.chargeRing.className = 'boost-charge-ring';
        this.button.className = 'boost-button';
        this.button.innerHTML = `
            <span class="boost-icon">⚡</span>
            <span class="boost-text">BOOST</span>
        `;

        this.container.appendChild(this.chargeRing);
        this.container.appendChild(this.button);
    }

    private setupEventListeners(): void {
        const startPress = (e: Event) => {
            e.preventDefault();
            this.isPressed = true;
            this.container.classList.add('pressed');

            if (navigator.vibrate) {
                navigator.vibrate(20);
            }
        };

        const endPress = (e: Event) => {
            e.preventDefault();
            this.isPressed = false;
            this.container.classList.remove('pressed');
        };

        this.button.addEventListener('touchstart', startPress, { passive: false });
        this.button.addEventListener('touchend', endPress, { passive: false });
        this.button.addEventListener('touchcancel', endPress, { passive: false });

        this.button.addEventListener('mousedown', startPress);
        this.button.addEventListener('mouseup', endPress);
        this.button.addEventListener('mouseleave', endPress);
    }

    getElement(): HTMLElement {
        return this.container;
    }

    isBoostPressed(): boolean {
        return this.isPressed;
    }

    updateCharge(percent: number): void {
        this.chargePercent = Math.max(0, Math.min(100, percent));

        // Update ring visual
        const circumference = 2 * Math.PI * 35; // radius of ring
        const offset = circumference - (this.chargePercent / 100) * circumference;
        this.chargeRing.style.setProperty('--charge-offset', `${offset}px`);

        // Add/remove ready state
        if (this.chargePercent >= 100) {
            this.container.classList.add('boost-ready');
        } else {
            this.container.classList.remove('boost-ready');
        }
    }

    updateConfig(config: Partial<BoostButtonConfig>): void {
        this.config = { ...this.config, ...config };
        this.render();
        this.setupEventListeners();
    }

    show(): void {
        this.container.classList.remove('hidden');
    }

    hide(): void {
        this.container.classList.add('hidden');
    }

    destroy(): void {
        this.container.remove();
    }
}
