import './styles/main.css';
import { initI18n } from './i18n';
import { getRouter } from './router';
import { Layout } from './ui/Layout';
import { SettingsManager } from './game/SettingsManager';
import { getAudioManager } from './audio';
import { captureBeforeInstallPrompt } from './pwa/install';
import { BUILD_ID } from './buildInfo';
import { getAuthState, initAuth, subscribeAuth } from './supabase';
import { HomePage } from './ui/pages/HomePage';
import { PlayPage } from './ui/pages/PlayPage';
import { LeaderboardsPage } from './ui/pages/LeaderboardsPage';
import { ProfilePage } from './ui/pages/ProfilePage';
import { SettingsPage } from './ui/pages/SettingsPage';
import { ChangelogPage } from './ui/pages/ChangelogPage';
import { NotFoundPage } from './ui/pages/NotFoundPage';
import { AuthRequiredPage } from './ui/pages/AuthRequiredPage';

/**
 * Snake Survival Game - Entry Point with Router
 */
function main(): void {
    // Register service worker for PWA + update flow (production only).
    if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(BUILD_ID || 'unknown')}`).catch(() => {
            // ignore
        });
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

    // Mandatory login: re-render nav + redirect away from protected routes when signed out.
    const protectedPaths = new Set(['/','/play','/leaderboards','/changelog','/settings']);

    subscribeAuth((auth) => {
        const path = router.getCurrentPath() || '/';
        if (!auth.user && protectedPaths.has(path)) {
            router.navigate('/profile');
        }
    });

    const requireAuth = (factory: () => HTMLElement): HTMLElement => {
        const auth = getAuthState();
        if (!auth.user) return new AuthRequiredPage().getElement();
        return factory();
    };

    // Register routes
    router
        .register('/', () => {
            layout.show();
            layout.setNavVisible(true);
            return requireAuth(() => new HomePage().getElement());
        }, 'Home')

        .register('/play', () => {
            // Hide navigation for immersive gameplay
            // If signed out, show gate UI instead of game.
            if (!getAuthState().user) {
                layout.show();
                layout.setNavVisible(true);
                return new AuthRequiredPage().getElement();
            }
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
            return requireAuth(() => new LeaderboardsPage().getElement());
        }, 'Leaderboards')

        .register('/changelog', () => {
            layout.show();
            layout.setNavVisible(true);
            return requireAuth(() => new ChangelogPage().getElement());
        }, 'Changelog')

        .register('/settings', () => {
            layout.show();
            layout.setNavVisible(true);
            return requireAuth(() => new SettingsPage(settingsManager).getElement());
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
