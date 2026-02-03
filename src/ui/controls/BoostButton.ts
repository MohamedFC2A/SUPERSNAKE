/**
 * BoostButton - Dedicated boost control with visual feedback
 * Optimized for mobile performance
 */

import { throttle } from '../../utils/performance';

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
    private lastVibrate: number = 0;
    private chargeUpdateQueued: boolean = false;

    private boundStartPress: ((e: Event) => void) | null = null;
    private boundEndPress: ((e: Event) => void) | null = null;
    private boundOnTouchStart: ((e: TouchEvent) => void) | null = null;
    private boundOnTouchEnd: ((e: TouchEvent) => void) | null = null;
    private boundOnTouchCancel: ((e: TouchEvent) => void) | null = null;

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
            user-select: none;
            -webkit-user-select: none;
            position: absolute;
            bottom: calc(var(--touch-pad) + env(safe-area-inset-bottom));
            ${position === 'left' ? 'left' : 'right'}: calc(var(--touch-pad) + env(safe-area-inset-${position === 'left' ? 'left' : 'right'}));
        `;

        this.chargeRing.className = 'boost-charge-ring';
        this.chargeRing.style.cssText = `
            position: absolute;
            inset: 0;
            border-radius: 50%;
            background: conic-gradient(
                rgba(59, 130, 246, 0.95) calc(var(--charge-percent, 100) * 1%),
                rgba(255, 255, 255, 0.10) 0
            );
            -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 7px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 7px));
            opacity: 0.95;
            filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.35));
            transition: filter 0.2s ease;
        `;

        this.button.className = 'boost-button';
        this.button.style.cssText = `
            position: absolute;
            inset: 7px;
            border-radius: 50%;
            background: linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
            border: 1px solid rgba(255,255,255,0.2);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #3B82F6;
            cursor: pointer;
            transition: transform 0.1s ease, background 0.2s ease;
            pointer-events: auto;
        `;
        this.button.innerHTML = `
            <span class="boost-icon" style="font-size: 24px; line-height: 1; filter: drop-shadow(0 0 8px rgba(59,130,246,0.5));">⚡</span>
            <span class="boost-text" style="font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: rgba(255,255,255,0.9); margin-top: 2px;">BOOST</span>
        `;

        this.container.appendChild(this.chargeRing);
        this.container.appendChild(this.button);
    }

    private setupEventListeners(): void {
        const startPress = (e: Event) => {
            e.preventDefault();
            if (this.isPressed) return;
            
            this.isPressed = true;
            this.container.classList.add('pressed');
            this.button.style.transform = 'scale(0.92)';
            this.button.style.background = 'rgba(59, 130, 246, 0.3)';

            // Throttled haptic feedback
            const now = Date.now();
            if (now - this.lastVibrate > 50) {
                this.config.vibrate?.(15);
                this.lastVibrate = now;
            }
        };

        const endPress = (e: Event) => {
            e.preventDefault();
            if (!this.isPressed) return;
            
            this.isPressed = false;
            this.container.classList.remove('pressed');
            this.button.style.transform = 'scale(1)';
            this.button.style.background = 'linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))';
            this.activeTouchId = null;
            
            // Throttled haptic feedback
            const now = Date.now();
            if (now - this.lastVibrate > 50) {
                this.config.vibrate?.(8);
                this.lastVibrate = now;
            }
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

        this.boundOnTouchCancel = (e: TouchEvent) => {
            endPress(e);
        };

        // Use passive listeners where possible
        this.button.addEventListener('touchstart', this.boundOnTouchStart, { passive: false });
        this.button.addEventListener('touchend', this.boundOnTouchEnd, { passive: false });
        this.button.addEventListener('touchcancel', this.boundOnTouchCancel, { passive: true });
        
        // Prevent context menu
        this.button.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    getElement(): HTMLElement {
        return this.container;
    }

    isBoostPressed(): boolean {
        return this.isPressed;
    }

    updateCharge(percent: number): void {
        this.chargePercent = Math.max(0, Math.min(100, percent));
        
        // Queue update to batch DOM writes
        if (!this.chargeUpdateQueued) {
            this.chargeUpdateQueued = true;
            requestAnimationFrame(() => {
                this.chargeRing.style.setProperty('--charge-percent', `${this.chargePercent}`);
                
                // Add/remove ready state
                if (this.chargePercent >= 100) {
                    this.container.classList.add('boost-ready');
                    this.container.classList.remove('boost-low');
                    this.chargeRing.style.filter = 'drop-shadow(0 6px 18px rgba(0, 0, 0, 0.35)) drop-shadow(0 0 10px rgba(34, 197, 94, 0.5))';
                } else {
                    this.container.classList.remove('boost-ready');
                    if (this.chargePercent <= 18) {
                        this.container.classList.add('boost-low');
                        this.chargeRing.style.filter = 'drop-shadow(0 6px 18px rgba(0, 0, 0, 0.35)) drop-shadow(0 0 10px rgba(239, 68, 68, 0.3))';
                    } else {
                        this.container.classList.remove('boost-low');
                        this.chargeRing.style.filter = 'drop-shadow(0 6px 18px rgba(0, 0, 0, 0.35))';
                    }
                }
                
                this.chargeUpdateQueued = false;
            });
        }
    }

    updateConfig(config: Partial<BoostButtonConfig>): void {
        this.config = { ...this.config, ...config };
        this.render();
    }

    show(): void {
        this.container.classList.remove('hidden');
        this.container.style.opacity = '1';
        this.container.style.pointerEvents = 'auto';
    }

    hide(): void {
        this.container.classList.add('hidden');
        this.container.style.opacity = '0';
        this.container.style.pointerEvents = 'none';
    }

    destroy(): void {
        if (this.boundOnTouchStart) this.button.removeEventListener('touchstart', this.boundOnTouchStart);
        if (this.boundOnTouchEnd) this.button.removeEventListener('touchend', this.boundOnTouchEnd);
        if (this.boundOnTouchCancel) this.button.removeEventListener('touchcancel', this.boundOnTouchCancel);
        this.container.remove();
    }
}
