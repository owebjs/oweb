import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mergePaths } from './utils';

export interface WalkResult {
    name: string;
    path: string;
    rel: string;
    filePath: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isParentOrGrandparent = (parentFolderPath: string, childFolderPath: string) => {
    if (childFolderPath.startsWith(parentFolderPath)) {
        const relativePath = path.relative(parentFolderPath, childFolderPath);

        const relativeSegments = relativePath.split(path.sep);

        return relativeSegments.length > 2 || relativePath == '' || relativePath.length > 0;
    }

    return false;
};

const hookPaths = new Set();

export const walk = async (directory: string, tree = []): Promise<WalkResult[]> => {
    const results = [];

    const readDirPriority = readdirSync(directory);

    readDirPriority.sort((a, b) => {
        if (a.startsWith('_') && !b.startsWith('_')) {
            return -1;
        } else if (!a.startsWith('_') && b.startsWith('_')) {
            return 1;
        } else {
            return a.localeCompare(b);
        }
    });

    for (const fileName of readDirPriority) {
        const filePath = path.join(directory, fileName);
        const directoryResolve = path.resolve(directory);

        if (fileName == '_hooks.js' || fileName == '_hooks.ts') {
            hookPaths.add(directoryResolve);
            continue;
        }

        const fileStats = statSync(filePath);

        if (fileStats.isDirectory()) {
            results.push(...(await walk(filePath, [...tree, fileName])));
        } else {
            const spread = [...hookPaths];

            const hooks = spread.filter((hookPath: string) => {
                return isParentOrGrandparent(hookPath, directoryResolve);
            });

            const hooksImport = hooks.map(
                (hookPath: string) =>
                    new URL(hookPath, `file://${__dirname}`).pathname.replaceAll('\\', '/') +
                    '/_hooks.js',
            );

            const hookFunctions = [];

            for (const importPath of hooksImport) {
                const imp = await import(importPath);
                if (imp?.default) {
                    hookFunctions.push(imp.default);
                }
            }

            results.push({
                name: fileName,
                path: directory,
                hooks: hookFunctions,
                rel: mergePaths(...tree, fileName),
                filePath,
            });
        }
    }

    return results;
};
