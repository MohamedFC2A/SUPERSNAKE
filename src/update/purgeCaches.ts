const CACHE_PREFIXES = ['supersnake-'];

export async function purgeCaches(): Promise<number> {
    if (typeof caches === 'undefined') return 0;
    const keys = await caches.keys();
    const toDelete = keys.filter((k) => CACHE_PREFIXES.some((p) => k.startsWith(p)));
    await Promise.all(toDelete.map((k) => caches.delete(k)));
    return toDelete.length;
}

/**
 * Best-effort cache purge (for troubleshooting stale assets / heavy caches).
 * Keeps the Service Worker registered; it only deletes matching caches and reloads.
 */
export async function purgeCachesAndReload(): Promise<void> {
    try {
        await purgeCaches();
    } catch {
        // ignore
    }

    try {
        const reg = await navigator.serviceWorker?.getRegistration?.();
        await reg?.update?.();
    } catch {
        // ignore
    }

    // Reload with a cache-busting query param so the browser revalidates.
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('r', String(Date.now()));
        window.location.replace(url.toString());
    } catch {
        window.location.reload();
    }
}

