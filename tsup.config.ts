import { defineConfig } from 'tsup';

export default defineConfig({
    target: "esnext",
    dts: false,
    keepNames: true,
    entryPoints: ['./src/**/*.ts'],
    clean: true,
    format: 'esm',
    splitting: true,
    minify: true,
    config: 'tsconfig.json',
});
