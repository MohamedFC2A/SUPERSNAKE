/**
 * AudioManager - Lightweight Web Audio API SFX system
 * 
 * Features:
 * - Programmatic sound generation (no external files needed)
 * - Mobile audio unlock on first user gesture
 * - Rate limiting per sound (cooldown)
 * - Master volume + SFX volume integration
 * - Pitch variance for natural feel
 */

export interface SoundOptions {
    volume?: number;         // 0-1, relative to master
    pitchVariance?: number;  // e.g., 0.03 = ±3%
    cooldownMs?: number;     // minimum ms between plays
}

interface SoundState {
    lastPlayTime: number;
    activeNodes: number;
}

type SoundName =
    | 'click'
    | 'hover'
    | 'collect'
    | 'death'
    | 'start'
    | 'pause'
    | 'resume'
    | 'levelUp'
    | 'bossSpawn'
    | 'bossRumble'
    | 'bossTick'
    | 'bossExplode';

const DEFAULT_COOLDOWNS: Record<SoundName, number> = {
    click: 50,
    hover: 100,
    collect: 30,
    death: 500,
    start: 500,
    pause: 200,
    resume: 200,
    levelUp: 300,
    bossSpawn: 1500,
    bossRumble: 2500,
    bossTick: 120,
    bossExplode: 1500,
};

const MAX_SIMULTANEOUS = 3;

export class AudioManager {
    private static instance: AudioManager | null = null;

    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private isUnlocked: boolean = false;
    private isEnabled: boolean = true;
    private masterVolume: number = 0.8;
    private sfxVolume: number = 0.7;

    private soundStates: Map<SoundName, SoundState> = new Map();

    private constructor() {
        // Initialize sound states
        for (const name of Object.keys(DEFAULT_COOLDOWNS) as SoundName[]) {
            this.soundStates.set(name, { lastPlayTime: 0, activeNodes: 0 });
        }

        // Setup audio unlock listeners
        this.setupUnlockListeners();
    }

    static getInstance(): AudioManager {
        if (!AudioManager.instance) {
            AudioManager.instance = new AudioManager();
        }
        return AudioManager.instance;
    }

    private setupUnlockListeners(): void {
        const unlock = () => {
            if (this.isUnlocked) return;
            this.initContext();
        };

        // Listen for first user interaction
        const events = ['click', 'touchstart', 'keydown'];
        events.forEach(event => {
            document.addEventListener(event, unlock, { once: false, passive: true });
        });
    }

    private initContext(): void {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            this.isUnlocked = true;
            return;
        }

        try {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.updateMasterVolume();
            this.isUnlocked = true;
        } catch (e) {
            console.warn('Web Audio API not available:', e);
        }
    }

    private updateMasterVolume(): void {
        if (this.masterGain) {
            const effectiveVolume = this.isEnabled ? this.masterVolume * this.sfxVolume : 0;
            this.masterGain.gain.setValueAtTime(effectiveVolume, this.ctx?.currentTime || 0);
        }
    }

    // ===== Public API =====

    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.updateMasterVolume();
    }

    setMasterVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume / 100));
        this.updateMasterVolume();
    }

    setSfxVolume(volume: number): void {
        this.sfxVolume = Math.max(0, Math.min(1, volume / 100));
        this.updateMasterVolume();
    }

    /**
     * Play a sound effect
     */
    play(name: SoundName, options: SoundOptions = {}): void {
        if (!this.isEnabled || !this.ctx || !this.masterGain) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const state = this.soundStates.get(name);
        if (!state) return;

        // Rate limiting
        const cooldown = options.cooldownMs ?? DEFAULT_COOLDOWNS[name];
        const now = performance.now();
        if (now - state.lastPlayTime < cooldown) return;

        // Max simultaneous check
        if (state.activeNodes >= MAX_SIMULTANEOUS) return;

        state.lastPlayTime = now;
        state.activeNodes++;

        // Generate and play the sound
        const volume = options.volume ?? 1;
        const pitchVariance = options.pitchVariance ?? 0.03;
        const pitchMultiplier = 1 + (Math.random() * 2 - 1) * pitchVariance;

        this.synthesizeSound(name, volume, pitchMultiplier, () => {
            state.activeNodes = Math.max(0, state.activeNodes - 1);
        });
    }

    /**
     * Synthesize sounds programmatically using Web Audio oscillators
     * Produces short, subtle, UI-like sounds
     */
    private synthesizeSound(
        name: SoundName,
        volume: number,
        pitchMultiplier: number,
        onEnd: () => void
    ): void {
        if (!this.ctx || !this.masterGain) {
            onEnd();
            return;
        }

        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Create gain node for this sound
        const gainNode = ctx.createGain();
        gainNode.connect(this.masterGain);
        gainNode.gain.setValueAtTime(0, now);

        let cleanupMs = 500;
        switch (name) {
            case 'click':
                this.createClick(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 120;
                break;
            case 'hover':
                this.createHover(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 120;
                break;
            case 'collect':
                this.createCollect(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 200;
                break;
            case 'death':
                this.createDeath(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 600;
                break;
            case 'start':
                this.createStart(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 500;
                break;
            case 'pause':
                this.createPause(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 300;
                break;
            case 'resume':
                this.createResume(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 300;
                break;
            case 'levelUp':
                this.createLevelUp(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 600;
                break;
            case 'bossSpawn':
                this.createBossSpawn(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 950;
                break;
            case 'bossRumble':
                this.createBossRumble(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 800;
                break;
            case 'bossTick':
                this.createBossTick(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 150;
                break;
            case 'bossExplode':
                this.createBossExplode(ctx, gainNode, now, volume, pitchMultiplier);
                cleanupMs = 900;
                break;
        }

        // Cleanup after sound duration
        setTimeout(() => {
            gainNode.disconnect();
            onEnd();
        }, cleanupMs);
    }

    // ===== Sound Synthesizers =====
    // All sounds are short, soft, and subtle

    private createClick(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Short tick sound - sine wave with fast attack/decay
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(400 * pitch, t + 0.05);
        osc.connect(gain);

        gain.gain.setValueAtTime(0.15 * vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

        osc.start(t);
        osc.stop(t + 0.07);
    }

    private createHover(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Very subtle high-pitched blip
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200 * pitch, t);
        osc.connect(gain);

        gain.gain.setValueAtTime(0.03 * vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

        osc.start(t);
        osc.stop(t + 0.04);
    }

    private createCollect(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Soft ascending "pop" - two quick notes
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(400 * pitch, t);
        osc1.frequency.exponentialRampToValueAtTime(600 * pitch, t + 0.05);
        osc1.connect(gain);

        gain.gain.setValueAtTime(0.1 * vol, t);
        gain.gain.linearRampToValueAtTime(0.12 * vol, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

        osc1.start(t);
        osc1.stop(t + 0.11);
    }

    private createDeath(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Low descending thud
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(60 * pitch, t + 0.3);
        osc.connect(gain);

        gain.gain.setValueAtTime(0.2 * vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

        osc.start(t);
        osc.stop(t + 0.4);
    }

    private createStart(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Two-note ascending chime
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'sine';
        osc2.type = 'sine';

        osc1.frequency.setValueAtTime(523 * pitch, t); // C5
        osc2.frequency.setValueAtTime(659 * pitch, t + 0.08); // E5

        osc1.connect(gain);
        osc2.connect(gain);

        gain.gain.setValueAtTime(0.1 * vol, t);
        gain.gain.setValueAtTime(0.12 * vol, t + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

        osc1.start(t);
        osc1.stop(t + 0.12);
        osc2.start(t + 0.08);
        osc2.stop(t + 0.26);
    }

    private createPause(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Descending two notes
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500 * pitch, t);
        osc.frequency.setValueAtTime(400 * pitch, t + 0.08);
        osc.connect(gain);

        gain.gain.setValueAtTime(0.08 * vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

        osc.start(t);
        osc.stop(t + 0.2);
    }

    private createResume(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Ascending two notes (opposite of pause)
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400 * pitch, t);
        osc.frequency.setValueAtTime(500 * pitch, t + 0.08);
        osc.connect(gain);

        gain.gain.setValueAtTime(0.08 * vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

        osc.start(t);
        osc.stop(t + 0.2);
    }

    private createLevelUp(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Quick ascending arpeggio
        const notes = [523, 659, 784]; // C5, E5, G5
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * pitch, t + i * 0.06);
            osc.connect(gain);

            gain.gain.setValueAtTime(0.08 * vol, t + i * 0.06);

            osc.start(t + i * 0.06);
            osc.stop(t + i * 0.06 + 0.1);
        });

        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    }

    private createBossSpawn(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Deep "presence" hit + short rising rasp (no music, just impact)
        const low = ctx.createOscillator();
        low.type = 'sine';
        low.frequency.setValueAtTime(70 * pitch, t);
        low.frequency.exponentialRampToValueAtTime(42 * pitch, t + 0.7);
        low.connect(gain);

        const mid = ctx.createOscillator();
        mid.type = 'triangle';
        mid.frequency.setValueAtTime(180 * pitch, t + 0.02);
        mid.frequency.exponentialRampToValueAtTime(280 * pitch, t + 0.22);
        mid.connect(gain);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.25 * vol, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

        low.start(t);
        low.stop(t + 0.9);
        mid.start(t + 0.02);
        mid.stop(t + 0.24);
    }

    private createBossRumble(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Low rumble pulse (subtle, not constant)
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(55 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(38 * pitch, t + 0.5);
        osc.connect(gain);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.14 * vol, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

        osc.start(t);
        osc.stop(t + 0.7);
    }

    private createBossTick(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Sharp, short tick for final seconds
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(900 * pitch, t);
        osc.connect(gain);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.05 * vol, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

        osc.start(t);
        osc.stop(t + 0.08);
    }

    private createBossExplode(
        ctx: AudioContext,
        gain: GainNode,
        t: number,
        vol: number,
        pitch: number
    ): void {
        // Noise burst + low boom (lightweight)
        const bufferSize = Math.floor(ctx.sampleRate * 0.35);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900 * pitch, t);
        filter.frequency.exponentialRampToValueAtTime(220 * pitch, t + 0.25);

        noise.connect(filter);
        filter.connect(gain);

        const boom = ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(80 * pitch, t);
        boom.frequency.exponentialRampToValueAtTime(32 * pitch, t + 0.45);
        boom.connect(gain);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.28 * vol, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

        noise.start(t);
        noise.stop(t + 0.38);
        boom.start(t);
        boom.stop(t + 0.78);
    }
}

// Export singleton getter
export const getAudioManager = AudioManager.getInstance;
