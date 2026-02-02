/**
 * Lightweight i18n Module for Snake Survival Game
 * Supports English and Arabic with RTL handling
 */

import en from './locales/en.json';
import ar from './locales/ar.json';

export type Locale = 'en' | 'ar';

interface TranslationParams {
    [key: string]: string | number;
}

type TranslationValue = string | { [key: string]: TranslationValue };
type Translations = { [key: string]: TranslationValue };

const translations: Record<Locale, Translations> = { en, ar };

const RTL_LOCALES: Locale[] = ['ar'];

let currentLocale: Locale = 'en';
const listeners: Set<(locale: Locale) => void> = new Set();

/**
 * Initialize i18n - call this on app startup
 */
export function initI18n(): void {
    // Auto-detect from browser (no local persistence)
    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'ar') {
        currentLocale = 'ar';
    }
    applyLocale();
}

/**
 * Get translated string by key with optional interpolation
 * @param key - Dot-notation key (e.g., 'menu.play')
 * @param params - Optional interpolation params (e.g., { value: 100 })
 */
export function t(key: string, params?: TranslationParams): string {
    const keys = key.split('.');
    let value: TranslationValue = translations[currentLocale];

    for (const k of keys) {
        if (typeof value === 'object' && value !== null && k in value) {
            value = value[k];
        } else {
            // Fallback to English
            value = translations.en;
            for (const fallbackKey of keys) {
                if (typeof value === 'object' && value !== null && fallbackKey in value) {
                    value = value[fallbackKey];
                } else {
                    console.warn(`Translation missing: ${key}`);
                    return key;
                }
            }
            break;
        }
    }

    if (typeof value !== 'string') {
        console.warn(`Translation key is not a string: ${key}`);
        return key;
    }

    // Interpolate params
    if (params) {
        return value.replace(/\{\{(\w+)\}\}/g, (_, paramKey) => {
            return params[paramKey]?.toString() ?? `{{${paramKey}}}`;
        });
    }

    return value;
}

/**
 * Set the current locale
 */
export function setLocale(locale: Locale): void {
    if (!translations[locale]) {
        console.warn(`Locale not supported: ${locale}`);
        return;
    }
    currentLocale = locale;
    applyLocale();
    notifyListeners();
}

/**
 * Get the current locale
 */
export function getLocale(): Locale {
    return currentLocale;
}

/**
 * Check if current locale is RTL
 */
export function isRTL(): boolean {
    return RTL_LOCALES.includes(currentLocale);
}

/**
 * Subscribe to locale changes
 */
export function onLocaleChange(callback: (locale: Locale) => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

/**
 * Apply locale to document
 */
function applyLocale(): void {
    const html = document.documentElement;
    html.lang = currentLocale;
    html.dir = isRTL() ? 'rtl' : 'ltr';

    // Update page title
    document.title = t('app.title');
}

/**
 * Notify all listeners of locale change
 */
function notifyListeners(): void {
    listeners.forEach(cb => cb(currentLocale));
}

/**
 * Get list of available locales
 */
export function getAvailableLocales(): { code: Locale; name: string }[] {
    return [
        { code: 'en', name: 'English' },
        { code: 'ar', name: 'العربية' },
    ];
}
