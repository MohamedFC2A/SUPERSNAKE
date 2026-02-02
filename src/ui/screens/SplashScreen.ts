import { BaseScreen } from './BaseScreen';
import { t, onLocaleChange } from '../../i18n';

export interface SplashScreenOptions {
    onComplete: () => void;
    minDisplayTime?: number;
}

/**
 * Splash/Loading Screen with animated logo and tips
 */
export class SplashScreen extends BaseScreen {
    private options: SplashScreenOptions;
    private progressBar: HTMLElement | null = null;
    private tipElement: HTMLElement | null = null;
    private skipButton: HTMLElement | null = null;
    private currentProgress: number = 0;
    private startTime: number = 0;
    private canSkip: boolean = false;
    private unsubscribeLocale: (() => void) | null = null;

    private getTips(): string[] {
        return [
            t('splash.tips.tip1'),
            t('splash.tips.tip2'),
            t('splash.tips.tip3'),
            t('splash.tips.tip4'),
            t('splash.tips.tip5'),
        ];
    }

    constructor(options: SplashScreenOptions) {
        super('splash-screen');
        this.options = {
            minDisplayTime: 2000,
            ...options,
        };
    }

    render(): HTMLElement {
        this.container.className = 'splash-screen';
        const tips = this.getTips();
        this.container.innerHTML = `
            <div class="splash-content">
                <div class="splash-logo">
                    <h1 class="splash-title">${t('app.title')}</h1>
                    <p class="splash-subtitle">${t('app.subtitle')}</p>
                </div>
                <div class="splash-progress">
                    <div class="splash-progress-bar">
                        <div class="splash-progress-fill" id="splashProgressFill"></div>
                    </div>
                    <span class="splash-progress-text" id="splashProgressText">0%</span>
                </div>
                <p class="splash-tip" id="splashTip">${tips[0]}</p>
                <button class="splash-skip hidden" id="splashSkip">${t('splash.skip')}</button>
            </div>
        `;

        this.progressBar = this.container.querySelector('#splashProgressFill');
        this.tipElement = this.container.querySelector('#splashTip');
        this.skipButton = this.container.querySelector('#splashSkip');

        this.skipButton?.addEventListener('click', () => this.skip());

        this.unsubscribeLocale = onLocaleChange(() => {
            // Update skip button text on locale change
            if (this.skipButton) {
                this.skipButton.textContent = t('splash.skip');
            }
        });

        return this.container;
    }

    /**
     * Start the loading sequence
     */
    startLoading(): void {
        this.startTime = Date.now();
        this.rotateTips();
        this.simulateLoading();
    }

    private rotateTips(): void {
        const tips = this.getTips();
        let tipIndex = 0;
        const tipInterval = setInterval(() => {
            if (!this.isVisible) {
                clearInterval(tipInterval);
                return;
            }
            tipIndex = (tipIndex + 1) % tips.length;
            if (this.tipElement) {
                this.tipElement.style.opacity = '0';
                setTimeout(() => {
                    if (this.tipElement) {
                        this.tipElement.textContent = tips[tipIndex];
                        this.tipElement.style.opacity = '1';
                    }
                }, 150);
            }
        }, 3000);
    }

    private simulateLoading(): void {
        const loadInterval = setInterval(() => {
            this.currentProgress += Math.random() * 15 + 5;
            if (this.currentProgress >= 100) {
                this.currentProgress = 100;
                clearInterval(loadInterval);
                this.onLoadComplete();
            }
            this.updateProgress(this.currentProgress);
        }, 200);
    }

    private updateProgress(progress: number): void {
        const clampedProgress = Math.min(100, Math.max(0, progress));
        if (this.progressBar) {
            this.progressBar.style.width = `${clampedProgress}%`;
        }
        const progressText = this.container.querySelector('#splashProgressText');
        if (progressText) {
            progressText.textContent = `${Math.floor(clampedProgress)}%`;
        }

        // Show skip button after minimum time
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= (this.options.minDisplayTime || 2000) && !this.canSkip) {
            this.canSkip = true;
            this.skipButton?.classList.remove('hidden');
        }
    }

    private onLoadComplete(): void {
        const elapsed = Date.now() - this.startTime;
        const remaining = Math.max(0, (this.options.minDisplayTime || 2000) - elapsed);

        setTimeout(() => {
            this.complete();
        }, remaining);
    }

    private skip(): void {
        if (this.canSkip) {
            this.complete();
        }
    }

    private complete(): void {
        this.hide();
        setTimeout(() => {
            this.options.onComplete();
        }, 300);
    }

    destroy(): void {
        this.unsubscribeLocale?.();
    }
}
