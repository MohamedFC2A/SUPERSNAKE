/**
 * FPSManager - Advanced FPS monitoring, display, and generation system
 * Provides real-time FPS counter, auto device detection, and intelligent performance optimization
 */

import { detectDeviceCapabilities, getOptimalSettings, isLowEndDevice } from '../utils/performance';

export interface FPSConfig {
    targetFPS: number;
    showCounter: boolean;
    adaptiveQuality: boolean;
    extremeMode: boolean;
}

export interface FPSMetrics {
    current: number;
    average: number;
    min: number;
    max: number;
    droppedFrames: number;
    frameTime: number;
    quality: 'ultra' | 'high' | 'medium' | 'low' | 'extreme';
}

export interface DeviceProfile {
    tier: 'flagship' | 'high' | 'mid' | 'low' | 'very-low';
    targetFPS: number;
    recommendedQuality: FPSMetrics['quality'];
    canHandle120fps: boolean;
    maxPixelRatio: number;
    maxParticles: number;
    maxBots: number;
    maxFood: number;
    useFrameSkip: boolean;
    enableEffects: boolean;
}

/**
 * Advanced Device Detection - Runs before game starts
 */
export function detectDeviceProfile(): DeviceProfile {
    const ua = navigator.userAgent;
    const memory = (navigator as any).deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;
    const dpr = window.devicePixelRatio || 1;
    
    // Check for specific high-end devices
    const isFlagship = (
        /iPhone (1[4-9]|2[0-9])/.test(ua) || // iPhone 14+
        /iPad Pro/.test(ua) ||
        /SM-S9[0-9]/.test(ua) || // Samsung S series
        /SM-G9[0-9]/.test(ua) ||
        /Pixel [6-9]/.test(ua) ||
        (memory >= 8 && cores >= 8)
    );
    
    // Check for high-end
    const isHighEnd = (
        /iPhone (1[2-3])/.test(ua) || // iPhone 12-13
        /SM-S[8-9]/.test(ua) ||
        /SM-G[8-9]/.test(ua) ||
        /Pixel [4-5]/.test(ua) ||
        (memory >= 6 && cores >= 6)
    );
    
    // Check for low-end
    const isLowEnd = (
        /Android [4-8]\./.test(ua) ||
        /iPhone OS (10|11|12)_/.test(ua) ||
        /iPhone [5-8]/.test(ua) ||
        (memory <= 3) ||
        (cores <= 4)
    );
    
    // Check for very low-end
    const isVeryLow = (
        /Android [4-6]\./.test(ua) ||
        /iPhone OS (9|10)_/.test(ua) ||
        /iPhone [5-6]/.test(ua) ||
        (memory <= 2) ||
        (cores <= 2)
    );
    
    if (isVeryLow) {
        return {
            tier: 'very-low',
            targetFPS: 30,
            recommendedQuality: 'extreme',
            canHandle120fps: false,
            maxPixelRatio: 1,
            maxParticles: 10,
            maxBots: 4,
            maxFood: 100,
            useFrameSkip: true,
            enableEffects: false,
        };
    }
    
    if (isLowEnd) {
        return {
            tier: 'low',
            targetFPS: 30,
            recommendedQuality: 'low',
            canHandle120fps: false,
            maxPixelRatio: 1,
            maxParticles: 30,
            maxBots: 6,
            maxFood: 150,
            useFrameSkip: true,
            enableEffects: false,
        };
    }
    
    if (isFlagship) {
        return {
            tier: 'flagship',
            targetFPS: 60,
            recommendedQuality: 'ultra',
            canHandle120fps: true,
            maxPixelRatio: Math.min(dpr, 2.5),
            maxParticles: 150,
            maxBots: 18,
            maxFood: 500,
            useFrameSkip: false,
            enableEffects: true,
        };
    }
    
    if (isHighEnd) {
        return {
            tier: 'high',
            targetFPS: 60,
            recommendedQuality: 'high',
            canHandle120fps: false,
            maxPixelRatio: Math.min(dpr, 2),
            maxParticles: 100,
            maxBots: 15,
            maxFood: 400,
            useFrameSkip: false,
            enableEffects: true,
        };
    }
    
    // Mid-range (default)
    return {
        tier: 'mid',
        targetFPS: 60,
        recommendedQuality: 'medium',
        canHandle120fps: false,
        maxPixelRatio: Math.min(dpr, 1.5),
        maxParticles: 60,
        maxBots: 10,
        maxFood: 250,
        useFrameSkip: false,
        enableEffects: true,
    };
}

/**
 * FPS Manager - Main class for FPS monitoring and optimization
 */
export class FPSManager {
    private config: FPSConfig;
    private profile: DeviceProfile;
    private metrics: FPSMetrics;
    private frameTimes: number[] = [];
    private lastTime: number = 0;
    private frameCount: number = 0;
    private fpsUpdateTime: number = 0;
    private isActive: boolean = false;
    private rafId: number = 0;
    
    // Adaptive quality
    private slowFrameCount: number = 0;
    private fastFrameCount: number = 0;
    private currentQuality: FPSMetrics['quality'];
    
    constructor(config: Partial<FPSConfig> = {}) {
        this.profile = detectDeviceProfile();
        this.config = {
            targetFPS: this.profile.targetFPS,
            showCounter: true,
            adaptiveQuality: true,
            extremeMode: this.profile.tier === 'very-low',
            ...config,
        };
        
        this.currentQuality = this.profile.recommendedQuality;
        this.metrics = {
            current: 0,
            average: 0,
            min: 999,
            max: 0,
            droppedFrames: 0,
            frameTime: 0,
            quality: this.currentQuality,
        };
    }
    
    /**
     * Start FPS monitoring
     */
    start(): void {
        if (this.isActive) return;
        this.isActive = true;
        this.lastTime = performance.now();
        this.fpsUpdateTime = this.lastTime;
        this.frameCount = 0;
        this.frameTimes = [];
        
        this.rafId = requestAnimationFrame(this.loop.bind(this));
    }
    
    /**
     * Stop FPS monitoring
     */
    stop(): void {
        this.isActive = false;
        cancelAnimationFrame(this.rafId);
    }
    
    /**
     * Get current device profile
     */
    getProfile(): DeviceProfile {
        return this.profile;
    }
    
    /**
     * Get current FPS metrics
     */
    getMetrics(): FPSMetrics {
        return { ...this.metrics };
    }
    
    /**
     * Get recommended settings based on device
     */
    getRecommendedSettings() {
        return {
            quality: this.profile.recommendedQuality,
            targetFPS: this.profile.targetFPS,
            pixelRatio: this.profile.maxPixelRatio,
            particles: this.profile.maxParticles,
            bots: this.profile.maxBots,
            food: this.profile.maxFood,
            frameSkip: this.profile.useFrameSkip,
            effects: this.profile.enableEffects,
        };
    }
    
    /**
     * Main FPS loop
     */
    private loop(timestamp: number): void {
        if (!this.isActive) return;
        
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // Track frame times (keep last 60 frames)
        this.frameTimes.push(deltaTime);
        if (this.frameTimes.length > 60) {
            this.frameTimes.shift();
        }
        
        // Calculate metrics
        this.frameCount++;
        const elapsed = timestamp - this.fpsUpdateTime;
        
        if (elapsed >= 1000) {
            // Calculate FPS
            const fps = Math.round((this.frameCount * 1000) / elapsed);
            this.metrics.current = fps;
            
            // Calculate min/max/average
            this.metrics.min = Math.min(this.metrics.min, fps);
            this.metrics.max = Math.max(this.metrics.max, fps);
            this.metrics.average = Math.round(
                this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
            );
            
            // Calculate frame time
            this.metrics.frameTime = Math.round(deltaTime * 10) / 10;
            
            // Detect dropped frames
            const expectedFrames = Math.round(elapsed / (1000 / this.config.targetFPS));
            if (this.frameCount < expectedFrames * 0.9) {
                this.metrics.droppedFrames += expectedFrames - this.frameCount;
            }
            
            // Adaptive quality adjustment
            if (this.config.adaptiveQuality) {
                this.adjustQuality(fps);
            }
            
            // Reset counters
            this.frameCount = 0;
            this.fpsUpdateTime = timestamp;
        }
        
        this.rafId = requestAnimationFrame(this.loop.bind(this));
    }
    
    /**
     * Adjust quality based on FPS
     */
    private adjustQuality(fps: number): void {
        const target = this.config.targetFPS;
        const threshold = target * 0.85; // 85% of target
        
        if (fps < threshold) {
            this.slowFrameCount++;
            this.fastFrameCount = Math.max(0, this.fastFrameCount - 1);
            
            if (this.slowFrameCount > 5) {
                this.decreaseQuality();
                this.slowFrameCount = 0;
            }
        } else if (fps >= target * 0.95) {
            this.fastFrameCount++;
            this.slowFrameCount = Math.max(0, this.slowFrameCount - 1);
            
            if (this.fastFrameCount > 10) {
                this.increaseQuality();
                this.fastFrameCount = 0;
            }
        }
    }
    
    /**
     * Decrease quality to improve FPS
     */
    private decreaseQuality(): void {
        const qualities: FPSMetrics['quality'][] = ['ultra', 'high', 'medium', 'low', 'extreme'];
        const currentIdx = qualities.indexOf(this.currentQuality);
        if (currentIdx < qualities.length - 1) {
            this.currentQuality = qualities[currentIdx + 1];
            this.metrics.quality = this.currentQuality;
        }
    }
    
    /**
     * Increase quality if FPS is good
     */
    private increaseQuality(): void {
        const qualities: FPSMetrics['quality'][] = ['ultra', 'high', 'medium', 'low', 'extreme'];
        const currentIdx = qualities.indexOf(this.currentQuality);
        const maxIdx = qualities.indexOf(this.profile.recommendedQuality);
        
        if (currentIdx > maxIdx) {
            this.currentQuality = qualities[currentIdx - 1];
            this.metrics.quality = this.currentQuality;
        }
    }
    
    /**
     * Toggle counter visibility (config only - display handled by HUDManager)
     */
    toggleCounter(show?: boolean): void {
        this.config.showCounter = show ?? !this.config.showCounter;
    }
    
    /**
     * Apply FPS Gen Pro settings to game
     */
    applySettings(game: any): void {
        const settings = this.getRecommendedSettings();
        
        // Apply renderer settings
        if (game.renderer) {
            game.renderer.setPixelRatio(settings.pixelRatio);
        }
        
        // Apply particle settings
        if (game.particles) {
            game.particles.setEnabled(settings.particles > 0);
            game.particles.setIntensity(settings.particles / 100);
        }
        
        // Apply bot/food counts
        if (game.foodManager) {
            game.foodManager.setTargetCount(settings.food);
        }
        
        // Store for later use
        game.fpsGenSettings = settings;
    }
}

// Singleton instance
let fpsManagerInstance: FPSManager | null = null;

export function getFPSManager(config?: Partial<FPSConfig>): FPSManager {
    if (!fpsManagerInstance) {
        fpsManagerInstance = new FPSManager(config);
    }
    return fpsManagerInstance;
}

export function resetFPSManager(): void {
    fpsManagerInstance?.stop();
    fpsManagerInstance = null;
}
