export type CookieOptions = {
  maxAgeSeconds?: number;
  path?: string;
  sameSite?: 'Lax' | 'Strict' | 'None';
  secure?: boolean;
};

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const all = document.cookie ? document.cookie.split(';') : [];
  for (const part of all) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    if (k !== name) continue;
    return trimmed.slice(eq + 1);
  }
  return null;
}

export function setCookie(name: string, value: string, options?: CookieOptions): void {
  if (typeof document === 'undefined') return;
  const path = options?.path ?? '/';
  const sameSite = options?.sameSite ?? 'Lax';

  let cookie = `${name}=${value}; Path=${path}; SameSite=${sameSite}`;
  if (typeof options?.maxAgeSeconds === 'number') cookie += `; Max-Age=${Math.floor(options.maxAgeSeconds)}`;
  if (options?.secure) cookie += '; Secure';
  document.cookie = cookie;
}

export function deleteCookie(name: string, path: string = '/'): void {
  // Set Max-Age=0 to expire immediately
  setCookie(name, '', { maxAgeSeconds: 0, path, sameSite: 'Lax' });
}

