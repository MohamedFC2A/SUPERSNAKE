/**
 * Settings Manager - Handles game settings persistence
 */

import { setLocale } from '../i18n';
import { applyTheme, type Theme } from '../theme/theme';
import { MathUtils } from '../utils/utils';
import { deleteCookie, getCookie, setCookie } from '../utils/cookies';

export interface GameSettings {
    ui: {
        theme: Theme;
    };
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

const PREFS_COOKIE = 'supersnake_prefs';
const PREFS_VERSION = 1;
const PREFS_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

const DEFAULT_SETTINGS: GameSettings = {
    ui: {
        theme: 'dark',
    },
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
    private persistTimer: number | null = null;

    constructor() {
        this.settings = this.loadSettings();
        this.applySettings();

        // Best-effort flush when the page is backgrounded.
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.persistNow();
        });
        window.addEventListener('pagehide', () => this.persistNow());
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
        const raw = getCookie(PREFS_COOKIE);
        if (!raw) return this.cloneSettings(DEFAULT_SETTINGS);

        try {
            const json = decodeURIComponent(raw);
            const parsed = JSON.parse(json) as any;
            if (!parsed || typeof parsed !== 'object' || parsed.v !== PREFS_VERSION) {
                return this.cloneSettings(DEFAULT_SETTINGS);
            }

            const normalized = this.normalizeSettings(parsed.settings);
            return this.mergeSettings(DEFAULT_SETTINGS, normalized as any);
        } catch {
            // Corrupted cookie: ignore and reset to defaults.
            try {
                deleteCookie(PREFS_COOKIE);
            } catch {
                // ignore
            }
            return this.cloneSettings(DEFAULT_SETTINGS);
        }
    }

    private mergeSettings(defaults: GameSettings, stored: DeepPartial<GameSettings>): GameSettings {
        return {
            ui: { ...defaults.ui, ...stored.ui },
            graphics: { ...defaults.graphics, ...stored.graphics },
            audio: { ...defaults.audio, ...stored.audio },
            controls: { ...defaults.controls, ...stored.controls },
            accessibility: { ...defaults.accessibility, ...stored.accessibility },
        };
    }

    private persistNow(): void {
        if (this.persistTimer) {
            window.clearTimeout(this.persistTimer);
            this.persistTimer = null;
        }
        try {
            const payload = {
                v: PREFS_VERSION,
                settings: this.settings,
                updatedAt: new Date().toISOString(),
            };
            const value = encodeURIComponent(JSON.stringify(payload));
            setCookie(PREFS_COOKIE, value, { maxAgeSeconds: PREFS_MAX_AGE_SECONDS, path: '/', sameSite: 'Lax' });
        } catch {
            // ignore (some privacy modes can block cookies)
        }
    }

    private saveSettings(): void {
        if (this.persistTimer) {
            window.clearTimeout(this.persistTimer);
        }
        this.persistTimer = window.setTimeout(() => {
            this.persistNow();
        }, 250);
    }

    private normalizeSettings(value: unknown): DeepPartial<GameSettings> {
        if (!value || typeof value !== 'object') return {};
        const v = value as any;

        const theme: Theme | undefined = v?.ui?.theme === 'light' ? 'light' : v?.ui?.theme === 'dark' ? 'dark' : undefined;
        const quality =
            v?.graphics?.quality === 'low' || v?.graphics?.quality === 'medium' || v?.graphics?.quality === 'high' || v?.graphics?.quality === 'ultra'
                ? v.graphics.quality
                : undefined;
        const language = v?.accessibility?.language === 'ar' || v?.accessibility?.language === 'en' ? v.accessibility.language : undefined;
        const colorblindMode =
            v?.accessibility?.colorblindMode === 'none' ||
            v?.accessibility?.colorblindMode === 'deuteranopia' ||
            v?.accessibility?.colorblindMode === 'protanopia' ||
            v?.accessibility?.colorblindMode === 'tritanopia'
                ? v.accessibility.colorblindMode
                : undefined;
        const joystickPosition = v?.controls?.joystickPosition === 'left' || v?.controls?.joystickPosition === 'right' ? v.controls.joystickPosition : undefined;
        const mobileControlMode = v?.controls?.mobileControlMode === 'joystick' || v?.controls?.mobileControlMode === 'touch' ? v.controls.mobileControlMode : undefined;

        const masterVolume =
            typeof v?.audio?.masterVolume === 'number' ? MathUtils.clamp(Math.round(v.audio.masterVolume), 0, 100) : undefined;
        const sfxVolume = typeof v?.audio?.sfxVolume === 'number' ? MathUtils.clamp(Math.round(v.audio.sfxVolume), 0, 100) : undefined;
        const joystickSize =
            typeof v?.controls?.joystickSize === 'number' ? MathUtils.clamp(Math.round(v.controls.joystickSize), 80, 180) : undefined;
        const sensitivity =
            typeof v?.controls?.sensitivity === 'number' ? MathUtils.clamp(Math.round(v.controls.sensitivity), 1, 10) : undefined;
        const fontScale =
            typeof v?.accessibility?.fontScale === 'number' ? MathUtils.clamp(Math.round(v.accessibility.fontScale), 80, 140) : undefined;

        return {
            ui: theme ? { theme } : undefined,
            graphics: {
                quality,
                particles: typeof v?.graphics?.particles === 'boolean' ? v.graphics.particles : undefined,
                showGrid: typeof v?.graphics?.showGrid === 'boolean' ? v.graphics.showGrid : undefined,
                showMinimap: typeof v?.graphics?.showMinimap === 'boolean' ? v.graphics.showMinimap : undefined,
            },
            audio: {
                masterVolume,
                sfxEnabled: typeof v?.audio?.sfxEnabled === 'boolean' ? v.audio.sfxEnabled : undefined,
                sfxVolume,
                vibration: typeof v?.audio?.vibration === 'boolean' ? v.audio.vibration : undefined,
            },
            controls: {
                joystickSize,
                joystickPosition,
                sensitivity,
                mobileControlMode,
            },
            accessibility: {
                colorblindMode,
                highContrast: typeof v?.accessibility?.highContrast === 'boolean' ? v.accessibility.highContrast : undefined,
                reducedMotion: typeof v?.accessibility?.reducedMotion === 'boolean' ? v.accessibility.reducedMotion : undefined,
                fontScale,
                language,
            },
        };
    }

    private applySettings(): void {
        const root = document.documentElement;
        const { accessibility, graphics, ui } = this.settings;

        // Theme
        applyTheme(ui.theme);

        // Language (stored in accessibility.language)
        try {
            setLocale(accessibility.language);
        } catch {
            // ignore
        }

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
        const normalized = this.normalizeSettings(remote);
        const merged = this.mergeSettings(DEFAULT_SETTINGS, normalized as any);
        this.settings = merged;
        this.saveSettings();
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
        this.settings = this.cloneSettings(DEFAULT_SETTINGS);
        this.saveSettings();
        this.applySettings();
        this.notifyListeners();
    }

    subscribe(callback: SettingsChangeCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    private notifyListeners(): void {
        const snapshot = this.cloneSettings(this.settings);
        this.listeners.forEach(cb => cb(snapshot));
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
