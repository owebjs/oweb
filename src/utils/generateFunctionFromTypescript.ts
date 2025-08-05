import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import * as babel from '@babel/core';
import * as t from '@babel/types';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { error } from './logger';

interface TsConfig {
    paths: Record<string, string[]>;
    baseUrl: string;
    outDir: string;
}

async function getTsConfig(projectRoot: string): Promise<TsConfig | null> {
    const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
    if (!existsSync(tsConfigPath)) {
        error('tsconfig.json not found in the project root.', 'HMR');
        return null;
    }

    try {
        const tsConfigFile = await readFile(tsConfigPath, 'utf-8');
        // for some reason comments are allowed in tsconfig.json even tho it's not allowed in json
        // remove them
        const json = JSON.parse(tsConfigFile.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''));

        const compilerOptions = json.compilerOptions || {};
        if (!compilerOptions.outDir) {
            error('`compilerOptions.outDir` is not defined in tsconfig.json.', 'HMR');
            return null;
        }

        const baseUrl = path.resolve(path.dirname(tsConfigPath), compilerOptions.baseUrl || '.');
        const outDir = path.resolve(path.dirname(tsConfigPath), compilerOptions.outDir);
        const paths = compilerOptions.paths || {};

        return { paths, baseUrl, outDir };
    } catch (e: any) {
        error(`Error reading or parsing tsconfig.json: ${e.message}`, 'HMR');
        return null;
    }
}

function resolveAliasToSourcePath(importPath: string, tsConfig: TsConfig) {
    const { paths, baseUrl } = tsConfig;
    for (const alias in paths) {
        // regex to match the alias pattern (from '@/utils/*' to '^@/utils/(.*)$')
        const aliasPattern = new RegExp(`^${alias.replace('*', '(.*)')}$`);
        const match = importPath.match(aliasPattern);

        if (match) {
            const [_fullMatch, restOfPath] = match;
            const targetPath = paths[alias][0];

            if (!alias.endsWith('*')) {
                return path.resolve(baseUrl, targetPath);
            }

            const resolvedPath = targetPath.replace('*', restOfPath);
            return path.resolve(baseUrl, resolvedPath);
        }
    }
    return null;
}

export default async function generateFunctionFromTypescript<T = any>(
    tsCode: string,
    filePath: string,
) {
    const projectRoot = process.cwd();
    const tsConfig = await getTsConfig(projectRoot);

    if (!tsConfig) {
        throw new Error('Failed to load or validate tsconfig.json configuration.');
    }

    const result = babel.transformSync(tsCode, {
        presets: ['@babel/preset-typescript'],
        filename: filePath,
    });

    const jsCode = result?.code ?? '';
    const ast = parse(jsCode, { sourceType: 'module' });
    const originalFileDir = path.dirname(filePath);

    traverse.default(ast, {
        ImportDeclaration(astPath: NodePath<t.ImportDeclaration>) {
            const importNode = astPath.node.source;
            const importPath = importNode.value;
            let resolvedPathForDist: string | null = null;

            const aliasedSourcePath = resolveAliasToSourcePath(importPath, tsConfig);

            if (aliasedSourcePath) {
                resolvedPathForDist = path.relative(tsConfig.baseUrl, aliasedSourcePath);
            } else if (importPath.startsWith('.')) {
                const absoluteSourcePath = path.resolve(originalFileDir, importPath);
                resolvedPathForDist = path.relative(tsConfig.baseUrl, absoluteSourcePath);
            }

            if (resolvedPathForDist) {
                if (resolvedPathForDist.startsWith('src' + path.sep)) {
                    resolvedPathForDist = resolvedPathForDist.substring('src'.length + 1);
                }

                let jsPath = resolvedPathForDist.replace(/\.(ts|js|mts|cts)$/, '.js');

                // in ts, we can import ts files without the extension. For compatibility, we need to add .js at the end
                if (!jsPath.endsWith('.js')) {
                    jsPath = jsPath + '.js';
                }

                if (jsPath.startsWith('dist')) {
                    jsPath = jsPath.slice('dist'.length + 1);
                }

                const targetDistPath = path.join(tsConfig.outDir, jsPath);

                importNode.value = pathToFileURL(targetDistPath).href;
            }
        },
    });

    const { code: modifiedCode } = generate.default(ast);

    const tempFileName = `oweb-temp-${randomBytes(16).toString('hex')}.mjs`;
    const tempFilePath = path.join(process.cwd(), tempFileName);

    let module: { default: T } | undefined;
    try {
        await writeFile(tempFilePath, modifiedCode, 'utf-8');
        const moduleUrl = pathToFileURL(tempFilePath).href;
        module = await import(moduleUrl);
    } finally {
        await unlink(tempFilePath).catch(() => {});
    }

    if (!module || typeof module.default === 'undefined') {
        throw new Error(
            `The file ${filePath} was processed, but it did not have a default export.`,
        );
    }

    return module.default;
}
