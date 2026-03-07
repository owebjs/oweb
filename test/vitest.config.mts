import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/spec/**/*.spec.js'],
        environment: 'node',
        testTimeout: 15000,
        hookTimeout: 15000,
        reporters: ['verbose'],
        fileParallelism: false,
        maxConcurrency: 1,
    },
});
