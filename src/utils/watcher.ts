import chokidar from 'chokidar';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

export type HMROperations = 'new-file' | 'delete-file' | 'modify-file';

export function watchDirectory(
    dir: string,
    ignoreInitial: boolean = true,
    onUpdate: (op: HMROperations, path: string, content: string) => void,
) {
    const watcher = chokidar.watch(dir, {
        ignored: /([/\\]\.)|(node_modules)|(dist)/,
        persistent: true,
        ignoreInitial,
        awaitWriteFinish: {
            stabilityThreshold: 150,
            pollInterval: 50,
        },
        usePolling: true,
    });

    const supportedExtensions = ['.js', '.ts'];

    watcher.on('add', async (filePath) => {
        if (!supportedExtensions.includes(extname(filePath))) return;

        const content = readFileSync(filePath, 'utf-8');
        onUpdate('new-file', filePath, content);
    });

    watcher.on('change', async (filePath) => {
        if (!supportedExtensions.includes(extname(filePath))) return;

        const content = readFileSync(filePath, 'utf-8');
        onUpdate('modify-file', filePath, content);
    });

    watcher.on('unlink', (filePath) => {
        if (!supportedExtensions.includes(extname(filePath))) return;

        onUpdate('delete-file', filePath, '');
    });
}
