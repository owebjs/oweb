import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mergePaths } from './utils';
import { Hook } from '../structures/Hook';

export interface WalkResult {
    name: string;
    path: string;
    hooks: (typeof Hook)[];
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

export const walk = async (
    directory: string,
    tree = [],
    fallbackDir?: string,
): Promise<WalkResult[]> => {
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

        //if it's a hook which it's path is routes/_hooks.js
        if (fileName == '_hooks.js' || fileName == '_hooks.ts') {
            hookPaths.add(directoryResolve);
            continue;
        }

        const fileStats = statSync(filePath);

        if (fileStats.isDirectory()) {
            results.push(...(await walk(filePath, [...tree, fileName], fallbackDir)));
        } else {
            const spread = [...hookPaths];

            const hooks = spread.filter((hookPath: string) => {
                const ren = isParentOrGrandparent(hookPath, directoryResolve);
                return ren;
            });

            const copyHooks = [hooks].flat(); //using toSorted would be great if it support node 16 and beyond
            let scopingSort = copyHooks.sort((a: string, b: string) => b.length - a.length); //sort nearest

            const scopeIndex = scopingSort.findIndex((path: string) => {
                const lastdir = path.split('\\').at(-1);
                return lastdir.startsWith('(') && lastdir.endsWith(')');
            });

            let useHook = [];

            if (scopeIndex > -1) {
                scopingSort.length = scopeIndex + 1;
                useHook = scopingSort;
            } else {
                useHook = hooks;
            }

            const hooksImport = useHook.map((hookPath: string) => {
                if (fallbackDir) {
                    const findLastPath = hookPath.replace(process.cwd(), '').split('\\').at(-1);

                    const additionNeeded = !fallbackDir.endsWith(`/${findLastPath}`);

                    return (
                        new URL(
                            path.join(
                                process.cwd(),
                                fallbackDir,
                                additionNeeded ? `/${findLastPath}` : '',
                            ),
                        ).pathname.replaceAll('\\', '/') + '/_hooks.js'
                    );
                } else {
                    return (
                        new URL(hookPath, `file://${__dirname}`).pathname.replaceAll('\\', '/') +
                        '/_hooks.js'
                    );
                }
            });

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
