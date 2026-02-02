import { BaseScreen } from './BaseScreen';
import { t, getLocale, onLocaleChange } from '../../i18n';
import { getChangelogManager, ChangelogEntry } from '../../game/ChangelogManager';

export interface ChangelogPageOptions {
    onBack: () => void;
}

// Rate limiting for password attempts
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30000; // 30 seconds

/**
 * Changelog Page - Shows update history with Developer Mode for CRUD
 * 
 * ⚠️ Developer Mode is LOCAL-ONLY and NOT secure for production.
 * The password gate can be bypassed by anyone inspecting the source code.
 */
export class ChangelogPage extends BaseScreen {
    private options: ChangelogPageOptions;
    private unsubscribeLocale: (() => void) | null = null;
    private unsubscribeChangelog: (() => void) | null = null;
    private loading: boolean = true;

    // Developer mode state
    private isDeveloperMode: boolean = false;
    private showPasswordModal: boolean = false;
    private passwordError: string = '';
    private failedAttempts: number = 0;
    private lockedUntil: number = 0;

    // Edit state
    private editingEntry: ChangelogEntry | null = null;
    private showAddForm: boolean = false;

    constructor(options: ChangelogPageOptions) {
        super('changelog-page');
        this.options = options;
    }

    render(): HTMLElement {
        this.container.className = 'changelog-screen hidden';
        this.updateContent();

        this.unsubscribeLocale = onLocaleChange(() => {
            this.loadChangelog();
        });

        this.unsubscribeChangelog = getChangelogManager().subscribe(() => {
            this.updateContent();
        });

        return this.container;
    }

    private updateContent(): void {
        const entries = getChangelogManager().getAll();
        const isLockedOut = Date.now() < this.lockedUntil;

        this.container.innerHTML = `
            <div class="changelog-header">
                <button class="changelog-back" id="changelogBack">
                    <span>←</span>
                    <span>${t('changelog.back')}</span>
                </button>
                <h1 class="changelog-title">${t('changelog.title')}</h1>
            </div>
            <div class="changelog-content">
                <div class="changelog-entries" id="changelogEntries">
                    ${this.loading ? this.renderLoading() : this.renderEntries(entries)}
                </div>
                
                ${this.isDeveloperMode ? this.renderDevPanel(entries) : ''}
            </div>
            
            ${!this.isDeveloperMode ? `
                <button class="dev-button" id="devModeBtn">${t('developer.title')}</button>
            ` : ''}
            
            ${this.showPasswordModal ? this.renderPasswordModal(isLockedOut) : ''}
        `;

        this.setupEventListeners();
    }

    private renderLoading(): string {
        return `<p style="text-align: center; color: var(--text-muted);">Loading...</p>`;
    }

    private renderEntries(entries: ChangelogEntry[]): string {
        if (entries.length === 0) {
            return `<p style="text-align: center; color: var(--text-muted);">No changelog entries found.</p>`;
        }

        return entries.map(entry => `
            <div class="changelog-entry" data-id="${entry.id}">
                <div class="changelog-version">${entry.version}</div>
                <div class="changelog-date">${entry.date}</div>
                ${entry.title ? `<div class="changelog-entry-title">${entry.title}</div>` : ''}
                ${entry.description ? `<p class="changelog-description">${entry.description}</p>` : ''}
                ${entry.added?.length ? this.renderSection('Added', 'added', entry.added) : ''}
                ${entry.changed?.length ? this.renderSection('Changed', 'changed', entry.changed) : ''}
                ${entry.fixed?.length ? this.renderSection('Fixed', 'fixed', entry.fixed) : ''}
                ${entry.removed?.length ? this.renderSection('Removed', 'removed', entry.removed) : ''}
                
                ${this.isDeveloperMode ? `
                    <div class="dev-entry-actions">
                        <button class="dev-entry-btn edit-btn" data-id="${entry.id}">Edit</button>
                        <button class="dev-entry-btn danger delete-btn" data-id="${entry.id}">Delete</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    private renderSection(title: string, className: string, items: string[]): string {
        return `
            <div class="changelog-section">
                <h3 class="changelog-section-title ${className}">${title}</h3>
                <ul class="changelog-items">
                    ${items.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    private renderPasswordModal(isLockedOut: boolean): string {
        const remainingSeconds = Math.ceil((this.lockedUntil - Date.now()) / 1000);

        return `
            <div class="password-modal" id="passwordModal">
                <div class="password-content">
                    <h2 class="password-title">${t('developer.enterPassword')}</h2>
                    
                    ${isLockedOut ? `
                        <p class="password-error">${t('developer.lockedOut')} ${remainingSeconds}s</p>
                    ` : `
                        <input type="password" class="password-input" id="passwordInput" 
                               placeholder="••••" maxlength="10" autocomplete="off">
                        ${this.passwordError ? `<p class="password-error">${this.passwordError}</p>` : ''}
                    `}
                    
                    <div class="password-actions">
                        <button class="btn" id="cancelPasswordBtn" style="background: var(--ui-border); color: var(--text-primary);">
                            ${t('developer.cancel')}
                        </button>
                        ${!isLockedOut ? `
                            <button class="btn btn-primary" id="submitPasswordBtn">
                                ${t('developer.unlock')}
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    private renderDevPanel(entries: ChangelogEntry[]): string {
        return `
            <div class="dev-panel">
                <div class="dev-panel-header">
                    <span class="dev-panel-title">${t('developer.title')}</span>
                    <button class="dev-entry-btn" id="exitDevMode">${t('developer.logout')}</button>
                </div>
                
                <div class="dev-warning">${t('developer.warning')}</div>
                
                ${this.showAddForm || this.editingEntry ? this.renderEntryForm() : `
                    <button class="btn btn-primary" id="addEntryBtn" style="width: 100%;">
                        ${t('developer.addEntry')}
                    </button>
                `}
            </div>
        `;
    }

    private renderEntryForm(): string {
        const entry = this.editingEntry;
        const isEdit = !!entry;

        return `
            <div class="dev-form">
                <h3 style="color: var(--text-primary); margin-bottom: var(--space-m);">
                    ${isEdit ? t('developer.editEntry') : t('developer.addEntry')}
                </h3>
                
                <div class="dev-form-row">
                    <label class="dev-form-label">${t('developer.version')}</label>
                    <input type="text" class="dev-form-input" id="formVersion" 
                           value="${entry?.version || ''}" placeholder="1.0.0">
                </div>
                
                <div class="dev-form-row">
                    <label class="dev-form-label">${t('developer.title_field')}</label>
                    <input type="text" class="dev-form-input" id="formTitle" 
                           value="${entry?.title || ''}" placeholder="Update title">
                </div>
                
                <div class="dev-form-row">
                    <label class="dev-form-label">${t('developer.date')}</label>
                    <input type="text" class="dev-form-input" id="formDate" 
                           value="${entry?.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}" 
                           placeholder="January 1, 2026">
                </div>
                
                <div class="dev-form-row">
                    <label class="dev-form-label">${t('developer.description')}</label>
                    <textarea class="dev-form-input dev-form-textarea" id="formDescription" 
                              placeholder="Optional description">${entry?.description || ''}</textarea>
                </div>
                
                <div class="dev-form-row">
                    <label class="dev-form-label">${t('developer.added')} (one per line)</label>
                    <textarea class="dev-form-input dev-form-textarea" id="formAdded" 
                              placeholder="New feature 1\nNew feature 2">${entry?.added?.join('\n') || ''}</textarea>
                </div>
                
                <div class="dev-form-row">
                    <label class="dev-form-label">${t('developer.changed')} (one per line)</label>
                    <textarea class="dev-form-input dev-form-textarea" id="formChanged" 
                              placeholder="Changed feature 1">${entry?.changed?.join('\n') || ''}</textarea>
                </div>
                
                <div class="dev-form-row">
                    <label class="dev-form-label">${t('developer.fixed')} (one per line)</label>
                    <textarea class="dev-form-input dev-form-textarea" id="formFixed" 
                              placeholder="Bug fix 1">${entry?.fixed?.join('\n') || ''}</textarea>
                </div>
                
                <div class="password-actions" style="margin-top: var(--space-m);">
                    <button class="btn" id="cancelFormBtn" style="background: var(--ui-border); color: var(--text-primary);">
                        ${t('developer.cancel')}
                    </button>
                    <button class="btn btn-primary" id="saveFormBtn">
                        ${t('developer.save')}
                    </button>
                </div>
            </div>
        `;
    }

    private setupEventListeners(): void {
        const backBtn = this.container.querySelector('#changelogBack');
        backBtn?.addEventListener('click', () => this.options.onBack());

        // Developer mode button
        const devBtn = this.container.querySelector('#devModeBtn');
        devBtn?.addEventListener('click', () => {
            this.showPasswordModal = true;
            this.passwordError = '';
            this.updateContent();

            // Focus password input after render
            setTimeout(() => {
                const input = this.container.querySelector('#passwordInput') as HTMLInputElement;
                input?.focus();
            }, 100);
        });

        // Password modal
        const cancelPasswordBtn = this.container.querySelector('#cancelPasswordBtn');
        cancelPasswordBtn?.addEventListener('click', () => {
            this.showPasswordModal = false;
            this.passwordError = '';
            this.updateContent();
        });

        const submitPasswordBtn = this.container.querySelector('#submitPasswordBtn');
        submitPasswordBtn?.addEventListener('click', () => this.handlePasswordSubmit());

        const passwordInput = this.container.querySelector('#passwordInput') as HTMLInputElement;
        passwordInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handlePasswordSubmit();
        });

        // Exit developer mode
        const exitDevBtn = this.container.querySelector('#exitDevMode');
        exitDevBtn?.addEventListener('click', () => {
            this.isDeveloperMode = false;
            this.showAddForm = false;
            this.editingEntry = null;
            this.updateContent();
        });

        // Add entry button
        const addEntryBtn = this.container.querySelector('#addEntryBtn');
        addEntryBtn?.addEventListener('click', () => {
            this.showAddForm = true;
            this.editingEntry = null;
            this.updateContent();
        });

        // Edit buttons
        this.container.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (id) {
                    this.editingEntry = getChangelogManager().getById(id) || null;
                    this.showAddForm = false;
                    this.updateContent();
                }
            });
        });

        // Delete buttons
        this.container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (id && confirm(t('developer.confirmDelete'))) {
                    getChangelogManager().delete(id);
                }
            });
        });

        // Form buttons
        const cancelFormBtn = this.container.querySelector('#cancelFormBtn');
        cancelFormBtn?.addEventListener('click', () => {
            this.showAddForm = false;
            this.editingEntry = null;
            this.updateContent();
        });

        const saveFormBtn = this.container.querySelector('#saveFormBtn');
        saveFormBtn?.addEventListener('click', () => this.handleFormSave());
    }

    private async handlePasswordSubmit(): Promise<void> {
        const input = this.container.querySelector('#passwordInput') as HTMLInputElement;
        if (!input) return;

        const password = input.value;

        // Check lockout
        if (Date.now() < this.lockedUntil) {
            return;
        }

        const isValid = await getChangelogManager().verifyPassword(password);

        if (isValid) {
            this.isDeveloperMode = true;
            this.showPasswordModal = false;
            this.passwordError = '';
            this.failedAttempts = 0;
            this.updateContent();
        } else {
            this.failedAttempts++;

            if (this.failedAttempts >= MAX_ATTEMPTS) {
                this.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
                this.failedAttempts = 0;
            }

            this.passwordError = t('developer.wrongPassword');
            this.updateContent();

            // Focus input again
            setTimeout(() => {
                const newInput = this.container.querySelector('#passwordInput') as HTMLInputElement;
                newInput?.focus();
                newInput?.select();
            }, 100);
        }
    }

    private handleFormSave(): void {
        const version = (this.container.querySelector('#formVersion') as HTMLInputElement)?.value.trim();
        const title = (this.container.querySelector('#formTitle') as HTMLInputElement)?.value.trim();
        const date = (this.container.querySelector('#formDate') as HTMLInputElement)?.value.trim();
        const description = (this.container.querySelector('#formDescription') as HTMLTextAreaElement)?.value.trim();
        const added = this.parseTextareaToArray('#formAdded');
        const changed = this.parseTextareaToArray('#formChanged');
        const fixed = this.parseTextareaToArray('#formFixed');

        if (!version) {
            alert('Version is required');
            return;
        }

        const entryData: Omit<ChangelogEntry, 'id'> = {
            version,
            title: title || `Version ${version}`,
            date: date || new Date().toLocaleDateString(),
            description: description || undefined,
            added: added.length > 0 ? added : undefined,
            changed: changed.length > 0 ? changed : undefined,
            fixed: fixed.length > 0 ? fixed : undefined,
        };

        const manager = getChangelogManager();

        if (this.editingEntry) {
            manager.update(this.editingEntry.id, entryData);
        } else {
            manager.add(entryData);
        }

        this.showAddForm = false;
        this.editingEntry = null;
        this.updateContent();
    }

    private parseTextareaToArray(selector: string): string[] {
        const textarea = this.container.querySelector(selector) as HTMLTextAreaElement;
        if (!textarea) return [];

        return textarea.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }

    async loadChangelog(): Promise<void> {
        this.loading = true;
        this.updateContent();

        try {
            const manager = getChangelogManager();

            // Seed from JSON if not already seeded
            if (!manager.isSeeded()) {
                const locale = getLocale();
                const filename = locale === 'ar' ? 'CHANGELOG.ar.json' : 'CHANGELOG.en.json';

                try {
                    const response = await fetch(`/${filename}`);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.entries) {
                            await manager.seedFromArray(data.entries);
                        }
                    }
                } catch (fetchError) {
                    console.warn('Could not fetch changelog file:', fetchError);
                }
            }
        } catch (error) {
            console.error('Failed to load changelog:', error);
        }

        this.loading = false;
        this.updateContent();
    }

    show(): void {
        super.show();
        this.loadChangelog();
    }

    destroy(): void {
        this.unsubscribeLocale?.();
        this.unsubscribeChangelog?.();
    }
}
