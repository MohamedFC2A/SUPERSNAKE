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
  const fallbackReload = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('v', Date.now().toString());
    window.location.replace(url.toString());
  };

  if (!('serviceWorker' in navigator)) {
    fallbackReload();
    return;
  }

  const waitForControllerChange = async (timeoutMs: number): Promise<void> => {
    const current = navigator.serviceWorker.controller;
    await new Promise<void>((resolve, reject) => {
      const to = window.setTimeout(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', onChange);
        reject(new Error('SW controllerchange timeout'));
      }, timeoutMs);
      const onChange = () => {
        if (navigator.serviceWorker.controller === current) return;
        window.clearTimeout(to);
        navigator.serviceWorker.removeEventListener('controllerchange', onChange);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onChange);
    }).catch(() => {
      // ignore
    });
  };

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      fallbackReload();
      return;
    }

    // Ask SW to check for updates.
    try {
      await reg.update();
    } catch {
      // ignore
    }

    const waitForWaiting = async (timeoutMs: number): Promise<ServiceWorker | null> => {
      if (reg.waiting) return reg.waiting;
      const installing = reg.installing;
      if (!installing) return null;

      await new Promise<void>((resolve) => {
        const to = window.setTimeout(() => {
          installing.removeEventListener('statechange', onChange);
          resolve();
        }, timeoutMs);
        const onChange = () => {
          if (installing.state === 'installed' || installing.state === 'activated') {
            window.clearTimeout(to);
            installing.removeEventListener('statechange', onChange);
            resolve();
          }
        };
        installing.addEventListener('statechange', onChange);
      });

      return reg.waiting ?? null;
    };

    const waiting = reg.waiting ?? (await waitForWaiting(6000));
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      await waitForControllerChange(6000);
      window.location.reload();
      return;
    }

    // No waiting worker: do a cache-busted reload.
    fallbackReload();
  } catch {
    fallbackReload();
  }
}
