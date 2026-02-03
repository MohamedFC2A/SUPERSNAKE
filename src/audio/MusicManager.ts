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

    /** Playback rate when idle / barely moving */
    idlePlaybackRate: number;
    /** Playback rate at normal movement (no boost) */
    basePlaybackRate: number;
    /** Maximum playback rate */
    maxPlaybackRate: number;
    /** Playback rate speed-up smoothing */
    playbackRateUpSpeed: number;
    /** Playback rate slow-down smoothing */
    playbackRateDownSpeed: number;
}

export type MusicTrackId = 'song' | 'blue';

const MUSIC_TRACKS: Record<MusicTrackId, string> = {
    song: '/song.mp3',
    blue: '/blue.mp3',
};

const DEFAULT_CONFIG: MusicConfig = {
    // Conservative defaults: audible but never annoying.
    maxVolume: 0.35,
    minVolume: 0.06,
    fadeInSpeed: 1.25,
    fadeOutSpeed: 0.55,
    smoothingFactor: 3.0,
    hysteresis: 180,

    // "Thick" base sound + noticeable but pleasant speed-up under boost.
    idlePlaybackRate: 0.58,
    basePlaybackRate: 0.7,
    maxPlaybackRate: 1.25,
    playbackRateUpSpeed: 2.4,
    playbackRateDownSpeed: 1.6,
};

export class MusicManager {
    private static instance: MusicManager | null = null;

    private audio: HTMLAudioElement | null = null;
    private config: MusicConfig = { ...DEFAULT_CONFIG };
    private track: MusicTrackId = 'song';

    // Volume state
    private currentVolume: number = 0;
    private targetVolume: number = 0;
    private smoothedIntensity: number = 0;

    // Activity tracking (for hysteresis)
    private activityStartTime: number = 0;
    private isActive: boolean = false;

    // Playback rate state (tempo responds to speed)
    private currentPlaybackRate: number = DEFAULT_CONFIG.idlePlaybackRate;
    private targetPlaybackRate: number = DEFAULT_CONFIG.idlePlaybackRate;
    private latestSpeedFactor: number = 1.0;

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
        // Create audio element for selected track
        this.audio = new Audio(MUSIC_TRACKS[this.track]);
        this.audio.loop = true;
        this.audio.volume = 0;
        this.audio.playbackRate = this.config.idlePlaybackRate;
        this.audio.preload = 'auto';

        // Make playbackRate affect pitch (thicker at 0.7x, faster/brighter at boosts).
        // Some browsers expose this under vendor-prefixed properties.
        try {
            (this.audio as any).preservesPitch = false;
            (this.audio as any).mozPreservesPitch = false;
            (this.audio as any).webkitPreservesPitch = false;
        } catch {
            // ignore
        }

        // Handle loading errors gracefully
        this.audio.addEventListener('error', () => {
            console.warn(`MusicManager: Could not load music track (${this.audio?.src || 'unknown'})`);
        });
    }

    private clampUnit(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.min(1, value));
    }

    private clampFinite(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) return min;
        return Math.max(min, Math.min(max, value));
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
        this.currentPlaybackRate = this.config.idlePlaybackRate;
        this.targetPlaybackRate = this.config.idlePlaybackRate;
        this.latestSpeedFactor = 1.0;
        this.applyPlaybackRate();
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
     * Set speed factor (e.g. currentSpeed / baseSpeed).
     * Higher speed => slightly faster tempo.
     */
    setSpeedFactor(speedFactor: number): void {
        if (!Number.isFinite(speedFactor)) return;
        // Clamp to a reasonable range (handles powerups/edge-cases)
        this.latestSpeedFactor = Math.max(0.25, Math.min(4.0, speedFactor));
    }

    /**
     * Switch the background track.
     * Best-effort preserves the currentTime so the song continues from the same moment.
     */
    setTrack(track: MusicTrackId): void {
        if (this.track === track) return;
        this.track = track;
        if (!this.audio) {
            this.initAudio();
            return;
        }

        const audio = this.audio;
        const wasPlaying = !audio.paused;
        const savedTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        const nextSrc = MUSIC_TRACKS[track];

        // If we are already on that src, do nothing.
        if (audio.src && audio.src.endsWith(nextSrc)) return;

        const applyTime = () => {
            const dur = audio.duration;
            if (Number.isFinite(dur) && dur > 0) {
                audio.currentTime = Math.min(savedTime, dur * 0.98);
            } else {
                audio.currentTime = savedTime;
            }
        };

        const onLoaded = () => {
            audio.removeEventListener('loadedmetadata', onLoaded);
            try {
                applyTime();
            } catch {
                // ignore
            }

            // Only resume if we were playing and there's a reason to be audible.
            if (wasPlaying && this.isEnabled && (this.currentVolume > 0 || this.targetVolume > 0)) {
                void audio.play().catch(() => { });
            }
        };

        audio.addEventListener('loadedmetadata', onLoaded);
        audio.src = nextSrc;
        audio.load();
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
        this.updatePlaybackRate(dt);
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

    private updatePlaybackRate(dt: number): void {
        if (!this.audio) return;

        // Compute target playback rate from:
        // - Speed factor (boost => faster tempo)
        // - Smoothed input intensity (no input => slow down while fading out, then pause)
        const sf = this.latestSpeedFactor;
        const normalizedSpeed = Math.max(0, Math.min(1, (sf - 1.0) / 1.35)); // 1.0..2.35 => 0..1
        const speedCurve = Math.pow(normalizedSpeed, 0.65);
        const movingRate =
            this.config.basePlaybackRate +
            (this.config.maxPlaybackRate - this.config.basePlaybackRate) * speedCurve;

        // Smoothly blend to idle rate as the player stops providing input.
        const intensity = Math.max(0, Math.min(1, this.smoothedIntensity));
        const intensityBlend = (() => {
            // Smoothstep(0.04..0.22)
            const t = Math.max(0, Math.min(1, (intensity - 0.04) / (0.22 - 0.04)));
            return t * t * (3 - 2 * t);
        })();

        const computedTarget =
            this.config.idlePlaybackRate +
            (movingRate - this.config.idlePlaybackRate) * intensityBlend;

        this.targetPlaybackRate = this.clampFinite(
            computedTarget,
            this.config.idlePlaybackRate,
            this.config.maxPlaybackRate
        );

        const diff = this.targetPlaybackRate - this.currentPlaybackRate;
        const speed = diff >= 0 ? this.config.playbackRateUpSpeed : this.config.playbackRateDownSpeed;

        if (Math.abs(diff) < 0.001) {
            this.currentPlaybackRate = this.targetPlaybackRate;
        } else {
            this.currentPlaybackRate += diff * speed * dt;
        }

        this.currentPlaybackRate = Math.max(this.config.idlePlaybackRate, Math.min(this.config.maxPlaybackRate, this.currentPlaybackRate));
        this.applyPlaybackRate();
    }

    private applyPlaybackRate(): void {
        if (!this.audio) return;
        this.audio.playbackRate = this.clampFinite(this.currentPlaybackRate, this.config.idlePlaybackRate, this.config.maxPlaybackRate);
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
