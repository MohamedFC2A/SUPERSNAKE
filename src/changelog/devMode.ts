/**
 * Developer Mode - Session management with rate limiting
 * 
 * ⚠️ SECURITY WARNING: This is a CLIENT-SIDE password gate.
 * It is NOT secure for production use. Anyone can extract the password
 * by inspecting the source code or browser storage.
 * This feature is intended for LOCAL/DEV admin use only.
 * 
 * DO NOT log the password or store it in plain text longer than needed.
 */

// ========== Constants ==========

let expiresAtMs: number | null = null;
let attemptsCount: number = 0;
let lockedUntilMs: number | null = null;

/** Session duration: 30 minutes */
const SESSION_DURATION_MS = 30 * 60 * 1000;

/** Maximum password attempts before lockout */
const MAX_ATTEMPTS = 5;

/** Lockout duration: 30 seconds */
const LOCKOUT_DURATION_MS = 30 * 1000;

// ========== Session Management ==========

export function isDevModeActive(): boolean {
    return expiresAtMs !== null && Date.now() < expiresAtMs;
}

export function activateDevMode(): void {
    expiresAtMs = Date.now() + SESSION_DURATION_MS;
    attemptsCount = 0;
    lockedUntilMs = null;
}

export function deactivateDevMode(): void {
    expiresAtMs = null;
}

export function getSessionTimeRemaining(): number {
    if (expiresAtMs === null) return 0;
    return Math.max(0, expiresAtMs - Date.now());
}

// ========== Rate Limiting ==========

export function getAttempts(): number {
    return attemptsCount;
}

function setAttempts(count: number): void {
    attemptsCount = count;
}

export function isLockedOut(): boolean {
    if (lockedUntilMs === null) return false;
    if (Date.now() >= lockedUntilMs) {
        lockedUntilMs = null;
        attemptsCount = 0;
        return false;
    }
    return true;
}

export function getLockoutTimeRemaining(): number {
    if (lockedUntilMs === null) return 0;
    return Math.max(0, lockedUntilMs - Date.now());
}

function triggerLockout(): void {
    lockedUntilMs = Date.now() + LOCKOUT_DURATION_MS;
    attemptsCount = 0;
}

// ========== Password Verification ==========

/**
 * Verify the developer password.
 * Returns true if password is correct and not locked out.
 * 
 * ⚠️ The password is intentionally NOT stored as a constant.
 * It's compared inline to minimize exposure, though this is
 * still extractable from the source code.
 */
export function verifyPassword(input: string): boolean {
    // Check lockout first
    if (isLockedOut()) {
        return false;
    }

    // Trim and compare
    // Password: 2008 (not stored as const to minimize exposure)
    const isCorrect = input.trim() === '2008';

    if (isCorrect) {
        activateDevMode();
        return true;
    }

    // Increment failed attempts
    const attempts = getAttempts() + 1;
    setAttempts(attempts);

    if (attempts >= MAX_ATTEMPTS) {
        triggerLockout();
    }

    return false;
}

export function getRemainingAttempts(): number {
    if (isLockedOut()) return 0;
    return Math.max(0, MAX_ATTEMPTS - getAttempts());
}

// ========== Helpers ==========

export function formatTimeRemaining(ms: number): string {
    const seconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
}
