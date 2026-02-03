/**
 * MusicManager - Dynamic background music system
 * 
 * Features:
 * - Volume responds to snake movement intensity
 * - Smooth fade-in when moving, fade-out when stationary
 * - Resumes from same position (doesn't restart on resume)
 * - Logarithmic volume curves for natural perception
 */

export interface MusicConfig {
    /** Maximum volume ceiling (0-1) */
    maxVolume: number;
    /** Minimum audible volume when moving (0-1) */
    minVolume: number;
    /** Fade-in speed multiplier */
    fadeInSpeed: number;
    /** Fade-out speed multiplier (slower for pleasant decay) */
    fadeOutSpeed: number;
    /** Intensity smoothing factor (higher = more responsive) */
    smoothingFactor: number;
    /** Minimum activity duration (ms) before volume increases */
    hysteresis: number;
}

const DEFAULT_CONFIG: MusicConfig = {
    // Conservative defaults: audible but never annoying.
    maxVolume: 0.35,
    minVolume: 0.06,
    fadeInSpeed: 1.25,
    fadeOutSpeed: 0.55,
    smoothingFactor: 3.0,
    hysteresis: 180,
};

export class MusicManager {
    private static instance: MusicManager | null = null;

    private audio: HTMLAudioElement | null = null;
    private config: MusicConfig = { ...DEFAULT_CONFIG };

    // Volume state
    private currentVolume: number = 0;
    private targetVolume: number = 0;
    private smoothedIntensity: number = 0;

    // Activity tracking (for hysteresis)
    private activityStartTime: number = 0;
    private isActive: boolean = false;

    // Master settings
    private isEnabled: boolean = true;
    private masterVolume: number = 1.0;
    private musicVolume: number = 0.7;

    // Animation frame for smooth transitions
    private animationFrameId: number | null = null;
    private lastFrameTime: number = 0;

    private constructor() {
        this.initAudio();
    }

    static getInstance(): MusicManager {
        if (!MusicManager.instance) {
            MusicManager.instance = new MusicManager();
        }
        return MusicManager.instance;
    }

    private initAudio(): void {
        // Create audio element for song.mp3
        this.audio = new Audio('/song.mp3');
        this.audio.loop = true;
        this.audio.volume = 0;
        this.audio.preload = 'auto';

        // Handle loading errors gracefully
        this.audio.addEventListener('error', () => {
            console.warn('MusicManager: Could not load song.mp3');
        });
    }

    private clampUnit(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.min(1, value));
    }

    private clampPercentToUnit(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return this.clampUnit(value / 100);
    }

    // ===== Public API =====

    /**
     * Start playing music (from current position or beginning)
     */
    play(): void {
        if (!this.audio || !this.isEnabled) return;

        // Resume audio context if needed (mobile unlock)
        this.audio.play().catch(() => {
            // Autoplay blocked - will play on next user interaction
        });

        // Start the volume animation loop
        this.startVolumeLoop();
    }

    /**
     * Pause the music (preserves position for resume)
     */
    pause(): void {
        if (!this.audio) return;

        // Fade out then pause
        this.targetVolume = 0;
        this.isActive = false;
    }

    /**
     * Stop the music and reset to beginning
     */
    stop(): void {
        if (!this.audio) return;

        this.stopVolumeLoop();
        this.audio.pause();
        this.audio.currentTime = 0;
        this.currentVolume = 0;
        this.targetVolume = 0;
        this.smoothedIntensity = 0;
        this.isActive = false;
    }

    /**
     * Set movement intensity (0-1)
     * Called every frame by Game with player velocity / max speed
     */
    setMovementIntensity(intensity: number): void {
        const now = performance.now();
        const clampedIntensity = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;

        // Track activity state for hysteresis
        if (clampedIntensity > 0.05) {
            if (!this.isActive) {
                this.activityStartTime = now;
                this.isActive = true;
            }
        } else {
            this.isActive = false;
        }

        // Only respond after hysteresis period
        const activityDuration = this.isActive ? now - this.activityStartTime : 0;
        const effectiveIntensity = activityDuration > this.config.hysteresis ? clampedIntensity : 0;

        // Smooth the intensity using exponential moving average
        // This prevents jarring volume changes from quick movements
        const dt = this.getDeltaTime();
        const smoothing = this.config.smoothingFactor * dt;
        this.smoothedIntensity += (effectiveIntensity - this.smoothedIntensity) * Math.min(1, smoothing);

        // Calculate target volume using logarithmic curve for perceptual linearity
        if (this.smoothedIntensity > 0.02) {
            // sqrt() curve gives natural perceived volume increase
            const normalizedVolume = Math.sqrt(this.smoothedIntensity);
            const range = this.config.maxVolume - this.config.minVolume;
            this.targetVolume = this.config.minVolume + range * normalizedVolume;
        } else {
            this.targetVolume = 0;
        }
    }

    /**
     * Enable or disable music entirely
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (!enabled) {
            this.stop();
        }
    }

    /**
     * Set the master volume multiplier (from settings, 0-100)
     */
    setMasterVolume(volume: number): void {
        this.masterVolume = this.clampPercentToUnit(volume);
        this.applyVolume();
    }

    /**
     * Set the music-specific volume (from settings, 0-100)
     */
    setMusicVolume(volume: number): void {
        this.musicVolume = this.clampPercentToUnit(volume);
        this.applyVolume();
    }

    /**
     * Update max volume ceiling (for dynamic difficulty or user preference)
     */
    setMaxVolume(max: number): void {
        if (!Number.isFinite(max)) return;
        this.config.maxVolume = this.clampUnit(max);
    }

    // ===== Internal Methods =====

    private getDeltaTime(): number {
        const now = performance.now();
        const dt = this.lastFrameTime ? (now - this.lastFrameTime) / 1000 : 0.016;
        this.lastFrameTime = now;
        return Math.min(dt, 0.1); // Cap to prevent huge jumps
    }

    private startVolumeLoop(): void {
        if (this.animationFrameId !== null) return;

        const loop = () => {
            this.updateVolume();
            this.animationFrameId = requestAnimationFrame(loop);
        };

        this.lastFrameTime = performance.now();
        this.animationFrameId = requestAnimationFrame(loop);
    }

    private stopVolumeLoop(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private updateVolume(): void {
        if (!this.audio) return;

        const dt = this.getDeltaTime();

        // Determine fade speed based on direction
        const isFadingIn = this.targetVolume > this.currentVolume;
        const fadeSpeed = isFadingIn ? this.config.fadeInSpeed : this.config.fadeOutSpeed;

        // Smooth interpolation towards target
        const diff = this.targetVolume - this.currentVolume;
        const step = diff * fadeSpeed * dt;

        // Apply step with minimum threshold to reach exact target
        if (Math.abs(diff) < 0.001) {
            this.currentVolume = this.targetVolume;
        } else {
            this.currentVolume += step;
        }

        // Clamp and apply
        this.currentVolume = Math.max(0, Math.min(1, this.currentVolume));
        this.applyVolume();

        // If volume is zero and target is zero, pause audio to save CPU
        if (this.currentVolume === 0 && this.targetVolume === 0 && !this.audio.paused) {
            // Don't reset currentTime - allows resume from same position
            this.audio.pause();
        }

        // Resume playing if we have volume and audio is paused
        if (this.currentVolume > 0 && this.audio.paused && this.isEnabled) {
            this.audio.play().catch(() => { });
        }
    }

    private applyVolume(): void {
        if (!this.audio) return;

        // Combine all volume factors
        const finalVolume = this.currentVolume * this.masterVolume * this.musicVolume;
        const safeVolume = Number.isFinite(finalVolume) ? finalVolume : 0;
        this.audio.volume = this.clampUnit(safeVolume);
    }
}

// Export singleton getter
export const getMusicManager = MusicManager.getInstance;
