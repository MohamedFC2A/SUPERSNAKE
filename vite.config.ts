import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';

function computeBuildId(): string {
    const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
    if (fromVercel && fromVercel.length >= 7) return fromVercel.slice(0, 7);

    try {
        const out = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
        if (out) return out;
    } catch {
        // ignore
    }

    return 'dev';
}

function emitBuildJson(buildId: string): Plugin {
    return {
        name: 'emit-build-json',
        apply: 'build',
        generateBundle() {
            this.emitFile({
                type: 'asset',
                fileName: 'build.json',
                source: JSON.stringify({ buildId, builtAt: new Date().toISOString() }, null, 2),
            });
        },
    };
}

const buildId = computeBuildId();

export default defineConfig({
    define: {
        __BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [emitBuildJson(buildId)],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 5173,
        open: true,
    },
});
