/**
 * Settings Manager - Handles game settings persistence
 */

import { setLocale } from '../i18n';
import { applyTheme, type Theme } from '../theme/theme';
import { MathUtils } from '../utils/utils';
import { deleteCookie, getCookie, setCookie } from '../utils/cookies';
import type { GraphicsQuality } from './render/RenderOptions';

export interface GameSettings {
    ui: {
        theme: Theme;
    };
    graphics: {
        quality: GraphicsQuality;
        particles: boolean;
        showGrid: boolean;
        showMinimap: boolean;
    };
    audio: {
        masterVolume: number;
        sfxEnabled: boolean;
        sfxVolume: number;
        musicEnabled: boolean;
        musicVolume: number;
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
        musicEnabled: true,
        musicVolume: 50,
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
        if (!raw) {
            const derived = this.getDefaultSettingsForDevice();
            // Persist the derived defaults so the UX is stable across refreshes.
            this.persistDefaults(derived);
            return derived;
        }

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

    private getDefaultSettingsForDevice(): GameSettings {
        const s = this.cloneSettings(DEFAULT_SETTINGS);

        const isTouch = (() => {
            try {
                return (
                    (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
                    'ontouchstart' in window ||
                    navigator.maxTouchPoints > 0
                );
            } catch {
                return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            }
        })();

        const mem = (navigator as any).deviceMemory as number | undefined;
        const cores = navigator.hardwareConcurrency as number | undefined;
        const dpr = window.devicePixelRatio || 1;
        const minDim = Math.min(window.innerWidth, window.innerHeight);

        // Language default from browser
        const lang = (navigator.language || '').toLowerCase();
        s.accessibility.language = lang.startsWith('ar') ? 'ar' : 'en';

        // Vibration is a mobile-only enhancement (and can be annoying on desktop).
        s.audio.vibration = isTouch;

        // Pick a "best default" performance preset for the device.
        // Goal: great quality without stutter on typical hardware.
        const lowEnd = (typeof mem === 'number' && mem > 0 && mem <= 4) || (typeof cores === 'number' && cores > 0 && cores <= 4) || minDim < 720;

        if (isTouch) {
            // Mobile: avoid excessive DPR (costly) on high-DPI screens.
            s.graphics.quality = lowEnd ? 'medium' : 'high';
            s.graphics.showMinimap = minDim >= 740;
        } else {
            const strong = (typeof mem === 'number' && mem >= 8) || (typeof cores === 'number' && cores >= 8);
            // Desktop: ultra by default; super-ultra only for strong hardware and not-too-high DPR.
            s.graphics.quality = strong && dpr >= 2 ? 'super_ultra' : 'ultra';
            s.graphics.showMinimap = true;
        }

        return s;
    }

    private persistDefaults(settings: GameSettings): void {
        try {
            const payload = {
                v: PREFS_VERSION,
                settings,
                updatedAt: new Date().toISOString(),
            };
            const value = encodeURIComponent(JSON.stringify(payload));
            setCookie(PREFS_COOKIE, value, { maxAgeSeconds: PREFS_MAX_AGE_SECONDS, path: '/', sameSite: 'Lax' });
        } catch {
            // ignore
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

        const normalized: DeepPartial<GameSettings> = {};

        const theme: Theme | undefined = v?.ui?.theme === 'light' ? 'light' : v?.ui?.theme === 'dark' ? 'dark' : undefined;
        if (theme) normalized.ui = { theme };

        const graphics: DeepPartial<GameSettings['graphics']> = {};
        const quality =
            v?.graphics?.quality === 'low' ||
                v?.graphics?.quality === 'medium' ||
                v?.graphics?.quality === 'high' ||
                v?.graphics?.quality === 'ultra' ||
                v?.graphics?.quality === 'super_ultra'
                ? (v.graphics.quality === 'low' ? 'medium' : v.graphics.quality)
                : undefined;
        if (quality) graphics.quality = quality;
        if (typeof v?.graphics?.particles === 'boolean') graphics.particles = v.graphics.particles;
        if (typeof v?.graphics?.showGrid === 'boolean') graphics.showGrid = v.graphics.showGrid;
        if (typeof v?.graphics?.showMinimap === 'boolean') graphics.showMinimap = v.graphics.showMinimap;
        if (Object.keys(graphics).length > 0) normalized.graphics = graphics;

        const audio: DeepPartial<GameSettings['audio']> = {};
        if (Number.isFinite(v?.audio?.masterVolume)) audio.masterVolume = MathUtils.clamp(Math.round(v.audio.masterVolume), 0, 100);
        if (typeof v?.audio?.sfxEnabled === 'boolean') audio.sfxEnabled = v.audio.sfxEnabled;
        if (Number.isFinite(v?.audio?.sfxVolume)) audio.sfxVolume = MathUtils.clamp(Math.round(v.audio.sfxVolume), 0, 100);
        if (typeof v?.audio?.musicEnabled === 'boolean') audio.musicEnabled = v.audio.musicEnabled;
        if (Number.isFinite(v?.audio?.musicVolume)) audio.musicVolume = MathUtils.clamp(Math.round(v.audio.musicVolume), 0, 100);
        if (typeof v?.audio?.vibration === 'boolean') audio.vibration = v.audio.vibration;
        if (Object.keys(audio).length > 0) normalized.audio = audio;

        const controls: DeepPartial<GameSettings['controls']> = {};
        if (Number.isFinite(v?.controls?.joystickSize)) controls.joystickSize = MathUtils.clamp(Math.round(v.controls.joystickSize), 80, 180);
        const joystickPosition = v?.controls?.joystickPosition === 'left' || v?.controls?.joystickPosition === 'right' ? v.controls.joystickPosition : undefined;
        if (joystickPosition) controls.joystickPosition = joystickPosition;
        if (Number.isFinite(v?.controls?.sensitivity)) controls.sensitivity = MathUtils.clamp(Math.round(v.controls.sensitivity), 1, 10);
        const mobileControlMode = v?.controls?.mobileControlMode === 'joystick' || v?.controls?.mobileControlMode === 'touch' ? v.controls.mobileControlMode : undefined;
        if (mobileControlMode) controls.mobileControlMode = mobileControlMode;
        if (Object.keys(controls).length > 0) normalized.controls = controls;

        const accessibility: DeepPartial<GameSettings['accessibility']> = {};
        const colorblindMode =
            v?.accessibility?.colorblindMode === 'none' ||
                v?.accessibility?.colorblindMode === 'deuteranopia' ||
                v?.accessibility?.colorblindMode === 'protanopia' ||
                v?.accessibility?.colorblindMode === 'tritanopia'
                ? v.accessibility.colorblindMode
                : undefined;
        if (colorblindMode) accessibility.colorblindMode = colorblindMode;
        if (typeof v?.accessibility?.highContrast === 'boolean') accessibility.highContrast = v.accessibility.highContrast;
        if (typeof v?.accessibility?.reducedMotion === 'boolean') accessibility.reducedMotion = v.accessibility.reducedMotion;
        if (Number.isFinite(v?.accessibility?.fontScale)) accessibility.fontScale = MathUtils.clamp(Math.round(v.accessibility.fontScale), 80, 140);
        const language = v?.accessibility?.language === 'ar' || v?.accessibility?.language === 'en' ? v.accessibility.language : undefined;
        if (language) accessibility.language = language;
        if (Object.keys(accessibility).length > 0) normalized.accessibility = accessibility;

        return normalized;
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
        this.settings = this.mergeSettings(DEFAULT_SETTINGS, normalized as any);
        this.saveSettings();
        this.applySettings();
        this.notifyListeners();
    }

    updateSettings(partial: DeepPartial<GameSettings>): void {
        const merged = this.mergeSettings(this.settings, partial);
        const normalized = this.normalizeSettings(merged);
        this.settings = this.mergeSettings(DEFAULT_SETTINGS, normalized as any);
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
