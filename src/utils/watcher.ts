import chokidar, { type FSWatcher } from 'chokidar';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

export type HMROperations = 'new-file' | 'delete-file' | 'modify-file';

export function watchDirectory(
    dir: string,
    ignoreInitial: boolean = true,
    onUpdate: (op: HMROperations, path: string, content: string) => void | Promise<void>,
): FSWatcher {
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
    let operationQueue = Promise.resolve();

    const enqueueUpdate = (op: HMROperations, filePath: string) => {
        if (!supportedExtensions.includes(extname(filePath))) return;

        operationQueue = operationQueue
            .then(() => {
                let content = '';

                if (op !== 'delete-file') {
                    try {
                        content = readFileSync(filePath, 'utf-8');
                    } catch {
                        return;
                    }
                }

                return onUpdate(op, filePath, content);
            })
            .catch(() => {});
    };

    watcher.on('add', (filePath) => {
        enqueueUpdate('new-file', filePath);
    });

    watcher.on('change', (filePath) => {
        enqueueUpdate('modify-file', filePath);
    });

    watcher.on('unlink', (filePath) => {
        enqueueUpdate('delete-file', filePath);
    });

    return watcher;
}
