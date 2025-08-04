import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import path from 'node:path';
import babel from '@babel/core';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { error } from './logger';

const require = createRequire(import.meta.url);

async function getAliasesFromTsConfig(tsConfigPath: string) {
    if (!existsSync(tsConfigPath)) {
        return null;
    }

    try {
        const tsConfigFile = await readFile(tsConfigPath, 'utf-8');

        const json = JSON.parse(tsConfigFile.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''));
        const compilerOptions = json.compilerOptions || {};
        const baseUrl = path.resolve(path.dirname(tsConfigPath), compilerOptions.baseUrl || '.');
        const paths = compilerOptions.paths || {};

        return { paths, baseUrl };
    } catch (error) {
        console.error('Error reading or parsing tsconfig.json:', error);
        return null;
    }
}

function resolveAlias(importPath: string, tsConfigPaths: string[], baseUrl: string) {
    for (const alias in tsConfigPaths) {
        const aliasPattern = new RegExp(`^${alias.replace('*', '(.*)')}$`);
        const match = importPath.match(aliasPattern);

        if (match) {
            const [_fullMatch, restOfPath] = match;
            const targetPaths = tsConfigPaths[alias];
            const targetPath = targetPaths[0];

            if (!alias.endsWith('*')) {
                return path.resolve(baseUrl, targetPath);
            }

            const resolvedPath = targetPath.replace('*', restOfPath);
            return path.resolve(baseUrl, resolvedPath);
        }
    }
    return null;
}

export default async function generateFunctionFromTypescript(tsCode: string, filePath: string) {
    const tsConfigPath = path.join(process.cwd(), 'tsconfig.json');
    const tsConfig = await getAliasesFromTsConfig(tsConfigPath);

    const result = babel.transformSync(tsCode, {
        presets: ['@babel/preset-typescript'],
        filename: filePath,
    });

    const jsCode = result?.code ?? '';
    const ast = parse(jsCode, { sourceType: 'module' });
    const fileDir = path.dirname(filePath);

    traverse.default(ast, {
        ImportDeclaration(astPath) {
            const importSourceNode = astPath.node.source;
            const importPath = importSourceNode.value;
            let resolvedUrl = null;

            if (tsConfig && tsConfig.paths) {
                const resolvedAliasPath = resolveAlias(
                    importPath,
                    tsConfig.paths,
                    tsConfig.baseUrl,
                );
                if (resolvedAliasPath) {
                    const finalPath =
                        path.extname(resolvedAliasPath) === ''
                            ? resolvedAliasPath + '.ts'
                            : resolvedAliasPath;
                    resolvedUrl = pathToFileURL(finalPath).href;
                }
            }

            if (!resolvedUrl && importPath.startsWith('.')) {
                const resolvedPathWithExt =
                    path.extname(importPath) === '' ? importPath + '.ts' : importPath;
                const absoluteDepPath = path.resolve(fileDir, resolvedPathWithExt);
                resolvedUrl = pathToFileURL(absoluteDepPath).href;
            }

            if (!resolvedUrl) {
                try {
                    const resolvedNodeModulePath = require.resolve(importPath, {
                        paths: [fileDir],
                    });
                    resolvedUrl = pathToFileURL(resolvedNodeModulePath).href;
                } catch (_) {
                    error(
                        `Could not resolve import path for: ${importPath} in ${filePath}.`,
                        'HMR',
                    );
                }
            }

            if (resolvedUrl) {
                importSourceNode.value = resolvedUrl;
            }
        },
    });

    const { code: modifiedCode } = generate.default(ast);

    const tempFileName = `oweb-temp-${randomBytes(16).toString('hex')}.mjs`;
    const tempFilePath = path.join(tmpdir(), tempFileName);

    let module;
    try {
        await writeFile(tempFilePath, modifiedCode, 'utf-8');
        const moduleUrl = pathToFileURL(tempFilePath).href;
        module = await import(moduleUrl);
    } finally {
        await unlink(tempFilePath).catch(() => {});
    }

    return module.default;
}
