/**
 * StatsManager - Tracks and persists game statistics
 */

export interface GameStats {
    userId: string;
    gamesPlayed: number;
    bestScore: number;
    totalScore: number;
    longestSurvivalMs: number;
    highScoreDate: string | null;
    highScoreVersion: string;
    createdAt: string;
    lastPlayedAt: string | null;
}

const STORAGE_KEY = 'snake-survival-stats';
const GAME_VERSION = '1.1.0';

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export class StatsManager {
    private stats: GameStats;
    private listeners: Set<(stats: GameStats) => void> = new Set();

    constructor() {
        this.stats = this.loadStats();
    }

    private loadStats(): GameStats {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Ensure all fields exist
                return {
                    userId: parsed.userId || generateUUID(),
                    gamesPlayed: parsed.gamesPlayed || 0,
                    bestScore: parsed.bestScore || 0,
                    totalScore: parsed.totalScore || 0,
                    longestSurvivalMs: parsed.longestSurvivalMs || 0,
                    highScoreDate: parsed.highScoreDate || null,
                    highScoreVersion: parsed.highScoreVersion || GAME_VERSION,
                    createdAt: parsed.createdAt || new Date().toISOString(),
                    lastPlayedAt: parsed.lastPlayedAt || null,
                };
            }
        } catch (e) {
            console.warn('Failed to load stats:', e);
        }

        // Return default stats with new UUID
        return {
            userId: generateUUID(),
            gamesPlayed: 0,
            bestScore: 0,
            totalScore: 0,
            longestSurvivalMs: 0,
            highScoreDate: null,
            highScoreVersion: GAME_VERSION,
            createdAt: new Date().toISOString(),
            lastPlayedAt: null,
        };
    }

    private saveStats(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stats));
        } catch (e) {
            console.warn('Failed to save stats:', e);
        }
    }

    /**
     * Record the end of a game
     */
    recordGameEnd(score: number, survivalTimeMs: number): void {
        this.stats.gamesPlayed++;
        this.stats.totalScore += score;
        this.stats.lastPlayedAt = new Date().toISOString();

        if (score > this.stats.bestScore) {
            this.stats.bestScore = score;
            this.stats.highScoreDate = new Date().toISOString();
            this.stats.highScoreVersion = GAME_VERSION;
        }

        if (survivalTimeMs > this.stats.longestSurvivalMs) {
            this.stats.longestSurvivalMs = survivalTimeMs;
        }

        this.saveStats();
        this.notifyListeners();
    }

    /**
     * Get current stats
     */
    getStats(): GameStats {
        return { ...this.stats };
    }

    /**
     * Get user ID
     */
    getUserId(): string {
        return this.stats.userId;
    }

    /**
     * Subscribe to stats changes
     */
    subscribe(callback: (stats: GameStats) => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    private notifyListeners(): void {
        this.listeners.forEach(cb => cb(this.stats));
    }

    /**
     * Reset all stats (for testing)
     */
    resetStats(): void {
        this.stats = {
            userId: this.stats.userId, // Keep same user ID
            gamesPlayed: 0,
            bestScore: 0,
            totalScore: 0,
            longestSurvivalMs: 0,
            highScoreDate: null,
            highScoreVersion: GAME_VERSION,
            createdAt: this.stats.createdAt,
            lastPlayedAt: null,
        };
        this.saveStats();
        this.notifyListeners();
    }

    /**
     * Format survival time for display
     */
    static formatSurvivalTime(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${seconds}s`;
    }
}

// Singleton instance
let statsManagerInstance: StatsManager | null = null;

export function getStatsManager(): StatsManager {
    if (!statsManagerInstance) {
        statsManagerInstance = new StatsManager();
    }
    return statsManagerInstance;
}
