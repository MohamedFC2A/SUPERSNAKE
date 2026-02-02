import './styles/main.css';
import { initI18n } from './i18n';
import { getRouter } from './router';
import { Layout } from './ui/Layout';
import { SettingsManager } from './game/SettingsManager';
import { getAudioManager } from './audio';
import { captureBeforeInstallPrompt } from './pwa/install';
import { initAuth } from './supabase';
import { HomePage } from './ui/pages/HomePage';
import { PlayPage } from './ui/pages/PlayPage';
import { LeaderboardsPage } from './ui/pages/LeaderboardsPage';
import { ProfilePage } from './ui/pages/ProfilePage';
import { SettingsPage } from './ui/pages/SettingsPage';
import { ChangelogPage } from './ui/pages/ChangelogPage';
import { NotFoundPage } from './ui/pages/NotFoundPage';

/**
 * Snake Survival Game - Entry Point with Router
 */
function main(): void {
    // Disable runtime caching to avoid stale builds (and to avoid local caching as requested).
    if (!import.meta.env.DEV) {
        void (async () => {
            try {
                // Clear localStorage (best-effort; may throw in some privacy modes)
                localStorage.clear();
            } catch {
                // ignore
            }

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
        })();
    }

    // Initialize i18n (must be before UI)
    initI18n();

    // Initialize settings manager
    const settingsManager = new SettingsManager();

    // Initialize audio manager with settings
    const audioManager = getAudioManager();
    const settings = settingsManager.getSettings();
    audioManager.setEnabled(settings.audio.sfxEnabled);
    audioManager.setMasterVolume(settings.audio.masterVolume);
    audioManager.setSfxVolume(settings.audio.sfxVolume);

    // Supabase auth (optional; requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
    initAuth();

    // Subscribe to settings changes
    settingsManager.subscribe((newSettings) => {
        audioManager.setEnabled(newSettings.audio.sfxEnabled);
        audioManager.setMasterVolume(newSettings.audio.masterVolume);
        audioManager.setSfxVolume(newSettings.audio.sfxVolume);
    });

    // Get app container
    const app = document.getElementById('app');
    if (!app) {
        console.error('App container not found!');
        return;
    }

    // Clear existing content
    app.innerHTML = '';

    // Create layout with navigation
    const layout = new Layout();
    app.appendChild(layout.getElement());

    // Get router and set container
    const router = getRouter();
    router.setContainer(layout.getMainContent());

    // Store references for cleanup
    let currentPlayPage: PlayPage | null = null;

    // Register routes
    router
        .register('/', () => {
            layout.show();
            layout.setNavVisible(true);
            return new HomePage().getElement();
        }, 'Home')

        .register('/play', () => {
            // Hide navigation for immersive gameplay
            layout.setNavVisible(false);

            // Cleanup previous play page if exists
            currentPlayPage?.destroy();

            // Create new play page
            currentPlayPage = new PlayPage(settingsManager);
            return currentPlayPage.getElement();
        }, 'Play')

        .register('/leaderboards', () => {
            layout.show();
            layout.setNavVisible(true);
            return new LeaderboardsPage().getElement();
        }, 'Leaderboards')

        .register('/changelog', () => {
            layout.show();
            layout.setNavVisible(true);
            return new ChangelogPage().getElement();
        }, 'Changelog')

        .register('/settings', () => {
            layout.show();
            layout.setNavVisible(true);
            return new SettingsPage(settingsManager).getElement();
        }, 'Settings')

        .register('/profile', () => {
            layout.show();
            layout.setNavVisible(true);
            return new ProfilePage().getElement();
        }, 'Profile')

        .setNotFound(() => {
            layout.show();
            layout.setNavVisible(true);
            return new NotFoundPage().getElement();
        });

    // Handle route changes for cleanup
    router.onRouteChange((path) => {
        // Cleanup play page when navigating away
        if (path !== '/play' && currentPlayPage) {
            currentPlayPage.destroy();
            currentPlayPage = null;
        }
    });

    // Initialize router
    router.init();

    // PWA: capture install prompt for mobile "install required" flow
    window.addEventListener('beforeinstallprompt', captureBeforeInstallPrompt as any);

    // NOTE: Service worker is intentionally NOT registered to prevent stale-cache issues.

    // Debug: Show FPS in development
    if (import.meta.env.DEV) {
        console.log('🐍 Snake Survival Game initialized in development mode!');
    }

    console.log('🐍 Snake Survival Game v1.1.0 loaded!');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
