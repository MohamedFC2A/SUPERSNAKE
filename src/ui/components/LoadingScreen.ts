/**
 * LoadingScreen - Optimized loading screen for mobile
 */

export interface LoadingScreenOptions {
    message?: string;
    showProgress?: boolean;
    autoHide?: boolean;
    minDisplayTime?: number;
}

export class LoadingScreen {
    private container: HTMLElement | null = null;
    private progressBar: HTMLElement | null = null;
    private progressText: HTMLElement | null = null;
    private spinner: HTMLElement | null = null;
    private options: LoadingScreenOptions;
    private startTime: number = 0;
    private isVisible: boolean = false;
    private hideTimeout: number | null = null;

    constructor(options: LoadingScreenOptions = {}) {
        this.options = {
            message: 'Loading...',
            showProgress: false,
            autoHide: false,
            minDisplayTime: 500,
            ...options,
        };
    }

    show(): void {
        if (this.isVisible) return;
        
        this.isVisible = true;
        this.startTime = Date.now();
        
        // Create container if not exists
        if (!this.container) {
            this.createElement();
        }
        
        // Show with animation
        requestAnimationFrame(() => {
            if (this.container) {
                this.container.classList.remove('hidden');
                this.container.style.opacity = '1';
            }
        });
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
    }

    hide(): void {
        if (!this.isVisible || !this.container) return;
        
        // Ensure minimum display time
        const elapsed = Date.now() - this.startTime;
        const remaining = Math.max(0, this.options.minDisplayTime! - elapsed);
        
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
        }
        
        this.hideTimeout = window.setTimeout(() => {
            this.container?.classList.add('hidden');
            this.container!.style.opacity = '0';
            this.isVisible = false;
            
            // Restore body scroll
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
        }, remaining);
    }

    updateProgress(percent: number, message?: string): void {
        if (!this.isVisible) return;
        
        requestAnimationFrame(() => {
            if (this.progressBar) {
                this.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
            }
            if (this.progressText && message) {
                this.progressText.textContent = message;
            }
        });
    }

    setMessage(message: string): void {
        if (this.progressText) {
            this.progressText.textContent = message;
        }
    }

    private createElement(): void {
        this.container = document.createElement('div');
        this.container.className = 'mobile-loading';
        this.container.style.cssText = `
            position: fixed;
            inset: 0;
            background: linear-gradient(180deg, #000000 0%, #0a0a0a 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            transition: opacity 0.3s ease;
            padding: 20px;
        `;

        // Logo/Icon
        const icon = document.createElement('div');
        icon.textContent = '🐍';
        icon.style.cssText = `
            font-size: 80px;
            margin-bottom: 30px;
            animation: float 2s ease-in-out infinite;
            filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.5));
        `;

        // Spinner
        this.spinner = document.createElement('div');
        this.spinner.className = 'mobile-loading-spinner';
        this.spinner.style.cssText = `
            width: 50px;
            height: 50px;
            border: 4px solid rgba(59, 130, 246, 0.2);
            border-top-color: #3B82F6;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-bottom: 20px;
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
        `;

        // Progress bar container
        if (this.options.showProgress) {
            const progressContainer = document.createElement('div');
            progressContainer.style.cssText = `
                width: 100%;
                max-width: 280px;
                height: 4px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                overflow: hidden;
                margin-bottom: 16px;
            `;

            this.progressBar = document.createElement('div');
            this.progressBar.style.cssText = `
                width: 0%;
                height: 100%;
                background: linear-gradient(90deg, #3B82F6, #22C55E);
                border-radius: 2px;
                transition: width 0.3s ease;
                box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
            `;

            progressContainer.appendChild(this.progressBar);
            this.container.appendChild(progressContainer);
        }

        // Message
        this.progressText = document.createElement('div');
        this.progressText.className = 'mobile-loading-text';
        this.progressText.textContent = this.options.message!;
        this.progressText.style.cssText = `
            color: rgba(255, 255, 255, 0.7);
            font-size: 14px;
            text-align: center;
            letter-spacing: 0.5px;
        `;

        // Add elements
        this.container.appendChild(icon);
        this.container.appendChild(this.spinner);
        this.container.appendChild(this.progressText);

        // Add keyframes
        if (!document.getElementById('loading-animations')) {
            const style = document.createElement('style');
            style.id = 'loading-animations';
            style.textContent = `
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(this.container);
    }

    destroy(): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
        }
        this.container?.remove();
        this.container = null;
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
    }
}

// Simple loading overlay for quick use
export function showQuickLoading(message: string = 'Loading...'): () => void {
    const loader = new LoadingScreen({ message, minDisplayTime: 300 });
    loader.show();
    return () => loader.hide();
}
