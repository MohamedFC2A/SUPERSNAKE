/**
 * Vector2 - 2D Vector utility class
 */
export class Vector2 {
    constructor(public x: number = 0, public y: number = 0) { }

    static zero(): Vector2 {
        return new Vector2(0, 0);
    }

    static fromAngle(angle: number): Vector2 {
        return new Vector2(Math.cos(angle), Math.sin(angle));
    }

    clone(): Vector2 {
        return new Vector2(this.x, this.y);
    }

    add(v: Vector2): Vector2 {
        return new Vector2(this.x + v.x, this.y + v.y);
    }

    subtract(v: Vector2): Vector2 {
        return new Vector2(this.x - v.x, this.y - v.y);
    }

    multiply(scalar: number): Vector2 {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    divide(scalar: number): Vector2 {
        if (scalar === 0) return this.clone();
        return new Vector2(this.x / scalar, this.y / scalar);
    }

    magnitude(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize(): Vector2 {
        const mag = this.magnitude();
        if (mag === 0) return Vector2.zero();
        return this.divide(mag);
    }

    dot(v: Vector2): number {
        return this.x * v.x + this.y * v.y;
    }

    distance(v: Vector2): number {
        return this.subtract(v).magnitude();
    }

    angle(): number {
        return Math.atan2(this.y, this.x);
    }

    lerp(v: Vector2, t: number): Vector2 {
        return new Vector2(
            this.x + (v.x - this.x) * t,
            this.y + (v.y - this.y) * t
        );
    }

    rotate(angle: number): Vector2 {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vector2(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos
        );
    }

    set(x: number, y: number): void {
        this.x = x;
        this.y = y;
    }
}

/**
 * Random utility functions
 */
export const Random = {
    float(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    },

    int(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    bool(chance: number = 0.5): boolean {
        return Math.random() < chance;
    },

    choice<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)];
    },

    vector(minX: number, maxX: number, minY: number, maxY: number): Vector2 {
        return new Vector2(
            Random.float(minX, maxX),
            Random.float(minY, maxY)
        );
    },

    inCircle(radius: number): Vector2 {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * radius;
        return new Vector2(Math.cos(angle) * r, Math.sin(angle) * r);
    },
};

/**
 * Math utility functions
 */
export const MathUtils = {
    clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    },

    lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    },

    map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
        return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
    },

    degToRad(degrees: number): number {
        return degrees * (Math.PI / 180);
    },

    radToDeg(radians: number): number {
        return radians * (180 / Math.PI);
    },

    angleDiff(a: number, b: number): number {
        const diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
        return diff < -Math.PI ? diff + Math.PI * 2 : diff;
    },
};

/**
 * Color utility functions
 */
export const ColorUtils = {
    hslToRgb(h: number, s: number, l: number): [number, number, number] {
        let r: number, g: number, b: number;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    },

    rgbToHex(r: number, g: number, b: number): string {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    },

    hexToRgb(hex: string): [number, number, number] | null {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
            : null;
    },

    withAlpha(color: string, alpha: number): string {
        const rgb = ColorUtils.hexToRgb(color);
        if (!rgb) return color;
        return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
    },
};
