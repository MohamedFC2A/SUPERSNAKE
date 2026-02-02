import { t, onLocaleChange } from '../../i18n';
import { SettingsManager, GameSettings } from '../../game/SettingsManager';
import { setLocale, getLocale } from '../../i18n';
import { applyUpdate, checkForUpdate } from '../../update/appUpdate';

/**
 * SettingsPage - Full page settings with all options
 */
export class SettingsPage {
    private container: HTMLElement;
    private settingsManager: SettingsManager;
    private unsubscribeLocale: (() => void) | null = null;
    private activeTab: string = 'audio';
    private showResetModal: boolean = false;
    private savedHintTimeout: number | null = null;
    private updateAvailable: boolean = false;
    private checkingUpdate: boolean = false;
    private updateError: string | null = null;
    private onVisibilityChange: (() => void) | null = null;

    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;
        this.container = document.createElement('div');
        this.container.className = 'page settings-page';
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.updateContent();
        });

        // Check updates when settings opens + when returning to the tab.
        void this.checkUpdatesIfNeeded();
        const handler = () => {
            if (document.visibilityState === 'visible') void this.checkUpdatesIfNeeded();
        };
        document.addEventListener('visibilitychange', handler);
        this.onVisibilityChange = () => document.removeEventListener('visibilitychange', handler);
    }

    private async checkUpdatesIfNeeded(): Promise<void> {
        if (this.checkingUpdate) return;
        this.checkingUpdate = true;
        const prevAvailable = this.updateAvailable;
        const prevError = this.updateError;

        const res = await checkForUpdate();
        this.updateAvailable = res.updateAvailable;
        this.updateError = res.error;
        this.checkingUpdate = false;

        // Re-render only when state changes (avoid disrupting sliders).
        if (prevAvailable !== this.updateAvailable || prevError !== this.updateError) {
            this.updateContent();
        }
    }

    private updateContent(): void {
        const settings = this.settingsManager.getSettings();

        this.container.innerHTML = `
            <div class="page-header page-header-split">
                <div class="page-header-left">
                    <h1 class="page-title">${t('settings.title')}</h1>
                    <p class="page-subtitle">${t('settings.subtitle')}</p>
                </div>
                <div class="page-actions">
                    <span class="status-pill status-pill-success" id="settingsSavedHint" hidden aria-live="polite">
                        ${t('settings.saved')}
                    </span>
                    <button class="btn btn-secondary btn-small" id="resetSettingsBtn" type="button">
                        ${t('settings.reset')}
                    </button>
                </div>
            </div>

            <div class="settings-tabs-container">
                <div class="settings-tabs" role="tablist">
                    <button class="settings-tab${this.activeTab === 'audio' ? ' active' : ''}" 
                            data-tab="audio" role="tab" aria-selected="${this.activeTab === 'audio'}">
                        <span class="tab-icon">🔊</span>
                        <span>${t('settings.audio')}</span>
                    </button>
                    <button class="settings-tab${this.activeTab === 'controls' ? ' active' : ''}" 
                            data-tab="controls" role="tab" aria-selected="${this.activeTab === 'controls'}">
                        <span class="tab-icon">🎮</span>
                        <span>${t('settings.controls')}</span>
                    </button>
                    <button class="settings-tab${this.activeTab === 'graphics' ? ' active' : ''}" 
                            data-tab="graphics" role="tab" aria-selected="${this.activeTab === 'graphics'}">
                        <span class="tab-icon">🖼️</span>
                        <span>${t('settings.graphics')}</span>
                    </button>
                    <button class="settings-tab${this.activeTab === 'accessibility' ? ' active' : ''}" 
                            data-tab="accessibility" role="tab" aria-selected="${this.activeTab === 'accessibility'}">
                        <span class="tab-icon">♿</span>
                        <span>${t('settings.accessibility')}</span>
                    </button>
                </div>

                <div class="settings-body">
                    ${this.renderTabContent(settings)}
                </div>
            </div>

            ${this.updateAvailable ? `
                <div class="settings-section">
                    <div class="setting-row">
                        <div>
                            <div class="section-title">${t('settings.updateTitle')}</div>
                            <div class="section-subtitle">${t('settings.updateSubtitle')}</div>
                            ${this.updateError ? `<div class="panel panel-warning" style="margin-top:10px;"><div class="panel-text">${this.escapeHtml(this.updateError)}</div></div>` : ''}
                        </div>
                        <div class="setting-control">
                            <button class="btn btn-primary" id="updateGameBtn" type="button">
                                ${this.checkingUpdate ? t('settings.updateChecking') : t('settings.updateButton')}
                            </button>
                        </div>
                    </div>
                </div>
            ` : ''}

            ${this.showResetModal ? this.renderResetModal() : ''}
        `;

        this.setupEventListeners();
    }

    private renderTabContent(settings: GameSettings): string {
        switch (this.activeTab) {
            case 'audio':
                return this.renderAudioTab(settings);
            case 'controls':
                return this.renderControlsTab(settings);
            case 'graphics':
                return this.renderGraphicsTab(settings);
            case 'accessibility':
                return this.renderAccessibilityTab(settings);
            default:
                return '';
        }
    }

    private renderAudioTab(settings: GameSettings): string {
        return `
            <div class="settings-section">
                <div class="setting-row">
                    <span class="setting-label">${t('settings.masterVolume')}</span>
                    <div class="setting-control slider">
                        <input type="range" id="masterVolume" min="0" max="100" value="${settings.audio.masterVolume}">
                        <span class="slider-value">${settings.audio.masterVolume}%</span>
                    </div>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.sfx')}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="sfxEnabled" ${settings.audio.sfxEnabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.sfxVolume')}</span>
                    <div class="setting-control slider">
                        <input type="range" id="sfxVolume" min="0" max="100" value="${settings.audio.sfxVolume}">
                        <span class="slider-value">${settings.audio.sfxVolume}%</span>
                    </div>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.vibration')}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="vibration" ${settings.audio.vibration ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
    }

    private renderControlsTab(settings: GameSettings): string {
        return `
            <div class="settings-section">
                <div class="setting-row">
                    <span class="setting-label">${t('settings.mobileControlMode')}</span>
                    <select class="setting-select" id="mobileControlMode">
                        <option value="joystick" ${settings.controls.mobileControlMode === 'joystick' ? 'selected' : ''}>${t('settings.mobileControlJoystick')}</option>
                        <option value="touch" ${settings.controls.mobileControlMode === 'touch' ? 'selected' : ''}>${t('settings.mobileControlTouch')}</option>
                    </select>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.joystickSize')}</span>
                    <div class="setting-control slider">
                        <input type="range" id="joystickSize" min="80" max="200" value="${settings.controls.joystickSize}">
                        <span class="slider-value">${settings.controls.joystickSize}px</span>
                    </div>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.joystickPosition')}</span>
                    <select class="setting-select" id="joystickPosition">
                        <option value="left" ${settings.controls.joystickPosition === 'left' ? 'selected' : ''}>${t('settings.left')}</option>
                        <option value="right" ${settings.controls.joystickPosition === 'right' ? 'selected' : ''}>${t('settings.right')}</option>
                    </select>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.sensitivity')}</span>
                    <div class="setting-control slider">
                        <input type="range" id="sensitivity" min="1" max="10" value="${settings.controls.sensitivity}">
                        <span class="slider-value">${settings.controls.sensitivity}</span>
                    </div>
                </div>

                ${settings.controls.mobileControlMode === 'touch' ? `
                    <div class="panel" style="margin-top: 10px;">
                        <div class="panel-title">${t('settings.touchHintTitle')}</div>
                        <div class="panel-text">${t('settings.touchHintText')}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    private renderGraphicsTab(settings: GameSettings): string {
        return `
            <div class="settings-section">
                    <div class="setting-row">
                        <span class="setting-label">${t('settings.quality')}</span>
                        <select class="setting-select" id="quality">
                            <option value="low" ${settings.graphics.quality === 'low' ? 'selected' : ''}>${t('settings.low')}</option>
                            <option value="medium" ${settings.graphics.quality === 'medium' ? 'selected' : ''}>${t('settings.medium')}</option>
                            <option value="high" ${settings.graphics.quality === 'high' ? 'selected' : ''}>${t('settings.high')}</option>
                            <option value="ultra" ${settings.graphics.quality === 'ultra' ? 'selected' : ''}>${t('settings.ultra')}</option>
                        </select>
                    </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.particles')}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="particles" ${settings.graphics.particles ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.showGrid')}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="showGrid" ${settings.graphics.showGrid ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.showMinimap')}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="showMinimap" ${settings.graphics.showMinimap ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
    }

    private renderAccessibilityTab(settings: GameSettings): string {
        const currentLocale = getLocale();
        return `
            <div class="settings-section">
                <div class="setting-row">
                    <span class="setting-label">${t('settings.language')}</span>
                    <select class="setting-select" id="language">
                        <option value="en" ${currentLocale === 'en' ? 'selected' : ''}>English</option>
                        <option value="ar" ${currentLocale === 'ar' ? 'selected' : ''}>العربية</option>
                    </select>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.colorblindMode')}</span>
                    <select class="setting-select" id="colorblindMode">
                        <option value="none" ${settings.accessibility.colorblindMode === 'none' ? 'selected' : ''}>${t('settings.none')}</option>
                        <option value="deuteranopia" ${settings.accessibility.colorblindMode === 'deuteranopia' ? 'selected' : ''}>Deuteranopia</option>
                        <option value="protanopia" ${settings.accessibility.colorblindMode === 'protanopia' ? 'selected' : ''}>Protanopia</option>
                        <option value="tritanopia" ${settings.accessibility.colorblindMode === 'tritanopia' ? 'selected' : ''}>Tritanopia</option>
                    </select>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.highContrast')}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="highContrast" ${settings.accessibility.highContrast ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.reducedMotion')}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="reducedMotion" ${settings.accessibility.reducedMotion ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="setting-row">
                    <span class="setting-label">${t('settings.fontScale')}</span>
                    <div class="setting-control slider">
                        <input type="range" id="fontScale" min="80" max="150" value="${settings.accessibility.fontScale}">
                        <span class="slider-value">${settings.accessibility.fontScale}%</span>
                    </div>
                </div>
            </div>
        `;
    }

    private setupEventListeners(): void {
        // Reset button
        const resetBtn = this.container.querySelector('#resetSettingsBtn');
        resetBtn?.addEventListener('click', () => {
            this.showResetModal = true;
            this.updateContent();
        });

        // Reset modal
        const cancelResetBtn = this.container.querySelector('#cancelResetBtn');
        cancelResetBtn?.addEventListener('click', () => {
            this.showResetModal = false;
            this.updateContent();
        });

        const confirmResetBtn = this.container.querySelector('#confirmResetBtn');
        confirmResetBtn?.addEventListener('click', () => {
            this.settingsManager.resetSettings();
            this.showResetModal = false;
            this.updateContent();
            this.showSavedHint();
        });

        // Tab switching
        this.container.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.getAttribute('data-tab');
                if (tabId) {
                    this.activeTab = tabId;
                    this.updateContent();
                }
            });
        });

        // Slider updates
        this.container.querySelectorAll('input[type="range"]').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                const valueDisplay = target.parentElement?.querySelector('.slider-value');
                if (valueDisplay) {
                    const suffix = target.id === 'sensitivity' ? '' : (target.id.includes('Volume') || target.id === 'fontScale' ? '%' : 'px');
                    valueDisplay.textContent = target.value + suffix;
                }
                this.handleSettingChange(target.id, parseInt(target.value));
            });
        });

        // Toggle switches
        this.container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                this.handleSettingChange(target.id, target.checked);
            });
        });

        // Select dropdowns
        this.container.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', (e) => {
                const target = e.target as HTMLSelectElement;
                this.handleSettingChange(target.id, target.value);
            });
        });

        const updateBtn = this.container.querySelector('#updateGameBtn') as HTMLButtonElement | null;
        updateBtn?.addEventListener('click', async () => {
            if (this.checkingUpdate) return;
            this.checkingUpdate = true;
            this.updateContent();
            await applyUpdate();
        });
    }

    private handleSettingChange(id: string, value: string | number | boolean): void {
        const settings = this.settingsManager.getSettings();

        switch (id) {
            // Audio
            case 'masterVolume':
                this.settingsManager.updateSettings({ audio: { ...settings.audio, masterVolume: value as number } });
                break;
            case 'sfxEnabled':
                this.settingsManager.updateSettings({ audio: { ...settings.audio, sfxEnabled: value as boolean } });
                break;
            case 'sfxVolume':
                this.settingsManager.updateSettings({ audio: { ...settings.audio, sfxVolume: value as number } });
                break;
            case 'vibration':
                this.settingsManager.updateSettings({ audio: { ...settings.audio, vibration: value as boolean } });
                break;

            // Controls
            case 'joystickSize':
                this.settingsManager.updateSettings({ controls: { ...settings.controls, joystickSize: value as number } });
                break;
            case 'joystickPosition':
                this.settingsManager.updateSettings({ controls: { ...settings.controls, joystickPosition: value as 'left' | 'right' } });
                break;
            case 'sensitivity':
                this.settingsManager.updateSettings({ controls: { ...settings.controls, sensitivity: value as number } });
                break;
            case 'mobileControlMode':
                this.settingsManager.updateSettings({ controls: { ...settings.controls, mobileControlMode: value as 'joystick' | 'touch' } });
                break;

            // Graphics
            case 'quality':
                this.settingsManager.updateSettings({ graphics: { ...settings.graphics, quality: value as 'low' | 'medium' | 'high' | 'ultra' } });
                break;
            case 'particles':
                this.settingsManager.updateSettings({ graphics: { ...settings.graphics, particles: value as boolean } });
                break;
            case 'showGrid':
                this.settingsManager.updateSettings({ graphics: { ...settings.graphics, showGrid: value as boolean } });
                break;
            case 'showMinimap':
                this.settingsManager.updateSettings({ graphics: { ...settings.graphics, showMinimap: value as boolean } });
                break;

            // Accessibility
            case 'language':
                setLocale(value as 'en' | 'ar');
                this.settingsManager.updateSettings({ accessibility: { ...settings.accessibility, language: value as 'en' | 'ar' } });
                break;
            case 'colorblindMode':
                this.settingsManager.updateSettings({ accessibility: { ...settings.accessibility, colorblindMode: value as 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia' } });
                break;
            case 'highContrast':
                this.settingsManager.updateSettings({ accessibility: { ...settings.accessibility, highContrast: value as boolean } });
                break;
            case 'reducedMotion':
                this.settingsManager.updateSettings({ accessibility: { ...settings.accessibility, reducedMotion: value as boolean } });
                break;
            case 'fontScale':
                this.settingsManager.updateSettings({ accessibility: { ...settings.accessibility, fontScale: value as number } });
                break;
        }

        this.showSavedHint();
    }

    private showSavedHint(): void {
        const el = this.container.querySelector('#settingsSavedHint') as HTMLElement | null;
        if (!el) return;

        el.hidden = false;
        if (this.savedHintTimeout) {
            window.clearTimeout(this.savedHintTimeout);
        }
        this.savedHintTimeout = window.setTimeout(() => {
            const current = this.container.querySelector('#settingsSavedHint') as HTMLElement | null;
            if (current) current.hidden = true;
        }, 1200);
    }

    private renderResetModal(): string {
        return `
            <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="resetModalTitle">
                <div class="modal-content">
                    <h2 class="modal-title" id="resetModalTitle">${t('settings.resetTitle')}</h2>
                    <p class="modal-description">${t('settings.resetDescription')}</p>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" id="cancelResetBtn" type="button">${t('settings.cancel')}</button>
                        <button class="btn btn-primary" id="confirmResetBtn" type="button">${t('settings.resetConfirm')}</button>
                    </div>
                </div>
            </div>
        `;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        this.unsubscribeLocale?.();
        this.onVisibilityChange?.();
        if (this.savedHintTimeout) {
            window.clearTimeout(this.savedHintTimeout);
            this.savedHintTimeout = null;
        }
    }
}
