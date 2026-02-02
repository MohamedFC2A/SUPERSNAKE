export const AUTH_ERROR_STORAGE_KEY = 'supersnake.authError';

let lastAuthError: string | null = null;
const recentAuthErrors: { message: string; at: string }[] = [];
const MAX_ERRORS = 10;

export function setAuthError(message: string): void {
  lastAuthError = message;
  recentAuthErrors.unshift({ message, at: new Date().toISOString() });
  if (recentAuthErrors.length > MAX_ERRORS) recentAuthErrors.length = MAX_ERRORS;
}

export function takeAuthError(): string | null {
  const msg = lastAuthError;
  lastAuthError = null;
  return msg;
}

export function peekAuthErrors(): { message: string; at: string }[] {
  return [...recentAuthErrors];
}
