/**
 * Performance utilities for mobile optimization
 */

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
    
    return function(callback: FrameRequestCallback): number {
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
