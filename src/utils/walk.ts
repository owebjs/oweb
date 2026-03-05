import { readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mergePaths } from './utils';
import { Hook } from '../structures/Hook';
import { warn } from './logger';

export interface WalkResult {
    name: string;
    path: string;
    hooks: (typeof Hook)[];
    rel: string;
    filePath: string;
}

const isParentOrGrandparent = (parentFolderPath: string, childFolderPath: string) => {
    if (childFolderPath.startsWith(parentFolderPath)) {
        const relativePath = path.relative(parentFolderPath, childFolderPath);

        const relativeSegments = relativePath.split(path.sep);

        return relativeSegments.length > 2 || relativePath == '' || relativePath.length > 0;
    }

    return false;
};

export const walk = async (
    directory: string,
    tree: string[] = [],
    fallbackDir?: string,
    hookPaths: Set<string> = new Set(),
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

        // if it's a hook which its path is routes/_hooks.js
        if (fileName == '_hooks.js' || fileName == '_hooks.ts') {
            hookPaths.add(directoryResolve);
            continue;
        }

        const fileStats = statSync(filePath);

        if (fileStats.isDirectory()) {
            results.push(...(await walk(filePath, [...tree, fileName], fallbackDir, hookPaths)));
        } else {
            if (!['.js', '.ts'].includes(path.extname(fileName))) continue;

            const spread = [...hookPaths];

            const hooks = spread.filter((hookPath: string) => {
                const ren = isParentOrGrandparent(hookPath, directoryResolve);
                return ren;
            });

            const copyHooks = [hooks].flat(); // using toSorted would be great if it supports node 16 and beyond
            let scopingSort = copyHooks.sort((a: string, b: string) => b.length - a.length); // sort nearest

            const scopeIndex = scopingSort.findIndex((pathstr: string) => {
                const lastdir = pathstr.split(path.sep).at(-1);
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
                let targetFile = '';

                if (fallbackDir) {
                    let rootWalkDir = directoryResolve;
                    for (let i = 0; i < tree.length; i++) {
                        rootWalkDir = path.dirname(rootWalkDir);
                    }

                    const relHook = path.relative(rootWalkDir, hookPath);

                    const fallbackRoot = path.isAbsolute(fallbackDir)
                        ? fallbackDir
                        : path.join(process.cwd(), fallbackDir);
                    const targetDir = path.join(fallbackRoot, relHook);
                    targetFile = path.join(targetDir, '_hooks.js');
                } else {
                    targetFile = path.join(hookPath, '_hooks.js');
                }

                return pathToFileURL(targetFile).href;
            });

            const hookFunctions = [];

            for (const importPath of hooksImport) {
                try {
                    const imp = await import(importPath);
                    if (imp?.default) {
                        hookFunctions.push(imp.default);
                    }
                } catch (e) {
                    warn(`Failed to load hook from ${importPath}. Make sure the file exists.`);
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
