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

const SESSION_KEY = 'snake01.devModeUntil';
const ATTEMPTS_KEY = 'snake01.devAttempts';
const LOCKED_UNTIL_KEY = 'snake01.devLockedUntil';

/** Session duration: 30 minutes */
const SESSION_DURATION_MS = 30 * 60 * 1000;

/** Maximum password attempts before lockout */
const MAX_ATTEMPTS = 5;

/** Lockout duration: 30 seconds */
const LOCKOUT_DURATION_MS = 30 * 1000;

// ========== Session Management ==========

export function isDevModeActive(): boolean {
    const expiresAt = sessionStorage.getItem(SESSION_KEY);
    if (!expiresAt) return false;

    const expireTime = parseInt(expiresAt, 10);
    if (isNaN(expireTime)) return false;

    return Date.now() < expireTime;
}

export function activateDevMode(): void {
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    sessionStorage.setItem(SESSION_KEY, expiresAt.toString());
    // Clear attempts on successful login
    sessionStorage.removeItem(ATTEMPTS_KEY);
    sessionStorage.removeItem(LOCKED_UNTIL_KEY);
}

export function deactivateDevMode(): void {
    sessionStorage.removeItem(SESSION_KEY);
}

export function getSessionTimeRemaining(): number {
    const expiresAt = sessionStorage.getItem(SESSION_KEY);
    if (!expiresAt) return 0;

    const expireTime = parseInt(expiresAt, 10);
    if (isNaN(expireTime)) return 0;

    return Math.max(0, expireTime - Date.now());
}

// ========== Rate Limiting ==========

export function getAttempts(): number {
    const attempts = sessionStorage.getItem(ATTEMPTS_KEY);
    return attempts ? parseInt(attempts, 10) || 0 : 0;
}

function setAttempts(count: number): void {
    sessionStorage.setItem(ATTEMPTS_KEY, count.toString());
}

export function isLockedOut(): boolean {
    const lockedUntil = sessionStorage.getItem(LOCKED_UNTIL_KEY);
    if (!lockedUntil) return false;

    const lockTime = parseInt(lockedUntil, 10);
    if (isNaN(lockTime)) return false;

    if (Date.now() >= lockTime) {
        // Lock expired, clear it
        sessionStorage.removeItem(LOCKED_UNTIL_KEY);
        sessionStorage.removeItem(ATTEMPTS_KEY);
        return false;
    }

    return true;
}

export function getLockoutTimeRemaining(): number {
    const lockedUntil = sessionStorage.getItem(LOCKED_UNTIL_KEY);
    if (!lockedUntil) return 0;

    const lockTime = parseInt(lockedUntil, 10);
    if (isNaN(lockTime)) return 0;

    return Math.max(0, lockTime - Date.now());
}

function triggerLockout(): void {
    const lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    sessionStorage.setItem(LOCKED_UNTIL_KEY, lockedUntil.toString());
    sessionStorage.setItem(ATTEMPTS_KEY, '0');
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
