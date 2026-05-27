import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnvKeys(content: string) {
    const keys = new Set<string>();

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const normalizedLine = line.startsWith('export ') ? line.slice(7).trimStart() : line;
        const equalsIndex = normalizedLine.indexOf('=');
        if (equalsIndex === -1) continue;

        const key = normalizedLine.slice(0, equalsIndex).trim();
        if (ENV_KEY_PATTERN.test(key)) keys.add(key);
    }

    return Array.from(keys).sort();
}

export function createEnvTypes(keys: string[]) {
    const properties = keys.map((key) => `            ${key}: string;`).join('\n');

    return `declare global {
    namespace NodeJS {
        interface ProcessEnv {
${properties}
        }
    }
}

export {};
`;
}

export async function generateEnvTypes(
    envPath = path.resolve(process.cwd(), '.env'),
    outputPath = path.resolve(process.cwd(), 'oweb-env.d.ts'),
) {
    let content: string;

    try {
        content = await readFile(envPath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }

    const keys = parseEnvKeys(content);

    await writeFile(outputPath, createEnvTypes(keys));
    return true;
}

export function watchEnvTypes(
    envPath = path.resolve(process.cwd(), '.env'),
    outputPath = path.resolve(process.cwd(), 'oweb-env.d.ts'),
    onError?: (error: Error) => void,
): FSWatcher {
    const watcher = chokidar.watch(envPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 150,
            pollInterval: 50,
        },
        usePolling: true,
    });

    let operationQueue = Promise.resolve();

    const enqueueGenerate = (writeEmpty = false) => {
        operationQueue = operationQueue
            .then(async () => {
                if (writeEmpty) {
                    await writeFile(outputPath, createEnvTypes([]));
                    return;
                }

                await generateEnvTypes(envPath, outputPath);
            })
            .catch((error) => {
                onError?.(error);
            });
    };

    watcher.on('add', () => enqueueGenerate());
    watcher.on('change', () => enqueueGenerate());
    watcher.on('unlink', () => enqueueGenerate(true));

    return watcher;
}
