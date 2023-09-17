import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { mergePaths } from './utils';

export interface WalkResult {
    name: string;
    path: string;
    rel: string;
    filePath: string;
}

export const walk = (directory: string, tree = []): WalkResult[] => {
    const results = [];

    for (const fileName of readdirSync(directory)) {
        const filePath = path.join(directory, fileName);
        const fileStats = statSync(filePath);

        if (fileStats.isDirectory()) {
            results.push(...walk(filePath, [...tree, fileName]));
        } else {
            results.push({
                name: fileName,
                path: directory,
                rel: mergePaths(...tree, fileName),
                filePath,
            });
        }
    }

    return results;
};
