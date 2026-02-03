import { Vector2 } from '../utils/utils';

/**
 * InputManager - Handles keyboard, touch, and mouse inputs
 */
export class InputManager {
    private keys: Map<string, boolean> = new Map();
    private mousePosition: Vector2 = new Vector2();
    private touchPosition: Vector2 | null = null;
    private joystickDirection: Vector2 = new Vector2();
    private joystickActive: boolean = false;
    private boostPressed: boolean = false;

    // External (UI) controls (used by PlayPage mobile UI)
    private externalControlsEnabled: boolean = false;
    private externalJoystickActive: boolean = false;
    private externalJoystickVector: Vector2 = Vector2.zero();
    private externalBoostPressed: boolean = false;

    // Internal touch tracking (fallback)
    private joystickTouchId: number | null = null;
    private boostTouchId: number | null = null;

    // Joystick configuration
    private joystickCenter: Vector2 = new Vector2();
    private joystickMaxRadius: number = 50;

    private canvas: HTMLCanvasElement | null = null;

    constructor() {
        this.setupKeyboardListeners();
        this.setupMouseListeners();
        this.setupTouchListeners();
    }

    public setCanvas(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
    }

    /**
     * Enable/disable external UI controls (virtual joystick + boost button).
     * When enabled, internal touch controls are ignored.
     */
    public setExternalControlsEnabled(enabled: boolean): void {
        this.externalControlsEnabled = enabled;
        if (enabled) {
            this.joystickActive = false;
            this.joystickDirection = Vector2.zero();
            this.boostPressed = false;
            this.joystickTouchId = null;
            this.boostTouchId = null;
        } else {
            this.externalJoystickActive = false;
            this.externalJoystickVector = Vector2.zero();
            this.externalBoostPressed = false;
        }
    }

    public setExternalJoystick(direction: Vector2, active: boolean): void {
        this.externalJoystickActive = active;
        const mag = direction.magnitude();
        if (mag <= 0) {
            this.externalJoystickVector = Vector2.zero();
            return;
        }
        // Keep magnitude (0..1) so we can use it as intent intensity for music.
        const clamped = Math.min(1, mag);
        this.externalJoystickVector = direction.normalize().multiply(clamped);
    }

    public setExternalBoostPressed(pressed: boolean): void {
        this.externalBoostPressed = pressed;
    }

    private setupKeyboardListeners(): void {
        window.addEventListener('keydown', (e) => {
            this.keys.set(e.code, true);

            // Prevent default for game keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys.set(e.code, false);
        });
    }

    private setupMouseListeners(): void {
        window.addEventListener('mousemove', (e) => {
            this.mousePosition.set(e.clientX, e.clientY);
        });

        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click
                this.boostPressed = true;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.boostPressed = false;
            }
        });
    }

    private setupTouchListeners(): void {
        window.addEventListener('touchstart', (e) => {
            if (this.externalControlsEnabled) return;
            if (e.touches.length > 0) {
                // Prefer the first new touch as joystick if it's in joystick zone; otherwise boost.
                const touch = e.changedTouches[0] ?? e.touches[0];
                if (touch) {
                    const x = touch.clientX;
                    const y = touch.clientY;

                    // Bottom-left quadrant = joystick
                    if (x < window.innerWidth / 2 && y > window.innerHeight / 2 && this.joystickTouchId === null) {
                        this.joystickTouchId = touch.identifier;
                        this.joystickCenter.set(x, y);
                        this.joystickActive = true;
                        this.touchPosition = new Vector2(x, y);
                    } else if (this.boostTouchId === null) {
                        this.boostTouchId = touch.identifier;
                        this.boostPressed = true;
                    }
                }
            }
            e.preventDefault();
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (this.externalControlsEnabled) return;
            if (this.joystickActive && e.touches.length > 0) {
                const touch = this.joystickTouchId !== null
                    ? Array.from(e.touches).find(t => t.identifier === this.joystickTouchId) ?? e.touches[0]
                    : e.touches[0];

                this.touchPosition = new Vector2(touch.clientX, touch.clientY);

                // Calculate joystick direction
                const delta = this.touchPosition.subtract(this.joystickCenter);
                const distance = delta.magnitude();

                if (distance > this.joystickMaxRadius) {
                    this.joystickDirection = delta.normalize();
                } else if (distance > 10) {
                    this.joystickDirection = delta.divide(this.joystickMaxRadius);
                } else {
                    this.joystickDirection = Vector2.zero();
                }
            }
            e.preventDefault();
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            if (this.externalControlsEnabled) return;

            // If the joystick touch ended, reset joystick
            if (this.joystickTouchId !== null) {
                const ended = Array.from(e.changedTouches).some(t => t.identifier === this.joystickTouchId);
                if (ended) {
                    this.joystickTouchId = null;
                    this.joystickActive = false;
                    this.joystickDirection = Vector2.zero();
                    this.touchPosition = null;
                }
            }

            // If boost touch ended, reset boost
            if (this.boostTouchId !== null) {
                const ended = Array.from(e.changedTouches).some(t => t.identifier === this.boostTouchId);
                if (ended) {
                    this.boostTouchId = null;
                    this.boostPressed = false;
                }
            }

            e.preventDefault();
        }, { passive: false });

        window.addEventListener('touchcancel', (e) => {
            if (this.externalControlsEnabled) return;

            if (this.joystickTouchId !== null && Array.from(e.changedTouches).some(t => t.identifier === this.joystickTouchId)) {
                this.joystickTouchId = null;
                this.joystickActive = false;
                this.joystickDirection = Vector2.zero();
                this.touchPosition = null;
            }

            if (this.boostTouchId !== null && Array.from(e.changedTouches).some(t => t.identifier === this.boostTouchId)) {
                this.boostTouchId = null;
                this.boostPressed = false;
            }

            e.preventDefault();
        }, { passive: false });
    }

    /**
     * Get movement direction from keyboard inputs
     */
    public getKeyboardDirection(): Vector2 {
        const dir = new Vector2();

        if (this.keys.get('KeyW') || this.keys.get('ArrowUp')) dir.y -= 1;
        if (this.keys.get('KeyS') || this.keys.get('ArrowDown')) dir.y += 1;
        if (this.keys.get('KeyA') || this.keys.get('ArrowLeft')) dir.x -= 1;
        if (this.keys.get('KeyD') || this.keys.get('ArrowRight')) dir.x += 1;

        return dir.magnitude() > 0 ? dir.normalize() : dir;
    }

    /**
     * Get direction to mouse position relative to screen center
     */
    public getMouseDirection(screenCenter: Vector2): Vector2 {
        const delta = this.mousePosition.subtract(screenCenter);
        // Increase deadzone to avoid jitter when mouse is near center
        return delta.magnitude() > 20 ? delta.normalize() : Vector2.zero();
    }

    /**
     * Get combined input direction (keyboard + joystick)
     */
    public getDirection(screenCenter: Vector2): Vector2 {
        // Keyboard takes priority
        const keyDir = this.getKeyboardDirection();
        if (keyDir.magnitude() > 0) {
            return keyDir;
        }

        // External joystick (mobile UI)
        if (this.externalControlsEnabled && this.externalJoystickActive && this.externalJoystickVector.magnitude() > 0) {
            return this.externalJoystickVector.normalize();
        }

        // Then joystick
        if (this.joystickActive && this.joystickDirection.magnitude() > 0) {
            return this.joystickDirection.normalize();
        }

        // Finally mouse
        return this.getMouseDirection(screenCenter);
    }

    /**
     * Check if boost is active
     */
    public isBoostPressed(): boolean {
        if (this.externalControlsEnabled) {
            return this.externalBoostPressed || this.keys.get('Space') || false;
        }
        return this.boostPressed || this.keys.get('Space') || false;
    }

    /**
     * Get player "intent" intensity (0..1) based on input strength.
     * Used for adaptive music (so it fades to 0 when the player stops moving their input).
     */
    public getIntentIntensity(screenCenter: Vector2): number {
        // Keyboard: any movement key implies full intent
        if (
            this.keys.get('KeyW') ||
            this.keys.get('KeyA') ||
            this.keys.get('KeyS') ||
            this.keys.get('KeyD') ||
            this.keys.get('ArrowUp') ||
            this.keys.get('ArrowDown') ||
            this.keys.get('ArrowLeft') ||
            this.keys.get('ArrowRight')
        ) {
            return 1;
        }

        // External joystick (mobile UI): preserve magnitude
        if (this.externalControlsEnabled && this.externalJoystickActive) {
            const m = this.externalJoystickVector.magnitude();
            return Math.max(0, Math.min(1, m));
        }

        // Internal touch joystick: magnitude already encodes intensity
        if (this.joystickActive) {
            const m = this.joystickDirection.magnitude();
            return Math.max(0, Math.min(1, m));
        }

        // Mouse: distance from center maps to intent
        const delta = this.mousePosition.subtract(screenCenter);
        const dist = delta.magnitude();
        const dead = 20;
        const range = 220;
        const v = (dist - dead) / range;
        return Math.max(0, Math.min(1, v));
    }

    /**
     * Get joystick state for rendering
     */
    public getJoystickState(): { active: boolean; center: Vector2; handle: Vector2 } {
        return {
            active: this.joystickActive,
            center: this.joystickCenter,
            handle: this.joystickCenter.add(this.joystickDirection.multiply(this.joystickMaxRadius)),
        };
    }

    /**
     * Check if device is touch-enabled
     */
    public isTouchDevice(): boolean {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    /**
     * Clean up event listeners
     */
    public destroy(): void {
        // Events are on window, they'll be cleaned up when page closes
    }
}
