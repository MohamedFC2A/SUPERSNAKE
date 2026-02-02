/**
 * Lightweight hash-based Router for vanilla TypeScript SPA
 */

export interface Route {
    path: string;
    handler: () => HTMLElement | Promise<HTMLElement>;
    title?: string;
}

export type RouteChangeCallback = (path: string) => void;

export class Router {
    private routes: Map<string, Route> = new Map();
    private currentPath: string = '';
    private notFoundHandler: (() => HTMLElement) | null = null;
    private listeners: Set<RouteChangeCallback> = new Set();
    private container: HTMLElement | null = null;

    constructor() {
        // Listen for hash changes
        window.addEventListener('hashchange', () => this.handleHashChange());
        window.addEventListener('load', () => this.handleHashChange());
    }

    /**
     * Register a route
     */
    register(path: string, handler: () => HTMLElement | Promise<HTMLElement>, title?: string): this {
        this.routes.set(path, { path, handler, title });
        return this;
    }

    /**
     * Register multiple routes at once
     */
    registerAll(routes: Route[]): this {
        routes.forEach(route => this.routes.set(route.path, route));
        return this;
    }

    /**
     * Set the 404 handler
     */
    setNotFound(handler: () => HTMLElement): this {
        this.notFoundHandler = handler;
        return this;
    }

    /**
     * Set the container element where pages will be mounted
     */
    setContainer(container: HTMLElement): this {
        this.container = container;
        return this;
    }

    /**
     * Navigate to a path
     */
    navigate(path: string): void {
        if (path.startsWith('#')) {
            path = path.slice(1);
        }
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        window.location.hash = path;
    }

    /**
     * Get current path
     */
    getCurrentPath(): string {
        return this.currentPath;
    }

    /**
     * Subscribe to route changes
     */
    onRouteChange(callback: RouteChangeCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Handle hash change event
     */
    private async handleHashChange(): Promise<void> {
        let hash = window.location.hash.slice(1) || '/';

        // Normalize path
        if (!hash.startsWith('/')) {
            hash = '/' + hash;
        }

        this.currentPath = hash;

        // Notify listeners
        this.listeners.forEach(cb => cb(hash));

        // Find matching route
        const route = this.routes.get(hash);

        if (route) {
            // Update document title
            if (route.title) {
                document.title = route.title + ' | Snake Survival';
            }

            // Mount the page
            if (this.container) {
                try {
                    const element = await route.handler();
                    this.container.innerHTML = '';
                    this.container.appendChild(element);
                } catch (error) {
                    console.error('Error mounting route:', error);
                }
            }
        } else if (this.notFoundHandler) {
            document.title = '404 | Snake Survival';
            if (this.container) {
                this.container.innerHTML = '';
                this.container.appendChild(this.notFoundHandler());
            }
        }
    }

    /**
     * Initialize router and trigger initial route
     */
    init(): void {
        // If no hash, default to home
        if (!window.location.hash) {
            window.location.hash = '/';
        } else {
            this.handleHashChange();
        }
    }
}

// Singleton instance
let routerInstance: Router | null = null;

export function getRouter(): Router {
    if (!routerInstance) {
        routerInstance = new Router();
    }
    return routerInstance;
}
