/**
 * Performance utilities for mobile optimization
 */

// ============================================================================
// Unified Device Profile Detection
// ============================================================================

export type DeviceTier = 'very-low' | 'low' | 'mid' | 'high' | 'flagship';

export interface DeviceProfile {
    tier: DeviceTier;
    refreshHz: 60 | 90 | 120;
    isTouch: boolean;
    isLowEnd: boolean;
    dprCap: number;
}

let cachedDeviceProfile: DeviceProfile | null = null;
let detectedRefreshHz: 60 | 90 | 120 = 60;
let refreshDetectionDone = false;

/**
 * Detect display refresh rate via rAF timing measurement
 * Returns detected Hz (60, 90, or 120) or 60 as default
 */
export function detectRefreshRate(): Promise<60 | 90 | 120> {
    if (refreshDetectionDone) {
        return Promise.resolve(detectedRefreshHz);
    }

    return new Promise((resolve) => {
        const frameTimes: number[] = [];
        let lastTime = 0;
        let frameCount = 0;
        const targetFrames = 30;

        function measure(timestamp: number) {
            if (lastTime > 0) {
                frameTimes.push(timestamp - lastTime);
            }
            lastTime = timestamp;
            frameCount++;

            if (frameCount < targetFrames) {
                requestAnimationFrame(measure);
            } else {
                // Calculate median frame time
                const sorted = frameTimes.slice().sort((a, b) => a - b);
                const median = sorted[Math.floor(sorted.length / 2)] || 16.67;
                const estimatedHz = Math.round(1000 / median);

                // Normalize to common refresh rates
                if (estimatedHz >= 110) {
                    detectedRefreshHz = 120;
                } else if (estimatedHz >= 80) {
                    detectedRefreshHz = 90;
                } else {
                    detectedRefreshHz = 60;
                }

                refreshDetectionDone = true;
                resolve(detectedRefreshHz);
            }
        }

        requestAnimationFrame(measure);
    });
}

/**
 * Get detected refresh rate synchronously (returns cached or 60 if not yet detected)
 */
export function getDetectedRefreshHz(): 60 | 90 | 120 {
    return detectedRefreshHz;
}

/**
 * Determine device tier based on hardware capabilities
 */
function determineDeviceTier(): DeviceTier {
    const ua = navigator.userAgent;
    const memory = (navigator as any).deviceMemory as number | undefined;
    const cores = navigator.hardwareConcurrency || 4;

    // Check for flagship devices
    const isFlagship = (
        /iPhone (1[4-9]|2[0-9])/.test(ua) || // iPhone 14+
        /iPad Pro/.test(ua) ||
        /SM-S9[0-9]/.test(ua) || // Samsung S series
        /SM-G9[0-9]/.test(ua) ||
        /Pixel [6-9]/.test(ua) ||
        (typeof memory === 'number' && memory >= 8 && cores >= 8)
    );

    if (isFlagship) return 'flagship';

    // Check for high-end
    const isHighEnd = (
        /iPhone (1[2-3])/.test(ua) || // iPhone 12-13
        /SM-S[8-9]/.test(ua) ||
        /SM-G[8-9]/.test(ua) ||
        /Pixel [4-5]/.test(ua) ||
        (typeof memory === 'number' && memory >= 6 && cores >= 6)
    );

    if (isHighEnd) return 'high';

    // Check for very low-end
    const isVeryLow = (
        /Android [4-6]\./.test(ua) ||
        /iPhone OS (9|10)_/.test(ua) ||
        /iPhone [5-6]/.test(ua) ||
        (typeof memory === 'number' && memory <= 2) ||
        cores <= 2
    );

    if (isVeryLow) return 'very-low';

    // Check for low-end
    const isLowEnd = (
        /Android [4-8]\./.test(ua) ||
        /iPhone OS (10|11|12)_/.test(ua) ||
        /iPhone [5-8]/.test(ua) ||
        (typeof memory === 'number' && memory <= 3) ||
        cores <= 4
    );

    if (isLowEnd) return 'low';

    // Default to mid-range
    return 'mid';
}

/**
 * Get unified device profile (cached)
 */
export function getDeviceProfile(): DeviceProfile {
    if (cachedDeviceProfile) return cachedDeviceProfile;

    const tier = determineDeviceTier();
    const dpr = window.devicePixelRatio || 1;

    const isTouch = (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    );

    const isLowEnd = tier === 'low' || tier === 'very-low';

    // DPR caps per tier (performance-focused)
    let dprCap: number;
    switch (tier) {
        case 'very-low':
        case 'low':
            dprCap = 1.0;
            break;
        case 'mid':
            dprCap = Math.min(1.5, dpr);
            break;
        case 'high':
            dprCap = Math.min(2.0, dpr);
            break;
        case 'flagship':
            dprCap = Math.min(2.5, dpr);
            break;
        default:
            dprCap = Math.min(1.5, dpr);
    }

    cachedDeviceProfile = {
        tier,
        refreshHz: detectedRefreshHz,
        isTouch,
        isLowEnd,
        dprCap,
    };

    return cachedDeviceProfile;
}

/**
 * Initialize device profile (call early in app lifecycle)
 */
export async function initDeviceProfile(): Promise<DeviceProfile> {
    await detectRefreshRate();
    cachedDeviceProfile = null; // Reset to pick up new refreshHz
    return getDeviceProfile();
}

// ============================================================================
// Legacy Functions (kept for compatibility)
// ============================================================================

export function isLowEndDevice(): boolean {
    const memory = (navigator as any).deviceMemory;
    const cores = navigator.hardwareConcurrency;

    if (memory && memory <= 3) return true;
    if (cores && cores <= 4) return true;

    const ua = navigator.userAgent;
    if (/Android [4-8]\./.test(ua)) return true;
    if (/iPhone OS (10|11|12|13)_/.test(ua)) return true;

    return false;
}

export interface DeviceCapabilities {
    isTouch: boolean;
    isLowEnd: boolean;
    memory: number;
    cores: number;
    screenSize: 'small' | 'medium' | 'large';
    network: 'slow-2g' | '2g' | '3g' | '4g' | 'offline';
}

let cachedCapabilities: DeviceCapabilities | null = null;

/**
 * Detect device capabilities for performance optimization
 */
export function detectDeviceCapabilities(): DeviceCapabilities {
    if (cachedCapabilities) return cachedCapabilities;

    const isTouch = (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    );

    const memory = (navigator as any).deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;

    // Screen size detection
    const width = window.innerWidth;
    let screenSize: 'small' | 'medium' | 'large' = 'medium';
    if (width < 480) screenSize = 'small';
    else if (width > 1024) screenSize = 'large';

    // Low-end device detection
    const isLowEnd = memory <= 3 || cores <= 4 ||
        /Android [4-8]\./.test(navigator.userAgent) ||
        /iPhone OS (10|11|12|13)_/.test(navigator.userAgent);

    // Network detection
    const connection = (navigator as any).connection;
    const network = connection?.effectiveType || '4g';

    cachedCapabilities = {
        isTouch,
        isLowEnd,
        memory,
        cores,
        screenSize,
        network,
    };

    return cachedCapabilities;
}

/**
 * Get optimal settings based on device capabilities
 */
export function getOptimalSettings() {
    const caps = detectDeviceCapabilities();

    if (caps.isLowEnd) {
        return {
            quality: 'medium' as const,
            particleCount: 20,
            botCount: 6,
            foodCount: 150,
            enableShadows: false,
            enableGlow: false,
            enableConnections: false,
            targetFps: 30,
        };
    }

    if (caps.isTouch) {
        return {
            quality: 'high' as const,
            particleCount: 40,
            botCount: 10,
            foodCount: 250,
            enableShadows: false,
            enableGlow: false,
            enableConnections: true,
            targetFps: 60,
        };
    }

    // Desktop high-end
    return {
        quality: 'ultra' as const,
        particleCount: 60,
        botCount: 15,
        foodCount: 400,
        enableShadows: true,
        enableGlow: true,
        enableConnections: true,
        targetFps: 60,
    };
}

/**
 * Throttle function execution
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle = false;
    return function (...args: Parameters<T>) {
        if (!inThrottle) {
            func.apply(null, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: number;
    return function (...args: Parameters<T>) {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => func.apply(null, args), wait);
    };
}

/**
 * Request animation frame with frame skipping for low-end devices
 */
export function createAdaptiveRaf(targetFps: number = 60) {
    const caps = detectDeviceCapabilities();
    const isLowEnd = caps.isLowEnd;
    const frameInterval = Math.ceil(60 / targetFps);
    let frameCount = 0;

    return function (callback: FrameRequestCallback): number {
        return requestAnimationFrame((timestamp) => {
            frameCount++;
            if (isLowEnd && frameCount % frameInterval !== 0) {
                // Skip frame
                requestAnimationFrame(callback);
                return;
            }
            callback(timestamp);
        });
    };
}

/**
 * Check if element is in viewport (for lazy loading)
 */
export function isInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
    );
}

/**
 * Preload critical resources
 */
export function preloadResources(urls: string[]): Promise<void[]> {
    return Promise.all(
        urls.map(url => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve(); // Don't fail on error
                img.src = url;
            });
        })
    );
}

/**
 * Battery-aware performance mode
 */
export async function getBatteryStatus(): Promise<{ level: number; charging: boolean }> {
    try {
        const battery = await (navigator as any).getBattery?.() || { level: 1, charging: true };
        return {
            level: battery.level,
            charging: battery.charging,
        };
    } catch {
        return { level: 1, charging: true };
    }
}
