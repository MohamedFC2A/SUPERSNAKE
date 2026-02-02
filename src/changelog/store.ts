/**
 * Changelog Store - localStorage persistence with validation and sorting
 * 
 * Storage format: { schemaVersion: 1, entries: ChangelogEntry[] }
 */

import {
    ChangelogEntry,
    ChangelogStore,
    ChangelogStoreData,
    ValidationResult,
    SCHEMA_VERSION,
    STORAGE_KEY
} from './types';

// ========== Seed Data ==========

const SEED_ENTRIES: Omit<ChangelogEntry, 'id'>[] = [
    {
        version: '1.1.0',
        title: 'Multi-Page Website Update',
        date: '2026-02-02',
        description: 'Restructured the game into a multi-page website with improved navigation.',
        added: [
            'Hash-based routing system',
            'Home page with game overview',
            'Profile page with statistics',
            'Settings page with tabbed interface',
            'Developer mode for changelog management'
        ],
        changed: [
            'Navigation bar with responsive mobile menu',
            'Improved accessibility with keyboard support'
        ],
        fixed: [
            'RTL layout issues in Arabic mode'
        ]
    },
    {
        version: '1.0.0',
        title: 'Initial Release',
        date: '2026-01-15',
        description: 'First public release of Snake Survival game.',
        added: [
            'Classic snake gameplay mechanics',
            'AI bot opponents',
            'Boost ability',
            'Sound effects and music',
            'Mobile touch controls',
            'Settings persistence',
            'Internationalization (EN/AR)'
        ]
    }
];

// ========== Utilities ==========

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function isValidISODate(dateStr: string): boolean {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
}

function sortEntries(entries: ChangelogEntry[]): ChangelogEntry[] {
    return [...entries].sort((a, b) => {
        // Sort by date descending first
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        // Then by version descending
        return b.version.localeCompare(a.version, undefined, { numeric: true });
    });
}

// ========== Validation ==========

export function validateEntry(entry: Partial<ChangelogEntry>): ValidationResult {
    const errors: string[] = [];

    // Version required
    const version = entry.version?.trim();
    if (!version) {
        errors.push('Version is required');
    }

    // Title required
    const title = entry.title?.trim();
    if (!title) {
        errors.push('Title is required');
    }

    // Date must be valid ISO
    const date = entry.date?.trim();
    if (date && !isValidISODate(date)) {
        errors.push('Date must be a valid ISO date');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

function sanitizeEntry(entry: Omit<ChangelogEntry, 'id'>): Omit<ChangelogEntry, 'id'> {
    return {
        version: entry.version.trim(),
        title: entry.title.trim(),
        date: entry.date?.trim() || new Date().toISOString().split('T')[0],
        description: entry.description?.trim() || '',
        added: entry.added?.map(s => s.trim()).filter(s => s.length > 0),
        changed: entry.changed?.map(s => s.trim()).filter(s => s.length > 0),
        fixed: entry.fixed?.map(s => s.trim()).filter(s => s.length > 0),
    };
}

// ========== Store Implementation ==========

class ChangelogStoreImpl implements ChangelogStore {
    private data: ChangelogStoreData;
    private listeners: Set<() => void> = new Set();

    constructor() {
        this.data = this.load();
    }

    private load(): ChangelogStoreData {
        // No local persistence: always start from seed data in-memory.
        return this.createSeedData();
    }

    private createSeedData(): ChangelogStoreData {
        const entries = SEED_ENTRIES.map(entry => ({
            ...entry,
            id: generateUUID()
        }));

        const data: ChangelogStoreData = {
            schemaVersion: SCHEMA_VERSION,
            entries
        };
        return data;
    }

    private save(data: ChangelogStoreData): void {
        // No local persistence (in-memory only)
        void data;
    }

    private notify(): void {
        this.listeners.forEach(cb => cb());
    }

    list(): ChangelogEntry[] {
        return sortEntries(this.data.entries);
    }

    get(id: string): ChangelogEntry | undefined {
        return this.data.entries.find(e => e.id === id);
    }

    add(entry: Omit<ChangelogEntry, 'id'>): ChangelogEntry {
        const validation = validateEntry(entry);
        if (!validation.valid) {
            throw new Error(`Invalid entry: ${validation.errors.join(', ')}`);
        }

        const sanitized = sanitizeEntry(entry);
        const newEntry: ChangelogEntry = {
            ...sanitized,
            id: generateUUID()
        };

        this.data.entries.push(newEntry);
        this.save(this.data);
        this.notify();
        return newEntry;
    }

    update(id: string, updates: Partial<Omit<ChangelogEntry, 'id'>>): boolean {
        const index = this.data.entries.findIndex(e => e.id === id);
        if (index === -1) return false;

        const current = this.data.entries[index];
        const merged = { ...current, ...updates };

        const validation = validateEntry(merged);
        if (!validation.valid) {
            throw new Error(`Invalid entry: ${validation.errors.join(', ')}`);
        }

        this.data.entries[index] = {
            ...current,
            ...sanitizeEntry(merged as Omit<ChangelogEntry, 'id'>),
            id: current.id // Preserve ID
        };

        this.save(this.data);
        this.notify();
        return true;
    }

    remove(id: string): boolean {
        const index = this.data.entries.findIndex(e => e.id === id);
        if (index === -1) return false;

        this.data.entries.splice(index, 1);
        this.save(this.data);
        this.notify();
        return true;
    }

    resetToSeed(): void {
        this.data = this.createSeedData();
        this.notify();
    }

    subscribe(callback: () => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
}

// ========== Singleton ==========

let storeInstance: ChangelogStoreImpl | null = null;

export function getChangelogStore(): ChangelogStore {
    if (!storeInstance) {
        storeInstance = new ChangelogStoreImpl();
    }
    return storeInstance;
}
