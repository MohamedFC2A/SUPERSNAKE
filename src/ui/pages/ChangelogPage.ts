import { t, onLocaleChange } from '../../i18n';
import { getRouter } from '../../router';
import {
    getChangelogStore,
    ChangelogEntry,
    isDevModeActive,
    deactivateDevMode,
    verifyPassword,
    isLockedOut,
    getLockoutTimeRemaining,
    getRemainingAttempts,
    formatTimeRemaining,
    validateEntry
} from '../../changelog';

/**
 * ChangelogPage - Displays version history with Developer Mode for CRUD
 * 
 * ⚠️ DEVELOPER MODE WARNING:
 * The password gate is CLIENT-SIDE and NOT secure for production.
 * Anyone can extract the password by inspecting the source code.
 * This feature is intended for LOCAL/DEV admin use only.
 */
export class ChangelogPage {
    private container: HTMLElement;
    private unsubscribeLocale: (() => void) | null = null;
    private unsubscribeStore: (() => void) | null = null;

    private query: string = '';

    // Modal state
    private showPasswordModal = false;
    private passwordError = '';
    private showAddForm = false;
    private editingId: string | null = null;

    // Lockout timer
    private lockoutInterval: number | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'page changelog-page';
        this.render();

        this.unsubscribeLocale = onLocaleChange(() => this.render());
        this.unsubscribeStore = getChangelogStore().subscribe(() => this.render());
    }

    private render(): void {
        const store = getChangelogStore();
        const entries = store.list();
        const filtered = this.filterEntries(entries, this.query);
        const devMode = isDevModeActive();
        const locked = isLockedOut();

        this.container.innerHTML = `
            <div class="page-header page-header-split">
                <div class="page-header-left">
                    <h1 class="page-title">${t('changelog.title')}</h1>
                    <p class="page-subtitle">${t('changelog.subtitle')}</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-secondary btn-small" id="changelogBackBtn" type="button">
                        ${t('changelog.back')}
                    </button>
                </div>
            </div>

            <div class="changelog-toolbar" role="search">
                <div class="changelog-search">
                    <input class="form-input changelog-search-input" id="changelogSearchInput"
                           type="search" value="${this.escapeAttr(this.query)}"
                           placeholder="${t('changelog.searchPlaceholder')}" autocomplete="off" />
                    ${this.query ? `<button class="btn-small changelog-clear" id="changelogClearBtn" type="button" aria-label="Clear search">×</button>` : ''}
                </div>
                <div class="changelog-meta">
                    <span class="changelog-count">
                        ${t('changelog.showing', { shown: filtered.length, total: entries.length })}
                    </span>
                </div>
            </div>
            
            <div class="changelog-entries">
                ${filtered.length === 0
                ? `<p class="changelog-empty">${t('changelog.empty')}</p>`
                : filtered.map(e => this.renderEntry(e, devMode)).join('')
            }
            </div>
            
            ${devMode ? this.renderDevPanel() : ''}
            
            ${!devMode ? `
                <button class="dev-trigger-btn" id="devTriggerBtn" aria-label="Open Developer Mode">
                    ${t('changelog.developerButton')}
                </button>
            ` : ''}
            
            ${this.showPasswordModal ? this.renderPasswordModal(locked) : ''}
            ${this.showAddForm || this.editingId ? this.renderEntryModal() : ''}
        `;

        this.attachEventListeners();

        // Start lockout timer if needed
        if (locked && !this.lockoutInterval) {
            this.startLockoutTimer();
        }
    }

    private renderEntry(entry: ChangelogEntry, devMode: boolean): string {
        const formattedDate = new Date(entry.date).toLocaleDateString(document.documentElement.lang || undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        return `
            <article class="changelog-entry" data-id="${entry.id}">
                <header class="changelog-entry-header">
                    <span class="changelog-version">v${entry.version}</span>
                    <span class="changelog-date">${formattedDate}</span>
                </header>
                <h2 class="changelog-entry-title">${entry.title}</h2>
                ${entry.description ? `<p class="changelog-description">${entry.description}</p>` : ''}
                
                ${this.renderSection(t('developer.added'), 'added', entry.added)}
                ${this.renderSection(t('developer.changed'), 'changed', entry.changed)}
                ${this.renderSection(t('developer.fixed'), 'fixed', entry.fixed)}
                
                ${devMode ? `
                    <div class="changelog-entry-actions">
                        <button class="btn-small btn-edit" data-action="edit" data-id="${entry.id}">${t('developer.editEntry')}</button>
                        <button class="btn-small btn-delete" data-action="delete" data-id="${entry.id}">${t('developer.deleteEntry')}</button>
                    </div>
                ` : ''}
            </article>
        `;
    }

    private renderSection(title: string, className: string, items?: string[]): string {
        if (!items || items.length === 0) return '';

        return `
            <div class="changelog-section changelog-${className}">
                <h3 class="changelog-section-title">${title}</h3>
                <ul class="changelog-section-list">
                    ${items.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    private renderDevPanel(): string {
        return `
            <div class="dev-panel" role="region" aria-label="Developer Panel">
                <div class="dev-panel-header">
                    <h2 class="dev-panel-title">🔧 ${t('developer.title')}</h2>
                    <button class="btn-small" id="devLogoutBtn">${t('developer.logout')}</button>
                </div>
                
                <div class="dev-warning" role="alert">${t('developer.warning')}</div>
                
                <div class="dev-actions">
                    <button class="btn btn-primary" id="addEntryBtn">+ ${t('developer.addEntry')}</button>
                    <button class="btn btn-secondary" id="resetSeedBtn">${t('developer.resetSeed')}</button>
                </div>
            </div>
        `;
    }

    private renderPasswordModal(locked: boolean): string {
        const remaining = getRemainingAttempts();
        const lockoutTime = formatTimeRemaining(getLockoutTimeRemaining());

        return `
            <div class="modal-overlay" id="passwordModal" role="dialog" aria-modal="true" aria-labelledby="passwordModalTitle">
                <div class="modal-content">
                    <h2 class="modal-title" id="passwordModalTitle">${t('developer.title')}</h2>
                    
                    ${locked ? `
                        <p class="modal-error" role="alert">
                            ${t('developer.lockedOut')} <span id="lockoutTimer">${lockoutTime}</span>
                        </p>
                    ` : `
                        <p class="modal-description">${t('developer.enterPassword')}</p>
                        
                        <div class="form-group">
                            <label for="passwordInput" class="form-label">${t('developer.enterPassword')}</label>
                            <input type="password" id="passwordInput" class="form-input" 
                                   placeholder="••••" autocomplete="off" autofocus>
                        </div>
                        
                        ${this.passwordError ? `
                            <p class="modal-error" role="alert">${this.passwordError}</p>
                        ` : ''}
                        
                        <p class="modal-hint">${t('developer.attemptsRemaining', { count: remaining })}</p>
                    `}
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary" id="cancelPasswordBtn">${t('developer.cancel')}</button>
                        ${!locked ? `
                            <button class="btn btn-primary" id="submitPasswordBtn">${t('developer.unlock')}</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    private renderEntryModal(): string {
        const isEdit = !!this.editingId;
        const entry = isEdit ? getChangelogStore().get(this.editingId!) : null;

        return `
            <div class="modal-overlay" id="entryModal" role="dialog" aria-modal="true" aria-labelledby="entryModalTitle">
                <div class="modal-content modal-large">
                    <h2 class="modal-title" id="entryModalTitle">
                        ${isEdit ? t('developer.editEntry') : t('developer.addEntry')}
                    </h2>
                    
                    <form id="entryForm" class="entry-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="entryVersion" class="form-label">${t('developer.version')} *</label>
                                <input type="text" id="entryVersion" class="form-input" 
                                       value="${entry?.version || ''}" placeholder="1.0.0" required>
                            </div>
                            <div class="form-group">
                                <label for="entryDate" class="form-label">${t('developer.date')}</label>
                                <input type="date" id="entryDate" class="form-input" 
                                       value="${entry?.date || new Date().toISOString().split('T')[0]}">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label for="entryTitle" class="form-label">${t('developer.title_field')} *</label>
                            <input type="text" id="entryTitle" class="form-input" 
                                   value="${entry?.title || ''}" placeholder="Update title" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="entryDescription" class="form-label">${t('developer.description')}</label>
                            <textarea id="entryDescription" class="form-input form-textarea" 
                                      placeholder="Optional description">${entry?.description || ''}</textarea>
                        </div>
                        
                        <div class="form-group">
                            <label for="entryAdded" class="form-label">${t('developer.added')} (${t('changelog.onePerLine')})</label>
                            <textarea id="entryAdded" class="form-input form-textarea" 
                                      placeholder="New feature 1&#10;New feature 2">${entry?.added?.join('\n') || ''}</textarea>
                        </div>
                        
                        <div class="form-group">
                            <label for="entryChanged" class="form-label">${t('developer.changed')} (${t('changelog.onePerLine')})</label>
                            <textarea id="entryChanged" class="form-input form-textarea" 
                                      placeholder="Changed feature">${entry?.changed?.join('\n') || ''}</textarea>
                        </div>
                        
                        <div class="form-group">
                            <label for="entryFixed" class="form-label">${t('developer.fixed')} (${t('changelog.onePerLine')})</label>
                            <textarea id="entryFixed" class="form-input form-textarea" 
                                      placeholder="Bug fix">${entry?.fixed?.join('\n') || ''}</textarea>
                        </div>
                        
                        <div class="form-error" id="formError" hidden></div>
                        
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" id="cancelEntryBtn">${t('developer.cancel')}</button>
                            <button type="submit" class="btn btn-primary">
                                ${t('developer.save')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    private attachEventListeners(): void {
        // Back button
        const backBtn = this.container.querySelector('#changelogBackBtn');
        backBtn?.addEventListener('click', () => getRouter().navigate('/'));

        // Search
        const searchInput = this.container.querySelector('#changelogSearchInput') as HTMLInputElement | null;
        searchInput?.addEventListener('input', () => {
            this.query = searchInput.value;
            this.render();
            // Restore focus/caret
            const next = this.container.querySelector('#changelogSearchInput') as HTMLInputElement | null;
            if (next) {
                next.focus();
                next.setSelectionRange(this.query.length, this.query.length);
            }
        });

        const clearBtn = this.container.querySelector('#changelogClearBtn');
        clearBtn?.addEventListener('click', () => {
            this.query = '';
            this.render();
            const next = this.container.querySelector('#changelogSearchInput') as HTMLInputElement | null;
            next?.focus();
        });

        // Developer trigger button
        const devTriggerBtn = this.container.querySelector('#devTriggerBtn');
        devTriggerBtn?.addEventListener('click', () => this.openPasswordModal());

        // Password modal
        const cancelPasswordBtn = this.container.querySelector('#cancelPasswordBtn');
        cancelPasswordBtn?.addEventListener('click', () => this.closePasswordModal());

        const submitPasswordBtn = this.container.querySelector('#submitPasswordBtn');
        submitPasswordBtn?.addEventListener('click', () => this.handlePasswordSubmit());

        const passwordInput = this.container.querySelector('#passwordInput') as HTMLInputElement;
        passwordInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handlePasswordSubmit();
            }
        });

        // Password modal keyboard handling
        const passwordModal = this.container.querySelector('#passwordModal');
        passwordModal?.addEventListener('keydown', (e: Event) => {
            if ((e as KeyboardEvent).key === 'Escape') {
                this.closePasswordModal();
            }
        });

        // Dev panel actions
        const devLogoutBtn = this.container.querySelector('#devLogoutBtn');
        devLogoutBtn?.addEventListener('click', () => {
            deactivateDevMode();
            this.render();
        });

        const addEntryBtn = this.container.querySelector('#addEntryBtn');
        addEntryBtn?.addEventListener('click', () => {
            this.showAddForm = true;
            this.editingId = null;
            this.render();
            // Focus first input
            setTimeout(() => {
                const input = this.container.querySelector('#entryVersion') as HTMLInputElement;
                input?.focus();
            }, 50);
        });

        const resetSeedBtn = this.container.querySelector('#resetSeedBtn');
        resetSeedBtn?.addEventListener('click', () => {
            if (confirm(t('developer.resetSeedConfirm'))) {
                getChangelogStore().resetToSeed();
            }
        });

        // Entry actions (edit/delete)
        this.container.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (id) {
                    this.editingId = id;
                    this.showAddForm = false;
                    this.render();
                    setTimeout(() => {
                        const input = this.container.querySelector('#entryVersion') as HTMLInputElement;
                        input?.focus();
                    }, 50);
                }
            });
        });

        this.container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (id && confirm(t('developer.confirmDelete'))) {
                    getChangelogStore().remove(id);
                }
            });
        });

        // Entry modal
        const cancelEntryBtn = this.container.querySelector('#cancelEntryBtn');
        cancelEntryBtn?.addEventListener('click', () => this.closeEntryModal());

        const entryModal = this.container.querySelector('#entryModal');
        entryModal?.addEventListener('keydown', (e: Event) => {
            if ((e as KeyboardEvent).key === 'Escape') {
                this.closeEntryModal();
            }
        });

        const entryForm = this.container.querySelector('#entryForm');
        entryForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleEntrySubmit();
        });
    }

    private openPasswordModal(): void {
        this.showPasswordModal = true;
        this.passwordError = '';
        this.render();

        setTimeout(() => {
            const input = this.container.querySelector('#passwordInput') as HTMLInputElement;
            input?.focus();
        }, 50);
    }

    private closePasswordModal(): void {
        this.showPasswordModal = false;
        this.passwordError = '';
        this.stopLockoutTimer();
        this.render();
    }

    private handlePasswordSubmit(): void {
        const input = this.container.querySelector('#passwordInput') as HTMLInputElement;
        if (!input) return;

        const password = input.value;

        if (verifyPassword(password)) {
            this.closePasswordModal();
        } else {
            if (isLockedOut()) {
                this.passwordError = '';
                this.startLockoutTimer();
            } else {
                this.passwordError = `${t('developer.wrongPassword')} • ${t('developer.attemptsRemaining', { count: getRemainingAttempts() })}`;
            }
            this.render();

            setTimeout(() => {
                const newInput = this.container.querySelector('#passwordInput') as HTMLInputElement;
                newInput?.focus();
                newInput?.select();
            }, 50);
        }
    }

    private filterEntries(entries: ChangelogEntry[], query: string): ChangelogEntry[] {
        const q = query.trim().toLowerCase();
        if (!q) return entries;

        return entries.filter((e) => {
            const haystack = [
                e.version,
                e.title,
                e.description,
                ...(e.added ?? []),
                ...(e.changed ?? []),
                ...(e.fixed ?? []),
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(q);
        });
    }

    private escapeAttr(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private startLockoutTimer(): void {
        this.stopLockoutTimer();

        this.lockoutInterval = window.setInterval(() => {
            if (!isLockedOut()) {
                this.stopLockoutTimer();
                this.render();
            } else {
                const timerEl = this.container.querySelector('#lockoutTimer');
                if (timerEl) {
                    timerEl.textContent = formatTimeRemaining(getLockoutTimeRemaining());
                }
            }
        }, 1000);
    }

    private stopLockoutTimer(): void {
        if (this.lockoutInterval) {
            clearInterval(this.lockoutInterval);
            this.lockoutInterval = null;
        }
    }

    private closeEntryModal(): void {
        this.showAddForm = false;
        this.editingId = null;
        this.render();
    }

    private handleEntrySubmit(): void {
        const version = (this.container.querySelector('#entryVersion') as HTMLInputElement)?.value;
        const title = (this.container.querySelector('#entryTitle') as HTMLInputElement)?.value;
        const date = (this.container.querySelector('#entryDate') as HTMLInputElement)?.value;
        const description = (this.container.querySelector('#entryDescription') as HTMLTextAreaElement)?.value;
        const added = this.parseLines('#entryAdded');
        const changed = this.parseLines('#entryChanged');
        const fixed = this.parseLines('#entryFixed');

        const entryData = {
            version,
            title,
            date: date || new Date().toISOString().split('T')[0],
            description: description || '',
            added: added.length > 0 ? added : undefined,
            changed: changed.length > 0 ? changed : undefined,
            fixed: fixed.length > 0 ? fixed : undefined,
        };

        const validation = validateEntry(entryData);
        if (!validation.valid) {
            const errorEl = this.container.querySelector('#formError');
            if (errorEl) {
                errorEl.textContent = validation.errors.join('. ');
                errorEl.removeAttribute('hidden');
            }
            return;
        }

        const store = getChangelogStore();

        try {
            if (this.editingId) {
                store.update(this.editingId, entryData);
            } else {
                store.add(entryData as Omit<ChangelogEntry, 'id'>);
            }
            this.closeEntryModal();
        } catch (e) {
            const errorEl = this.container.querySelector('#formError');
            if (errorEl) {
                errorEl.textContent = e instanceof Error ? e.message : 'An error occurred';
                errorEl.removeAttribute('hidden');
            }
        }
    }

    private parseLines(selector: string): string[] {
        const textarea = this.container.querySelector(selector) as HTMLTextAreaElement;
        if (!textarea) return [];

        return textarea.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        this.unsubscribeLocale?.();
        this.unsubscribeStore?.();
        this.stopLockoutTimer();
    }
}
