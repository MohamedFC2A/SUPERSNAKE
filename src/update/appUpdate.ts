import { BUILD_ID } from '../buildInfo';

export interface BuildInfo {
  buildId: string;
  builtAt?: string;
}

export interface UpdateStatus {
  currentBuildId: string;
  remoteBuildId: string | null;
  updateAvailable: boolean;
  error: string | null;
}

export async function fetchRemoteBuildInfo(): Promise<BuildInfo> {
  const res = await fetch(`/build.json?cb=${Date.now()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`Failed to fetch build.json (${res.status})`);
  const json = (await res.json()) as any;
  if (!json || typeof json.buildId !== 'string') throw new Error('Invalid build.json payload');
  return { buildId: json.buildId, builtAt: typeof json.builtAt === 'string' ? json.builtAt : undefined };
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  try {
    const remote = await fetchRemoteBuildInfo();
    const current = BUILD_ID || 'unknown';
    return {
      currentBuildId: current,
      remoteBuildId: remote.buildId,
      updateAvailable: !!remote.buildId && remote.buildId !== current,
      error: null,
    };
  } catch (e: any) {
    return {
      currentBuildId: BUILD_ID || 'unknown',
      remoteBuildId: null,
      updateAvailable: false,
      error: e?.message || 'Update check failed',
    };
  }
}

export async function applyUpdate(): Promise<void> {
  // Clear any old runtime caches (if a previous SW was installed).
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }

  // Force a fresh navigation (bust CDN/proxy caches).
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now().toString());
  window.location.replace(url.toString());
}

