/**
 * Base Screen - Abstract base class for all UI screens
 */
export abstract class BaseScreen {
    protected container: HTMLElement;
    protected isVisible: boolean = false;

    constructor(containerId?: string) {
        this.container = document.createElement('div');
        if (containerId) {
            this.container.id = containerId;
        }
    }

    /**
     * Initialize the screen and add to DOM
     */
    abstract render(): HTMLElement;

    /**
     * Show the screen with optional animation
     */
    show(): void {
        this.isVisible = true;
        this.container.classList.remove('hidden');
        this.container.classList.add('fade-in');
    }

    /**
     * Hide the screen with optional animation
     */
    hide(): void {
        this.isVisible = false;
        this.container.classList.add('fade-out');
        setTimeout(() => {
            this.container.classList.add('hidden');
            this.container.classList.remove('fade-out', 'fade-in');
        }, 300);
    }

    /**
     * Immediately hide without animation
     */
    hideImmediate(): void {
        this.isVisible = false;
        this.container.classList.add('hidden');
        this.container.classList.remove('fade-out', 'fade-in');
    }

    /**
     * Get the container element
     */
    getElement(): HTMLElement {
        return this.container;
    }

    /**
     * Check if screen is currently visible
     */
    getIsVisible(): boolean {
        return this.isVisible;
    }

    /**
     * Destroy the screen and remove from DOM
     */
    destroy(): void {
        this.container.remove();
    }
}
