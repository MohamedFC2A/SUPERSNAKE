export type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

declare global {
  interface Window {
    __supersnakeDeferredInstallPrompt?: DeferredInstallPrompt | null;
  }
}

export function isStandaloneMode(): boolean {
  const anyNav = navigator as any;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    anyNav.standalone === true
  );
}

export function isMobileLike(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches === true || navigator.maxTouchPoints > 0;
}

export function captureBeforeInstallPrompt(event: Event): void {
  // Chrome/Edge: allow triggering prompt later from a user gesture.
  event.preventDefault();
  window.__supersnakeDeferredInstallPrompt = event as DeferredInstallPrompt;
}

export function getDeferredInstallPrompt(): DeferredInstallPrompt | null {
  return window.__supersnakeDeferredInstallPrompt ?? null;
}

export async function promptInstallIfAvailable(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const prompt = getDeferredInstallPrompt();
  if (!prompt) return 'unavailable';

  await prompt.prompt();
  const choice = await prompt.userChoice;
  window.__supersnakeDeferredInstallPrompt = null;
  return choice.outcome;
}

