/**
 * ChangelogManager - CRUD operations for changelog entries with localStorage persistence
 * 
 * ⚠️ DEV-ONLY: This is a client-side implementation using localStorage.
 * Data is NOT secure and can be accessed/modified by anyone inspecting the browser.
 * Do NOT use this for production admin features.
 */

export interface ChangelogEntry {
    id: string;
    version: string;
    title: string;
    date: string;
    description?: string;
    added?: string[];
    changed?: string[];
    fixed?: string[];
    removed?: string[];
}

const STORAGE_KEY = 'snake-survival-changelog';
const SEEDED_KEY = 'snake-survival-changelog-seeded';

// SHA-256 hash of "2008" - still extractable but not plain text
// Generated with: await crypto.subtle.digest('SHA-256', new TextEncoder().encode('2008'))
const PASSWORD_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export class ChangelogManager {
    private entries: ChangelogEntry[] = [];
    private listeners: Set<() => void> = new Set();

    constructor() {
        this.loadEntries();
    }

    private loadEntries(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                this.entries = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to load changelog entries:', e);
            this.entries = [];
        }
    }

    private saveEntries(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
        } catch (e) {
            console.warn('Failed to save changelog entries:', e);
        }
    }

    /**
     * Check if entries have been seeded from JSON
     */
    isSeeded(): boolean {
        return localStorage.getItem(SEEDED_KEY) === 'true';
    }

    /**
     * Seed entries from an array (typically from JSON file)
     */
    async seedFromArray(entries: Omit<ChangelogEntry, 'id'>[]): Promise<void> {
        if (this.isSeeded() && this.entries.length > 0) {
            return; // Already seeded
        }

        this.entries = entries.map(entry => ({
            ...entry,
            id: generateUUID(),
        }));

        this.saveEntries();
        localStorage.setItem(SEEDED_KEY, 'true');
        this.notifyListeners();
    }

    /**
     * Verify developer password
     */
    async verifyPassword(password: string): Promise<boolean> {
        const hash = await hashPassword(password);
        return hash === PASSWORD_HASH;
    }

    /**
     * Get all entries sorted by version (newest first)
     */
    getAll(): ChangelogEntry[] {
        return [...this.entries].sort((a, b) => {
            // Sort by version descending
            return b.version.localeCompare(a.version, undefined, { numeric: true });
        });
    }

    /**
     * Get a single entry by ID
     */
    getById(id: string): ChangelogEntry | undefined {
        return this.entries.find(e => e.id === id);
    }

    /**
     * Add a new entry
     */
    add(entry: Omit<ChangelogEntry, 'id'>): ChangelogEntry {
        const newEntry: ChangelogEntry = {
            ...entry,
            id: generateUUID(),
        };
        this.entries.unshift(newEntry);
        this.saveEntries();
        this.notifyListeners();
        return newEntry;
    }

    /**
     * Update an existing entry
     */
    update(id: string, updates: Partial<Omit<ChangelogEntry, 'id'>>): boolean {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) return false;

        this.entries[index] = { ...this.entries[index], ...updates };
        this.saveEntries();
        this.notifyListeners();
        return true;
    }

    /**
     * Delete an entry
     */
    delete(id: string): boolean {
        const index = this.entries.findIndex(e => e.id === id);
        if (index === -1) return false;

        this.entries.splice(index, 1);
        this.saveEntries();
        this.notifyListeners();
        return true;
    }

    /**
     * Subscribe to changes
     */
    subscribe(callback: () => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    private notifyListeners(): void {
        this.listeners.forEach(cb => cb());
    }

    /**
     * Export all entries (for backup)
     */
    export(): string {
        return JSON.stringify({ entries: this.entries }, null, 2);
    }

    /**
     * Import entries from JSON string
     */
    import(jsonString: string): boolean {
        try {
            const data = JSON.parse(jsonString);
            if (Array.isArray(data.entries)) {
                this.entries = data.entries;
                this.saveEntries();
                this.notifyListeners();
                return true;
            }
        } catch (e) {
            console.error('Failed to import changelog:', e);
        }
        return false;
    }
}

// Singleton instance
let changelogManagerInstance: ChangelogManager | null = null;

export function getChangelogManager(): ChangelogManager {
    if (!changelogManagerInstance) {
        changelogManagerInstance = new ChangelogManager();
    }
    return changelogManagerInstance;
}
