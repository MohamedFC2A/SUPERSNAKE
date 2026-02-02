export const AUTH_ERROR_STORAGE_KEY = 'supersnake.authError';

let lastAuthError: string | null = null;

export function setAuthError(message: string): void {
  lastAuthError = message;
}

export function takeAuthError(): string | null {
  const msg = lastAuthError;
  lastAuthError = null;
  return msg;
}
