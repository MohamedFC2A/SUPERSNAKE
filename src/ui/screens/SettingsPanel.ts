import { BaseScreen } from './BaseScreen';
import type { SettingsManager, GameSettings } from '../../game/SettingsManager';
import { t, setLocale, getLocale, getAvailableLocales, onLocaleChange, type Locale } from '../../i18n';

export interface SettingsPanelOptions {
    onClose: () => void;
    settingsManager: SettingsManager;
}

/**
 * Settings Panel with categorized options
 */
export class SettingsPanel extends BaseScreen {
    private options: SettingsPanelOptions;
    private activeTab: string = 'graphics';
    private unsubscribeLocale: (() => void) | null = null;

    constructor(options: SettingsPanelOptions) {
        super('settings-panel');
        this.options = options;
    }

    render(): HTMLElement {
        this.container.className = 'settings-panel hidden';
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });

        return this.container;
    }

    private updateContent(): void {
        const settings = this.options.settingsManager.getSettings();

        this.container.innerHTML = `
            <div class="settings-overlay"></div>
            <div class="settings-content">
                <div class="settings-header">
                    <h2 class="settings-title">${t('settings.title')}</h2>
                    <button class="settings-close" id="settingsClose" aria-label="Close">✕</button>
                </div>
                
                <div class="settings-tabs" role="tablist">
                    <button class="settings-tab ${this.activeTab === 'graphics' ? 'active' : ''}" data-tab="graphics" role="tab">
                        <span class="tab-icon">🎨</span>
                        <span>${t('settings.tabs.graphics')}</span>
                    </button>
                    <button class="settings-tab ${this.activeTab === 'audio' ? 'active' : ''}" data-tab="audio" role="tab">
                        <span class="tab-icon">🔊</span>
                        <span>${t('settings.tabs.audio')}</span>
                    </button>
                    <button class="settings-tab ${this.activeTab === 'controls' ? 'active' : ''}" data-tab="controls" role="tab">
                        <span class="tab-icon">🎮</span>
                        <span>${t('settings.tabs.controls')}</span>
                    </button>
                    <button class="settings-tab ${this.activeTab === 'accessibility' ? 'active' : ''}" data-tab="accessibility" role="tab">
                        <span class="tab-icon">♿</span>
                        <span>${t('settings.tabs.accessibility')}</span>
                    </button>
                </div>
                
                <div class="settings-body" role="tabpanel">
                    ${this.renderTabContent(settings)}
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    private renderTabContent(settings: GameSettings): string {
        switch (this.activeTab) {
            case 'graphics':
                return this.renderGraphicsTab(settings);
            case 'audio':
                return this.renderAudioTab(settings);
            case 'controls':
                return this.renderControlsTab(settings);
            case 'accessibility':
                return this.renderAccessibilityTab(settings);
            default:
                return '';
        }
    }

    private renderGraphicsTab(settings: GameSettings): string {
        return `
            <div class="settings-section">
                <div class="setting-row">
                    <label class="setting-label">${t('settings.graphics.quality')}</label>
                    <div class="setting-control">
                        <select id="qualityPreset" class="setting-select">
                            <option value="low" ${settings.graphics.quality === 'low' ? 'selected' : ''}>${t('settings.graphics.qualityLow')}</option>
                            <option value="medium" ${settings.graphics.quality === 'medium' ? 'selected' : ''}>${t('settings.graphics.qualityMedium')}</option>
                            <option value="high" ${settings.graphics.quality === 'high' ? 'selected' : ''}>${t('settings.graphics.qualityHigh')}</option>
                            <option value="ultra" ${settings.graphics.quality === 'ultra' ? 'selected' : ''}>${t('settings.graphics.qualityUltra')}</option>
                        </select>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.graphics.particles')}</label>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="particlesEnabled" ${settings.graphics.particles ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.graphics.showGrid')}</label>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="gridEnabled" ${settings.graphics.showGrid ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.graphics.showMinimap')}</label>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="minimapEnabled" ${settings.graphics.showMinimap ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    private renderAudioTab(settings: GameSettings): string {
        return `
            <div class="settings-section">
                <div class="setting-row">
                    <label class="setting-label">${t('settings.audio.masterVolume')}</label>
                    <div class="setting-control slider">
                        <input type="range" id="masterVolume" min="0" max="100" value="${settings.audio.masterVolume}">
                        <span class="slider-value">${settings.audio.masterVolume}%</span>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.audio.sfxEnabled')}</label>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="sfxEnabled" ${settings.audio.sfxEnabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.audio.sfxVolume')}</label>
                    <div class="setting-control slider">
                        <input type="range" id="sfxVolume" min="0" max="100" value="${settings.audio.sfxVolume}">
                        <span class="slider-value">${settings.audio.sfxVolume}%</span>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.audio.vibration')}</label>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="vibrationEnabled" ${settings.audio.vibration ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    private renderControlsTab(settings: GameSettings): string {
        return `
            <div class="settings-section">
                <div class="setting-row">
                    <label class="setting-label">${t('settings.controls.joystickSize')}</label>
                    <div class="setting-control slider">
                        <input type="range" id="joystickSize" min="60" max="160" value="${settings.controls.joystickSize}">
                        <span class="slider-value">${settings.controls.joystickSize}px</span>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.controls.joystickPosition')}</label>
                    <div class="setting-control">
                        <select id="joystickPosition" class="setting-select">
                            <option value="left" ${settings.controls.joystickPosition === 'left' ? 'selected' : ''}>${t('settings.controls.positionLeft')}</option>
                            <option value="right" ${settings.controls.joystickPosition === 'right' ? 'selected' : ''}>${t('settings.controls.positionRight')}</option>
                        </select>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.controls.sensitivity')}</label>
                    <div class="setting-control slider">
                        <input type="range" id="sensitivity" min="1" max="10" value="${settings.controls.sensitivity}">
                        <span class="slider-value">${settings.controls.sensitivity}</span>
                    </div>
                </div>
            </div>
        `;
    }

    private renderAccessibilityTab(settings: GameSettings): string {
        const locales = getAvailableLocales();
        const currentLocale = getLocale();

        return `
            <div class="settings-section">
                <div class="setting-row">
                    <label class="setting-label">${t('settings.accessibility.language')}</label>
                    <div class="setting-control">
                        <select id="languageSelect" class="setting-select">
                            ${locales.map(loc => `
                                <option value="${loc.code}" ${currentLocale === loc.code ? 'selected' : ''}>${loc.name}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.accessibility.colorblindMode')}</label>
                    <div class="setting-control">
                        <select id="colorblindMode" class="setting-select">
                            <option value="none" ${settings.accessibility.colorblindMode === 'none' ? 'selected' : ''}>${t('settings.accessibility.colorblindNone')}</option>
                            <option value="deuteranopia" ${settings.accessibility.colorblindMode === 'deuteranopia' ? 'selected' : ''}>${t('settings.accessibility.colorblindDeuteranopia')}</option>
                            <option value="protanopia" ${settings.accessibility.colorblindMode === 'protanopia' ? 'selected' : ''}>${t('settings.accessibility.colorblindProtanopia')}</option>
                            <option value="tritanopia" ${settings.accessibility.colorblindMode === 'tritanopia' ? 'selected' : ''}>${t('settings.accessibility.colorblindTritanopia')}</option>
                        </select>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.accessibility.highContrast')}</label>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="highContrast" ${settings.accessibility.highContrast ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.accessibility.reducedMotion')}</label>
                    <div class="setting-control">
                        <label class="toggle-switch">
                            <input type="checkbox" id="reducedMotion" ${settings.accessibility.reducedMotion ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="setting-row">
                    <label class="setting-label">${t('settings.accessibility.fontScale')}</label>
                    <div class="setting-control slider">
                        <input type="range" id="fontScale" min="80" max="150" value="${settings.accessibility.fontScale}">
                        <span class="slider-value">${settings.accessibility.fontScale}%</span>
                    </div>
                </div>
            </div>
        `;
    }

    private setupEventListeners(): void {
        const closeBtn = this.container.querySelector('#settingsClose');
        closeBtn?.addEventListener('click', () => this.options.onClose());

        // Click overlay to close
        const overlay = this.container.querySelector('.settings-overlay');
        overlay?.addEventListener('click', () => this.options.onClose());

        // Tab switching
        const tabs = this.container.querySelectorAll('.settings-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.activeTab = (tab as HTMLElement).dataset.tab || 'graphics';
                this.updateContent();
            });
        });

        // Settings changes
        this.setupSettingsListeners();
    }

    private setupSettingsListeners(): void {
        const sm = this.options.settingsManager;

        // Language (special handling)
        const langSelect = this.container.querySelector('#languageSelect') as HTMLSelectElement;
        langSelect?.addEventListener('change', () => {
            const newLocale = langSelect.value as Locale;
            setLocale(newLocale);
            sm.updateSettings({ accessibility: { language: newLocale } });
        });

        // Graphics
        this.bindSelect('qualityPreset', (v) => sm.updateSettings({ graphics: { quality: v as 'low' | 'medium' | 'high' | 'ultra' } }));
        this.bindCheckbox('particlesEnabled', (v) => sm.updateSettings({ graphics: { particles: v } }));
        this.bindCheckbox('gridEnabled', (v) => sm.updateSettings({ graphics: { showGrid: v } }));
        this.bindCheckbox('minimapEnabled', (v) => sm.updateSettings({ graphics: { showMinimap: v } }));

        // Audio
        this.bindSlider('masterVolume', (v) => sm.updateSettings({ audio: { masterVolume: v } }), '%');
        this.bindCheckbox('sfxEnabled', (v) => sm.updateSettings({ audio: { sfxEnabled: v } }));
        this.bindSlider('sfxVolume', (v) => sm.updateSettings({ audio: { sfxVolume: v } }), '%');
        this.bindCheckbox('vibrationEnabled', (v) => sm.updateSettings({ audio: { vibration: v } }));

        // Controls
        this.bindSlider('joystickSize', (v) => sm.updateSettings({ controls: { joystickSize: v } }), 'px');
        this.bindSelect('joystickPosition', (v) => sm.updateSettings({ controls: { joystickPosition: v as 'left' | 'right' } }));
        this.bindSlider('sensitivity', (v) => sm.updateSettings({ controls: { sensitivity: v } }));

        // Accessibility
        this.bindSelect('colorblindMode', (v) => sm.updateSettings({ accessibility: { colorblindMode: v as any } }));
        this.bindCheckbox('highContrast', (v) => sm.updateSettings({ accessibility: { highContrast: v } }));
        this.bindCheckbox('reducedMotion', (v) => sm.updateSettings({ accessibility: { reducedMotion: v } }));
        this.bindSlider('fontScale', (v) => sm.updateSettings({ accessibility: { fontScale: v } }), '%');
    }

    private bindCheckbox(id: string, callback: (value: boolean) => void): void {
        const el = this.container.querySelector(`#${id}`) as HTMLInputElement;
        el?.addEventListener('change', () => callback(el.checked));
    }

    private bindSlider(id: string, callback: (value: number) => void, suffix: string = ''): void {
        const el = this.container.querySelector(`#${id}`) as HTMLInputElement;
        const valueEl = el?.nextElementSibling;
        el?.addEventListener('input', () => {
            const value = parseInt(el.value);
            if (valueEl) valueEl.textContent = `${value}${suffix}`;
            callback(value);
        });
    }

    private bindSelect(id: string, callback: (value: string) => void): void {
        const el = this.container.querySelector(`#${id}`) as HTMLSelectElement;
        el?.addEventListener('change', () => callback(el.value));
    }

    destroy(): void {
        this.unsubscribeLocale?.();
    }
}
