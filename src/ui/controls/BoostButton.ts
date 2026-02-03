/**
 * BoostButton - Dedicated boost control with visual feedback
 */

export interface BoostButtonConfig {
    size: number;
    position: 'left' | 'right';
    vibrate?: (pattern: number | number[]) => void;
}

export class BoostButton {
    private container: HTMLElement;
    private button: HTMLElement;
    private chargeRing: HTMLElement;
    private config: BoostButtonConfig;

    private isPressed: boolean = false;
    private chargePercent: number = 100;
    private activeTouchId: number | null = null;

    private boundStartPress: ((e: Event) => void) | null = null;
    private boundEndPress: ((e: Event) => void) | null = null;
    private boundOnTouchStart: ((e: TouchEvent) => void) | null = null;
    private boundOnTouchEnd: ((e: TouchEvent) => void) | null = null;
    private boundOnTouchCancel: ((e: TouchEvent) => void) | null = null;
    private boundOnMouseDown: ((e: MouseEvent) => void) | null = null;
    private boundOnMouseUp: ((e: MouseEvent) => void) | null = null;
    private boundOnMouseLeave: ((e: MouseEvent) => void) | null = null;

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

        this.container.innerHTML = '';
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

            this.config.vibrate?.(20);
        };

        const endPress = (e: Event) => {
            e.preventDefault();
            this.isPressed = false;
            this.container.classList.remove('pressed');
            this.activeTouchId = null;
        };

        this.boundStartPress = startPress;
        this.boundEndPress = endPress;

        this.boundOnTouchStart = (e: TouchEvent) => {
            if (this.activeTouchId !== null) return;
            const touch = e.changedTouches[0] ?? e.touches[0];
            if (!touch) return;
            this.activeTouchId = touch.identifier;
            startPress(e);
        };

        this.boundOnTouchEnd = (e: TouchEvent) => {
            if (this.activeTouchId === null) return;
            const ended = Array.from(e.changedTouches).some(t => t.identifier === this.activeTouchId);
            if (ended) endPress(e);
        };

        this.boundOnTouchCancel = (e: TouchEvent) => endPress(e);

        this.boundOnMouseDown = (e: MouseEvent) => startPress(e);
        this.boundOnMouseUp = (e: MouseEvent) => endPress(e);
        this.boundOnMouseLeave = (e: MouseEvent) => endPress(e);

        if (this.boundOnTouchStart) this.button.addEventListener('touchstart', this.boundOnTouchStart, { passive: false });
        if (this.boundOnTouchEnd) this.button.addEventListener('touchend', this.boundOnTouchEnd, { passive: false });
        if (this.boundOnTouchCancel) this.button.addEventListener('touchcancel', this.boundOnTouchCancel, { passive: false });

        if (this.boundOnMouseDown) this.button.addEventListener('mousedown', this.boundOnMouseDown);
        if (this.boundOnMouseUp) this.button.addEventListener('mouseup', this.boundOnMouseUp);
        if (this.boundOnMouseLeave) this.button.addEventListener('mouseleave', this.boundOnMouseLeave);
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
            this.container.classList.remove('boost-low');
        } else {
            this.container.classList.remove('boost-ready');
            if (this.chargePercent <= 18) this.container.classList.add('boost-low');
            else this.container.classList.remove('boost-low');
        }
    }

    updateConfig(config: Partial<BoostButtonConfig>): void {
        this.config = { ...this.config, ...config };
        this.render();
    }

    show(): void {
        this.container.classList.remove('hidden');
    }

    hide(): void {
        this.container.classList.add('hidden');
    }

    destroy(): void {
        if (this.boundOnTouchStart) this.button.removeEventListener('touchstart', this.boundOnTouchStart);
        if (this.boundOnTouchEnd) this.button.removeEventListener('touchend', this.boundOnTouchEnd);
        if (this.boundOnTouchCancel) this.button.removeEventListener('touchcancel', this.boundOnTouchCancel);
        if (this.boundOnMouseDown) this.button.removeEventListener('mousedown', this.boundOnMouseDown);
        if (this.boundOnMouseUp) this.button.removeEventListener('mouseup', this.boundOnMouseUp);
        if (this.boundOnMouseLeave) this.button.removeEventListener('mouseleave', this.boundOnMouseLeave);
        this.container.remove();
    }
}
