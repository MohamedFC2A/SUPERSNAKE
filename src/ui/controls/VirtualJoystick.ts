/**
 * VirtualJoystick - Enhanced mobile joystick control
 */

export interface JoystickConfig {
    size: number;
    position: 'left' | 'right';
    deadZone: number;
    maxRadius: number;
}

export interface JoystickState {
    active: boolean;
    direction: { x: number; y: number };
    magnitude: number;
}

export class VirtualJoystick {
    private container: HTMLElement;
    private base: HTMLElement;
    private handle: HTMLElement;
    private config: JoystickConfig;

    private isActive: boolean = false;
    private center: { x: number; y: number } = { x: 0, y: 0 };
    private direction: { x: number; y: number } = { x: 0, y: 0 };
    private magnitude: number = 0;
    private activeTouchId: number | null = null;

    constructor(config: Partial<JoystickConfig> = {}) {
        this.config = {
            size: 120,
            position: 'left',
            deadZone: 10,
            maxRadius: 50,
            ...config,
        };

        this.container = document.createElement('div');
        this.base = document.createElement('div');
        this.handle = document.createElement('div');

        this.render();
        this.setupEventListeners();
    }

    private render(): void {
        const { size, position } = this.config;
        const handleSize = size * 0.4;

        this.container.className = `joystick-container${position === 'right' ? ' right' : ''}`;
        this.container.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            touch-action: none;
        `;

        this.base.className = 'joystick-base';
        this.handle.className = 'joystick-handle';
        this.handle.style.cssText = `
            width: ${handleSize}px;
            height: ${handleSize}px;
        `;

        this.container.appendChild(this.base);
        this.container.appendChild(this.handle);
    }

    private setupEventListeners(): void {
        this.container.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        window.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        window.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
        window.addEventListener('touchcancel', this.onTouchEnd.bind(this), { passive: false });
    }

    private onTouchStart(e: TouchEvent): void {
        e.preventDefault();
        const touch = e.changedTouches[0] ?? e.touches[0];
        if (!touch) return;
        this.activeTouchId = touch.identifier;
        const rect = this.container.getBoundingClientRect();

        this.isActive = true;
        this.center = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        };

        this.updatePosition(touch.clientX, touch.clientY);
        this.container.classList.add('active');

        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
    }

    private onTouchMove(e: TouchEvent): void {
        if (!this.isActive) return;
        e.preventDefault();

        const touch = this.activeTouchId !== null
            ? Array.from(e.touches).find(t => t.identifier === this.activeTouchId) ?? null
            : e.touches[0] ?? null;
        if (!touch) return;
        this.updatePosition(touch.clientX, touch.clientY);
    }

    private onTouchEnd(e: TouchEvent): void {
        if (!this.isActive) return;

        if (this.activeTouchId !== null) {
            const ended = Array.from(e.changedTouches).some(t => t.identifier === this.activeTouchId);
            if (ended) {
                this.reset();
                this.activeTouchId = null;
            }
        } else if (e.touches.length === 0) {
            this.reset();
        }
    }

    private updatePosition(touchX: number, touchY: number): void {
        const dx = touchX - this.center.x;
        const dy = touchY - this.center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const { maxRadius, deadZone } = this.config;

        // Calculate clamped position
        let clampedX = dx;
        let clampedY = dy;

        if (distance > maxRadius) {
            const ratio = maxRadius / distance;
            clampedX = dx * ratio;
            clampedY = dy * ratio;
        }

        // Update handle position
        this.handle.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;

        // Calculate direction (with dead zone)
        if (distance > deadZone) {
            this.magnitude = Math.min(distance / maxRadius, 1);
            this.direction = {
                x: dx / distance,
                y: dy / distance,
            };
        } else {
            this.magnitude = 0;
            this.direction = { x: 0, y: 0 };
        }
    }

    private reset(): void {
        this.isActive = false;
        this.direction = { x: 0, y: 0 };
        this.magnitude = 0;
        this.activeTouchId = null;
        this.handle.style.transform = 'translate(-50%, -50%)';
        this.container.classList.remove('active');
    }

    getElement(): HTMLElement {
        return this.container;
    }

    getState(): JoystickState {
        return {
            active: this.isActive,
            direction: { ...this.direction },
            magnitude: this.magnitude,
        };
    }

    updateConfig(config: Partial<JoystickConfig>): void {
        this.config = { ...this.config, ...config };
        this.render();
    }

    show(): void {
        this.container.classList.remove('hidden');
    }

    hide(): void {
        this.container.classList.add('hidden');
        this.reset();
    }

    destroy(): void {
        this.container.remove();
    }
}
