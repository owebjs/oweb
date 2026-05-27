import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateEnvTypes, parseEnvKeys, watchEnvTypes } from '../../dist/utils/envTypes.js';

let tempDir;

afterEach(async () => {
    if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    }
});

describe('env typings', () => {
    it('parses valid .env keys without values', () => {
        expect(
            parseEnvKeys(`
PORT=3000
DATABASE_URL="postgres://localhost"
export API_KEY=secret
# IGNORED=value
INVALID-KEY=value
PORT=4000
`),
        ).toEqual(['API_KEY', 'DATABASE_URL', 'PORT']);
    });

    it('generates ProcessEnv typings from a .env file', async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'oweb-env-'));
        const envPath = path.join(tempDir, '.env');
        const outputPath = path.join(tempDir, 'oweb-env.d.ts');

        await writeFile(envPath, 'PORT=3000\nDATABASE_URL=postgres://localhost\n');

        await expect(generateEnvTypes(envPath, outputPath)).resolves.toBe(true);
        await expect(readFile(outputPath, 'utf8')).resolves.toContain('PORT: string;');
        await expect(readFile(outputPath, 'utf8')).resolves.toContain('DATABASE_URL: string;');
    });

    it('regenerates typings when .env changes', async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'oweb-env-'));
        const envPath = path.join(tempDir, '.env');
        const outputPath = path.join(tempDir, 'oweb-env.d.ts');

        await writeFile(envPath, 'PORT=3000\n');
        await generateEnvTypes(envPath, outputPath);

        const watcher = watchEnvTypes(envPath, outputPath);

        try {
            await new Promise((resolve) => watcher.on('ready', resolve));
            await writeFile(envPath, 'PORT=3000\nAPI_KEY=secret\n');

            await expect.poll(async () => readFile(outputPath, 'utf8')).toContain(
                'API_KEY: string;',
            );
        } finally {
            await watcher.close();
        }
    });
});
