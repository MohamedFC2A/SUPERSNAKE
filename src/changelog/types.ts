/**
 * Changelog Data Model Types
 */

export interface ChangelogEntry {
    /** Unique identifier (UUID) */
    id: string;
    /** Version string, e.g. "1.2.0" */
    version: string;
    /** Entry title (required) */
    title: string;
    /** ISO 8601 date string */
    date: string;
    /** Description (plain text or markdown) */
    description: string;
    /** List of added features */
    added?: string[];
    /** List of changed features */
    changed?: string[];
    /** List of fixed issues */
    fixed?: string[];
}

export interface ChangelogStoreData {
    /** Schema version for migration safety */
    schemaVersion: number;
    /** Array of changelog entries */
    entries: ChangelogEntry[];
}

export interface ChangelogStore {
    /** Get all entries sorted by date desc, then version desc */
    list(): ChangelogEntry[];
    /** Get a single entry by ID */
    get(id: string): ChangelogEntry | undefined;
    /** Add a new entry (returns the created entry with ID) */
    add(entry: Omit<ChangelogEntry, 'id'>): ChangelogEntry;
    /** Update an existing entry */
    update(id: string, updates: Partial<Omit<ChangelogEntry, 'id'>>): boolean;
    /** Remove an entry */
    remove(id: string): boolean;
    /** Reset store to seed data */
    resetToSeed(): void;
    /** Subscribe to changes */
    subscribe(callback: () => void): () => void;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/** Current schema version */
export const SCHEMA_VERSION = 1;

/** LocalStorage key */
export const STORAGE_KEY = 'snake01.changelog.v1';
