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
    private activeTouchId: number | null = null;

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

        this.container.className = `boost-button-container ${position}`;
        this.container.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            touch-action: none;
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
            this.activeTouchId = null;
        };

        this.button.addEventListener('touchstart', (e: TouchEvent) => {
            if (this.activeTouchId !== null) return;
            const touch = e.changedTouches[0] ?? e.touches[0];
            if (!touch) return;
            this.activeTouchId = touch.identifier;
            startPress(e);
        }, { passive: false });

        this.button.addEventListener('touchend', (e: TouchEvent) => {
            if (this.activeTouchId === null) return;
            const ended = Array.from(e.changedTouches).some(t => t.identifier === this.activeTouchId);
            if (ended) endPress(e);
        }, { passive: false });

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

        // Update ring visual (CSS conic-gradient)
        this.chargeRing.style.setProperty('--charge-percent', `${this.chargePercent}`);

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
