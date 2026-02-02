import { t, onLocaleChange } from '../../i18n';
import { getRouter } from '../../router';
import {
    createChangelogEntry,
    deleteChangelogEntry,
    fetchChangelogEntries,
    getAuthState,
    isCurrentUserAdmin,
    updateChangelogEntry,
    type ChangelogEntryInput,
    type ChangelogEntryRow,
} from '../../supabase';

export class ChangelogPage {
    private container: HTMLElement;
    private unsubscribeLocale: (() => void) | null = null;

    private query: string = '';
    private loading: boolean = false;
    private error: string | null = null;
    private entries: ChangelogEntryRow[] = [];

    private adminChecked: boolean = false;
    private isAdmin: boolean = false;

    private showEditor: boolean = false;
    private editing: ChangelogEntryRow | null = null;
    private saving: boolean = false;
    private formError: string | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'page changelog-page';
        this.render();

        this.unsubscribeLocale = onLocaleChange(() => {
            // Re-render text + refetch localized entries
            void this.refresh();
        });

        void this.refresh();
    }

    private getLocale(): 'en' | 'ar' {
        const lang = (document.documentElement.lang || 'en').toLowerCase();
        return lang.startsWith('ar') ? 'ar' : 'en';
    }

    private async refresh(): Promise<void> {
        this.loading = true;
        this.error = null;
        this.render();

        const locale = this.getLocale();
        const [entries, admin] = await Promise.all([
            fetchChangelogEntries(locale),
            this.adminChecked ? Promise.resolve(this.isAdmin) : isCurrentUserAdmin(),
        ]);

        this.entries = entries;
        if (!this.adminChecked) {
            this.isAdmin = admin;
            this.adminChecked = true;
        }

        this.loading = false;
        this.render();
    }

    private filteredEntries(): ChangelogEntryRow[] {
        const q = this.query.trim().toLowerCase();
        if (!q) return this.entries;
        return this.entries.filter((e) => {
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

    private render(): void {
        const filtered = this.filteredEntries();
        const auth = getAuthState();

        this.container.innerHTML = `
            <div class="page-header page-header-split">
                <div class="page-header-left">
                    <h1 class="page-title">${t('changelog.title')}</h1>
                    <p class="page-subtitle">${t('changelog.subtitle')}</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-secondary btn-small" id="changelogRefreshBtn" type="button">
                        ${this.loading ? t('settings.updateChecking') : t('settings.refreshButton')}
                    </button>
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
                        ${t('changelog.showing', { shown: filtered.length, total: this.entries.length })}
                    </span>
                </div>
            </div>

            ${this.error ? `
                <div class="panel panel-warning" style="margin-top: 10px;">
                    <div class="panel-title">${t('profile.signInErrorTitle')}</div>
                    <div class="panel-text">${this.escapeHtml(this.error)}</div>
                </div>
            ` : ''}

            <div class="changelog-entries">
                ${this.loading && this.entries.length === 0 ? this.renderLoading() : ''}
                ${!this.loading && filtered.length === 0 ? `<p class="changelog-empty">${t('changelog.empty')}</p>` : ''}
                ${filtered.map((e) => this.renderEntry(e)).join('')}
            </div>

            ${this.isAdmin ? `
                <div class="panel" style="margin-top: 14px;">
                    <div class="panel-title">Admin</div>
                    <div class="panel-text">You can add/edit changelog entries (stored in Supabase).</div>
                    <div class="panel-actions">
                        <button class="btn btn-primary" id="addChangelogBtn" type="button">Add entry</button>
                    </div>
                </div>
            ` : ''}

            ${this.showEditor ? this.renderEditorModal(auth.user?.id ? 'authed' : 'signedOut') : ''}
        `;

        this.attachEventListeners();
    }

    private renderLoading(): string {
        return `
            <div class="panel" style="max-width: 760px; margin: 0 auto;">
                <div class="panel-title">Loading…</div>
                <div class="panel-text">Fetching changelog from Supabase.</div>
            </div>
        `;
    }

    private renderEntry(entry: ChangelogEntryRow): string {
        const formattedDate = entry.date
            ? new Date(entry.date).toLocaleDateString(document.documentElement.lang || undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            })
            : '';

        const sections = [
            { key: 'added', title: t('changelog.added'), items: entry.added ?? [] },
            { key: 'changed', title: t('changelog.changed'), items: entry.changed ?? [] },
            { key: 'fixed', title: t('changelog.fixed'), items: entry.fixed ?? [] },
        ].filter((s) => s.items.length > 0);

        return `
            <article class="changelog-entry" data-id="${entry.id}">
                <header class="changelog-entry-header">
                    <span class="changelog-version">v${this.escapeHtml(entry.version)}</span>
                    <span class="changelog-date">${this.escapeHtml(formattedDate)}</span>
                </header>
                <h2 class="changelog-entry-title">${this.escapeHtml(entry.title)}</h2>
                ${entry.description ? `<p class="changelog-description">${this.escapeHtml(entry.description)}</p>` : ''}

                ${sections.map((s) => `
                    <div class="changelog-section">
                        <h3 class="changelog-section-title">${this.escapeHtml(s.title)}</h3>
                        <ul class="changelog-list">
                            ${s.items.map((it) => `<li>${this.escapeHtml(it)}</li>`).join('')}
                        </ul>
                    </div>
                `).join('')}

                ${this.isAdmin ? `
                    <div class="changelog-entry-actions">
                        <button class="btn btn-secondary btn-small" data-action="edit" data-id="${entry.id}" type="button">Edit</button>
                        <button class="btn btn-secondary btn-small" data-action="delete" data-id="${entry.id}" type="button">Delete</button>
                    </div>
                ` : ''}
            </article>
        `;
    }

    private renderEditorModal(mode: 'authed' | 'signedOut'): string {
        const isEdit = !!this.editing;
        const entry = this.editing;
        const lockText = mode === 'signedOut'
            ? 'Sign in first to edit the changelog.'
            : '';

        return `
            <div class="modal-overlay" id="changelogEditorModal" role="dialog" aria-modal="true" aria-labelledby="changelogEditorTitle">
                <div class="modal-content modal-large">
                    <h2 class="modal-title" id="changelogEditorTitle">${isEdit ? 'Edit entry' : 'Add entry'}</h2>
                    ${lockText ? `<div class="panel panel-warning" style="margin: 10px 0;"><div class="panel-text">${this.escapeHtml(lockText)}</div></div>` : ''}

                    <form id="changelogEditorForm" class="entry-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="entryVersion" class="form-label">Version *</label>
                                <input type="text" id="entryVersion" class="form-input"
                                       value="${this.escapeAttr(entry?.version || '')}" placeholder="1.0.0" required ${this.saving ? 'disabled' : ''}>
                            </div>
                            <div class="form-group">
                                <label for="entryDate" class="form-label">Date</label>
                                <input type="date" id="entryDate" class="form-input"
                                       value="${this.escapeAttr(entry?.date || new Date().toISOString().split('T')[0])}" ${this.saving ? 'disabled' : ''}>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="entryTitle" class="form-label">Title *</label>
                            <input type="text" id="entryTitle" class="form-input"
                                   value="${this.escapeAttr(entry?.title || '')}" placeholder="Update title" required ${this.saving ? 'disabled' : ''}>
                        </div>

                        <div class="form-group">
                            <label for="entryDescription" class="form-label">Description</label>
                            <textarea id="entryDescription" class="form-input form-textarea"
                                      placeholder="Optional description" ${this.saving ? 'disabled' : ''}>${this.escapeHtml(entry?.description || '')}</textarea>
                        </div>

                        <div class="form-group">
                            <label for="entryAdded" class="form-label">${this.escapeHtml(t('changelog.added'))} (${this.escapeHtml(t('changelog.onePerLine'))})</label>
                            <textarea id="entryAdded" class="form-input form-textarea"
                                      placeholder="Item 1&#10;Item 2" ${this.saving ? 'disabled' : ''}>${this.escapeHtml((entry?.added || []).join('\n'))}</textarea>
                        </div>

                        <div class="form-group">
                            <label for="entryChanged" class="form-label">${this.escapeHtml(t('changelog.changed'))} (${this.escapeHtml(t('changelog.onePerLine'))})</label>
                            <textarea id="entryChanged" class="form-input form-textarea"
                                      placeholder="Item" ${this.saving ? 'disabled' : ''}>${this.escapeHtml((entry?.changed || []).join('\n'))}</textarea>
                        </div>

                        <div class="form-group">
                            <label for="entryFixed" class="form-label">${this.escapeHtml(t('changelog.fixed'))} (${this.escapeHtml(t('changelog.onePerLine'))})</label>
                            <textarea id="entryFixed" class="form-input form-textarea"
                                      placeholder="Item" ${this.saving ? 'disabled' : ''}>${this.escapeHtml((entry?.fixed || []).join('\n'))}</textarea>
                        </div>

                        ${this.formError ? `<div class="form-error" role="alert">${this.escapeHtml(this.formError)}</div>` : ''}

                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" id="cancelChangelogEditorBtn" ${this.saving ? 'disabled' : ''}>Cancel</button>
                            <button type="submit" class="btn btn-primary" ${this.saving || mode === 'signedOut' ? 'disabled' : ''}>
                                ${this.saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    private attachEventListeners(): void {
        this.container.querySelector('#changelogBackBtn')?.addEventListener('click', () => getRouter().navigate('/'));
        this.container.querySelector('#changelogRefreshBtn')?.addEventListener('click', () => void this.refresh());

        const searchInput = this.container.querySelector('#changelogSearchInput') as HTMLInputElement | null;
        searchInput?.addEventListener('input', () => {
            this.query = searchInput.value;
            this.render();
            const next = this.container.querySelector('#changelogSearchInput') as HTMLInputElement | null;
            if (next) {
                next.focus();
                next.setSelectionRange(this.query.length, this.query.length);
            }
        });

        this.container.querySelector('#changelogClearBtn')?.addEventListener('click', () => {
            this.query = '';
            this.render();
            (this.container.querySelector('#changelogSearchInput') as HTMLInputElement | null)?.focus();
        });

        this.container.querySelector('#addChangelogBtn')?.addEventListener('click', () => {
            this.formError = null;
            this.editing = null;
            this.showEditor = true;
            this.render();
            window.setTimeout(() => (this.container.querySelector('#entryVersion') as HTMLInputElement | null)?.focus(), 30);
        });

        this.container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = Number((btn as HTMLElement).getAttribute('data-id') || '');
                const entry = this.entries.find((e) => e.id === id) || null;
                if (!entry) return;
                this.formError = null;
                this.editing = entry;
                this.showEditor = true;
                this.render();
                window.setTimeout(() => (this.container.querySelector('#entryTitle') as HTMLInputElement | null)?.focus(), 30);
            });
        });

        this.container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = Number((btn as HTMLElement).getAttribute('data-id') || '');
                if (!Number.isFinite(id)) return;
                if (!confirm('Delete this entry?')) return;
                void this.handleDelete(id);
            });
        });

        this.container.querySelector('#cancelChangelogEditorBtn')?.addEventListener('click', () => {
            this.showEditor = false;
            this.editing = null;
            this.formError = null;
            this.render();
        });

        const form = this.container.querySelector('#changelogEditorForm') as HTMLFormElement | null;
        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            void this.handleSave();
        });
    }

    private parseLines(selector: string): string[] | null {
        const textarea = this.container.querySelector(selector) as HTMLTextAreaElement | null;
        if (!textarea) return null;
        const lines = textarea.value
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        return lines.length > 0 ? lines : null;
    }

    private async handleSave(): Promise<void> {
        const auth = getAuthState();
        if (!auth.user) return;

        const version = (this.container.querySelector('#entryVersion') as HTMLInputElement | null)?.value || '';
        const title = (this.container.querySelector('#entryTitle') as HTMLInputElement | null)?.value || '';
        const date = (this.container.querySelector('#entryDate') as HTMLInputElement | null)?.value || '';
        const description = (this.container.querySelector('#entryDescription') as HTMLTextAreaElement | null)?.value || '';
        const added = this.parseLines('#entryAdded');
        const changed = this.parseLines('#entryChanged');
        const fixed = this.parseLines('#entryFixed');

        const payload: ChangelogEntryInput = {
            version,
            title,
            date,
            description,
            added,
            changed,
            fixed,
            locale: this.getLocale(),
        };

        if (!payload.version.trim() || !payload.title.trim()) {
            this.formError = 'Version and title are required.';
            this.render();
            return;
        }

        this.saving = true;
        this.formError = null;
        this.render();

        try {
            if (this.editing) {
                await updateChangelogEntry(this.editing.id, payload);
            } else {
                await createChangelogEntry(payload);
            }
            this.showEditor = false;
            this.editing = null;
            await this.refresh();
        } catch (e: any) {
            this.error = null;
            this.formError = e?.message || 'Failed to save entry';
            this.saving = false;
            this.render();
        } finally {
            this.saving = false;
        }
    }

    private async handleDelete(id: number): Promise<void> {
        try {
            await deleteChangelogEntry(id);
            await this.refresh();
        } catch (e: any) {
            this.error = e?.message || 'Failed to delete entry';
            this.render();
        }
    }

    private escapeAttr(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        this.unsubscribeLocale?.();
    }
}

