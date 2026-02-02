export const AUTH_ERROR_STORAGE_KEY = 'supersnake.authError';

export function setAuthError(message: string): void {
  try {
    sessionStorage.setItem(AUTH_ERROR_STORAGE_KEY, message);
  } catch {
    // ignore
  }
}

export function takeAuthError(): string | null {
  try {
    const msg = sessionStorage.getItem(AUTH_ERROR_STORAGE_KEY);
    if (msg) sessionStorage.removeItem(AUTH_ERROR_STORAGE_KEY);
    return msg;
  } catch {
    return null;
  }
}

