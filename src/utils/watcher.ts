import chokidar from 'chokidar';
import { readFileSync } from 'fs';

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
    });

    watcher.on('add', async (filePath) => {
        const content = readFileSync(filePath, 'utf-8');
        onUpdate('new-file', filePath, content);
    });

    watcher.on('change', async (filePath) => {
        const content = readFileSync(filePath, 'utf-8');
        onUpdate('modify-file', filePath, content);
    });

    watcher.on('unlink', (filePath) => {
        onUpdate('delete-file', filePath, '');
    });
}
