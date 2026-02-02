/**
 * Settings Manager - Handles game settings persistence
 */

export interface GameSettings {
    graphics: {
        quality: 'low' | 'medium' | 'high' | 'ultra';
        particles: boolean;
        showGrid: boolean;
        showMinimap: boolean;
    };
    audio: {
        masterVolume: number;
        sfxEnabled: boolean;
        sfxVolume: number;
        vibration: boolean;
    };
    controls: {
        joystickSize: number;
        joystickPosition: 'left' | 'right';
        sensitivity: number;
        mobileControlMode: 'joystick' | 'touch';
    };
    accessibility: {
        colorblindMode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';
        highContrast: boolean;
        reducedMotion: boolean;
        fontScale: number;
        language: 'en' | 'ar';
    };
}

type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type SettingsChangeCallback = (settings: GameSettings) => void;

const DEFAULT_SETTINGS: GameSettings = {
    graphics: {
        quality: 'high',
        particles: true,
        showGrid: true,
        showMinimap: true,
    },
    audio: {
        masterVolume: 80,
        sfxEnabled: true,
        sfxVolume: 70,
        vibration: true,
    },
    controls: {
        joystickSize: 120,
        joystickPosition: 'left',
        sensitivity: 5,
        mobileControlMode: 'joystick',
    },
    accessibility: {
        colorblindMode: 'none',
        highContrast: false,
        reducedMotion: false,
        fontScale: 100,
        language: 'en',
    },
};

export class SettingsManager {
    private settings: GameSettings;
    private listeners: Set<SettingsChangeCallback> = new Set();

    constructor() {
        this.settings = this.loadSettings();
        this.applySettings();
    }

    private cloneSettings(value: GameSettings): GameSettings {
        // Ensure callers never receive references to internal nested objects.
        // This prevents accidental mutation and makes cloud-sync snapshots stable.
        try {
            const sc = (globalThis as any).structuredClone as ((v: unknown) => unknown) | undefined;
            if (typeof sc === 'function') return sc(value) as GameSettings;
        } catch {
            // ignore
        }
        return JSON.parse(JSON.stringify(value)) as GameSettings;
    }

    private loadSettings(): GameSettings {
        return { ...DEFAULT_SETTINGS };
    }

    private mergeSettings(defaults: GameSettings, stored: DeepPartial<GameSettings>): GameSettings {
        return {
            graphics: { ...defaults.graphics, ...stored.graphics },
            audio: { ...defaults.audio, ...stored.audio },
            controls: { ...defaults.controls, ...stored.controls },
            accessibility: { ...defaults.accessibility, ...stored.accessibility },
        };
    }

    private saveSettings(): void {
        // No local persistence (in-memory only)
    }

    private applySettings(): void {
        const root = document.documentElement;
        const { accessibility, graphics } = this.settings;

        // Font scaling
        root.style.setProperty('--font-scale', `${accessibility.fontScale / 100}`);

        // High contrast
        root.classList.toggle('high-contrast', accessibility.highContrast);

        // Reduced motion
        root.classList.toggle('reduced-motion', accessibility.reducedMotion);

        // Colorblind mode
        root.dataset.colorblindMode = accessibility.colorblindMode;

        // Minimap visibility
        root.classList.toggle('hide-minimap', !graphics.showMinimap);

        // Quality presets
        root.dataset.quality = graphics.quality;
    }

    getSettings(): GameSettings {
        return this.cloneSettings(this.settings);
    }

    /**
     * Replace current settings from a remote (Supabase) source.
     * This keeps defaults for any missing fields and notifies listeners.
     */
    applyRemoteSettings(remote: unknown): void {
        if (!remote || typeof remote !== 'object') return;
        const merged = this.mergeSettings(DEFAULT_SETTINGS, remote as any);
        this.settings = merged;
        this.applySettings();
        this.notifyListeners();
    }

    updateSettings(partial: DeepPartial<GameSettings>): void {
        this.settings = this.mergeSettings(this.settings, partial);
        this.saveSettings();
        this.applySettings();
        this.notifyListeners();
    }

    resetSettings(): void {
        this.settings = { ...DEFAULT_SETTINGS };
        this.saveSettings();
        this.applySettings();
        this.notifyListeners();
    }

    subscribe(callback: SettingsChangeCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    private notifyListeners(): void {
        this.listeners.forEach(cb => cb(this.settings));
    }

    // Convenience getters
    get particlesEnabled(): boolean {
        return this.settings.graphics.particles;
    }

    get showGrid(): boolean {
        return this.settings.graphics.showGrid;
    }

    get vibrationEnabled(): boolean {
        return this.settings.audio.vibration;
    }

    get reducedMotion(): boolean {
        return this.settings.accessibility.reducedMotion;
    }

    get joystickSize(): number {
        return this.settings.controls.joystickSize;
    }

    get joystickPosition(): 'left' | 'right' {
        return this.settings.controls.joystickPosition;
    }

    get sensitivity(): number {
        return this.settings.controls.sensitivity;
    }
}
