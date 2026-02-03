/**
 * VirtualJoystick - Enhanced mobile joystick control
 * Optimized for smooth performance and responsiveness
 */

import { throttle } from '../../utils/performance';

export interface JoystickConfig {
    size: number;
    position: 'left' | 'right';
    deadZone: number;
    maxRadius: number;
    vibrate?: (pattern: number | number[]) => void;
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
    private lastVibrate: number = 0;
    private rafId: number | null = null;
    
    // Smooth interpolation
    private smoothedDirection: { x: number; y: number } = { x: 0, y: 0 };
    private smoothingFactor: number = 0.3;

    private boundOnTouchStart: (e: TouchEvent) => void;
    private boundOnTouchMove: (e: TouchEvent) => void;
    private boundOnTouchEnd: (e: TouchEvent) => void;

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
        this.boundOnTouchStart = this.onTouchStart.bind(this);
        this.boundOnTouchMove = throttle(this.onTouchMove.bind(this), 16); // ~60fps
        this.boundOnTouchEnd = this.onTouchEnd.bind(this);
        this.setupEventListeners();
    }

    private render(): void {
        const { size, position } = this.config;
        const handleSize = size * 0.4;

        this.container.innerHTML = '';
        this.container.className = `joystick-container${position === 'right' ? ' right' : ''}`;
        this.container.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
        `;

        this.base.className = 'joystick-base';
        this.base.style.cssText = `
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            transition: transform 0.1s ease, background 0.2s ease;
        `;

        this.handle.className = 'joystick-handle';
        this.handle.style.cssText = `
            width: ${handleSize}px;
            height: ${handleSize}px;
            border-radius: 50%;
            background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
            box-shadow: 
                0 4px 15px rgba(59, 130, 246, 0.4),
                0 0 0 2px rgba(255, 255, 255, 0.1) inset;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            transition: transform 0.05s linear;
            pointer-events: none;
        `;

        this.container.appendChild(this.base);
        this.container.appendChild(this.handle);
    }

    private setupEventListeners(): void {
        // Use passive: false only for touchstart to prevent scrolling
        this.container.addEventListener('touchstart', this.boundOnTouchStart, { passive: false });
        window.addEventListener('touchmove', this.boundOnTouchMove, { passive: true });
        window.addEventListener('touchend', this.boundOnTouchEnd, { passive: true });
        window.addEventListener('touchcancel', this.boundOnTouchEnd, { passive: true });
        
        // Prevent context menu
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    private onTouchStart(e: TouchEvent): void {
        e.preventDefault();
        const touch = e.changedTouches[0] ?? e.touches[0];
        if (!touch) return;
        
        // Ignore if already active with another touch
        if (this.isActive && this.activeTouchId !== null) return;
        
        this.activeTouchId = touch.identifier;
        const rect = this.container.getBoundingClientRect();

        this.isActive = true;
        this.center = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        };

        this.updatePosition(touch.clientX, touch.clientY);
        this.container.classList.add('active');
        this.base.style.transform = 'scale(0.95)';
        this.base.style.background = 'rgba(255, 255, 255, 0.15)';

        // Haptic feedback (throttled)
        const now = Date.now();
        if (now - this.lastVibrate > 100) {
            this.config.vibrate?.(8);
            this.lastVibrate = now;
        }
    }

    private onTouchMove(e: TouchEvent): void {
        if (!this.isActive) return;

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

        // Smooth interpolation
        this.smoothedDirection.x += (clampedX - this.smoothedDirection.x) * this.smoothingFactor;
        this.smoothedDirection.y += (clampedY - this.smoothedDirection.y) * this.smoothingFactor;

        // Update handle position using RAF for smoothness
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(() => {
            this.handle.style.transform = `translate(calc(-50% + ${this.smoothedDirection.x}px), calc(-50% + ${this.smoothedDirection.y}px))`;
        });

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
        this.smoothedDirection = { x: 0, y: 0 };
        
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.handle.style.transform = 'translate(-50%, -50%)';
        this.container.classList.remove('active');
        this.base.style.transform = 'scale(1)';
        this.base.style.background = 'rgba(255, 255, 255, 0.1)';
        
        // Haptic feedback on release
        const now = Date.now();
        if (now - this.lastVibrate > 100) {
            this.config.vibrate?.(5);
            this.lastVibrate = now;
        }
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
        this.container.style.opacity = '1';
    }

    hide(): void {
        this.container.classList.add('hidden');
        this.container.style.opacity = '0';
        this.reset();
    }

    destroy(): void {
        this.container.removeEventListener('touchstart', this.boundOnTouchStart);
        window.removeEventListener('touchmove', this.boundOnTouchMove);
        window.removeEventListener('touchend', this.boundOnTouchEnd);
        window.removeEventListener('touchcancel', this.boundOnTouchEnd);
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.container.remove();
    }
}
