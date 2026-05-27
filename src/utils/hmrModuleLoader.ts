import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import * as babel from '@babel/core';
import * as t from '@babel/types';
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MODULE_EXTENSIONS = ['.js', '.ts', '.mjs', '.mts', '.cjs', '.cts'];

type TsConfig = {
    baseUrl: string;
    paths: Record<string, string[]>;
};

function toJavaScript(source: string, filePath: string) {
    if (!/\.(ts|mts|cts)$/.test(filePath)) return source;

    return (
        babel.transformSync(source, {
            presets: ['@babel/preset-typescript'],
            filename: filePath,
        })?.code ?? ''
    );
}

function parseModule(source: string) {
    return parse(source, {
        sourceType: 'module',
        plugins: ['importAttributes'],
    });
}

function generateModule(ast: t.File) {
    const generateFunction = (generate as any).default ?? generate;
    return generateFunction(ast).code;
}

function isFile(filePath: string) {
    try {
        return existsSync(filePath) && statSync(filePath).isFile();
    } catch {
        return false;
    }
}

function resolveExistingPath(filePath: string) {
    if (isFile(filePath)) return filePath;

    const ext = path.extname(filePath);

    if (ext) {
        const withoutExt = filePath.slice(0, -ext.length);

        for (const candidateExt of MODULE_EXTENSIONS) {
            const candidate = withoutExt + candidateExt;
            if (isFile(candidate)) return candidate;
        }

        return null;
    }

    for (const candidateExt of MODULE_EXTENSIONS) {
        const candidate = filePath + candidateExt;
        if (isFile(candidate)) return candidate;
    }

    for (const candidateExt of MODULE_EXTENSIONS) {
        const candidate = path.join(filePath, 'index' + candidateExt);
        if (isFile(candidate)) return candidate;
    }

    return null;
}

function stripJsonComments(source: string) {
    return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
}

async function getTsConfig() {
    const tsConfigPath = path.join(process.cwd(), 'tsconfig.json');
    if (!existsSync(tsConfigPath)) return null;

    const tsConfigFile = await readFile(tsConfigPath, 'utf-8');
    const json = JSON.parse(stripJsonComments(tsConfigFile));
    const compilerOptions = json.compilerOptions || {};

    return {
        baseUrl: path.resolve(path.dirname(tsConfigPath), compilerOptions.baseUrl || '.'),
        paths: compilerOptions.paths || {},
    } satisfies TsConfig;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveAliasModule(specifier: string, tsConfig: TsConfig | null) {
    if (!tsConfig) return null;

    for (const alias of Object.keys(tsConfig.paths)) {
        const targets = tsConfig.paths[alias];
        if (!targets?.length) continue;

        const aliasPattern = new RegExp(`^${escapeRegExp(alias).replace('\\*', '(.*)')}$`);
        const match = specifier.match(aliasPattern);
        if (!match) continue;

        const rest = match[1] || '';

        for (const target of targets) {
            const targetPath = target.includes('*') ? target.replace('*', rest) : target;
            const resolvedPath = resolveExistingPath(path.resolve(tsConfig.baseUrl, targetPath));

            if (resolvedPath) return resolvedPath;
        }
    }

    return null;
}

function resolveImportModule(specifier: string, importerPath: string, tsConfig: TsConfig | null) {
    if (specifier.startsWith('.')) {
        return resolveExistingPath(path.resolve(path.dirname(importerPath), specifier));
    }

    return resolveAliasModule(specifier, tsConfig);
}

function getStaticImportSources(source: string) {
    const ast = parseModule(source);
    const sources = new Set<string>();

    traverse.default(ast, {
        ImportDeclaration(astPath: NodePath<t.ImportDeclaration>) {
            sources.add(astPath.node.source.value);
        },
        ExportNamedDeclaration(astPath: NodePath<t.ExportNamedDeclaration>) {
            if (astPath.node.source) sources.add(astPath.node.source.value);
        },
        ExportAllDeclaration(astPath: NodePath<t.ExportAllDeclaration>) {
            sources.add(astPath.node.source.value);
        },
    });

    return Array.from(sources);
}

async function readJavaScript(filePath: string, source?: string) {
    const rawSource = source ?? (await readFile(filePath, 'utf-8'));
    return toJavaScript(rawSource, filePath);
}

export async function collectLocalDependencies(filePath: string, source?: string) {
    const dependencies = new Set<string>();
    const visited = new Set<string>();
    const tsConfig = await getTsConfig();

    async function visit(currentPath: string, currentSource?: string) {
        const resolvedPath = path.resolve(currentPath);
        const key = resolvedPath.toLowerCase();

        if (visited.has(key)) return;
        visited.add(key);

        const jsSource = await readJavaScript(resolvedPath, currentSource);
        const importSources = getStaticImportSources(jsSource);

        for (const importSource of importSources) {
            const dependencyPath = resolveImportModule(importSource, resolvedPath, tsConfig);
            if (!dependencyPath) continue;

            dependencies.add(path.resolve(dependencyPath));
            await visit(dependencyPath);
        }
    }

    await visit(filePath, source);

    return dependencies;
}

function getTempModulePath(tempDir: string, filePath: string, index: number) {
    const basename = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(tempDir, `${index}-${basename}.mjs`);
}

async function createCacheBustedModuleUrl(
    filePath: string,
    source: string | undefined,
    version: string,
    tempDir: string,
    tsConfig: TsConfig | null,
    cache: Map<string, string>,
    stack: Set<string>,
) {
    const resolvedPath = path.resolve(filePath);
    const key = resolvedPath.toLowerCase();

    if (cache.has(key)) return cache.get(key)!;

    const tempModulePath = getTempModulePath(tempDir, resolvedPath, cache.size);
    const moduleUrl = pathToFileURL(tempModulePath).href;
    cache.set(key, moduleUrl);

    if (stack.has(key)) {
        return moduleUrl;
    }

    stack.add(key);

    const jsSource = await readJavaScript(resolvedPath, source);
    const ast = parseModule(jsSource);
    const replacements = new Map<string, string>();

    for (const importSource of getStaticImportSources(jsSource)) {
        const dependencyPath = resolveImportModule(importSource, resolvedPath, tsConfig);
        if (!dependencyPath) continue;

        replacements.set(
            importSource,
            await createCacheBustedModuleUrl(
                dependencyPath,
                undefined,
                version,
                tempDir,
                tsConfig,
                cache,
                stack,
            ),
        );
    }

    traverse.default(ast, {
        ImportDeclaration(astPath: NodePath<t.ImportDeclaration>) {
            const replacement = replacements.get(astPath.node.source.value);
            if (replacement) astPath.node.source.value = replacement;
        },
        ExportNamedDeclaration(astPath: NodePath<t.ExportNamedDeclaration>) {
            const sourceNode = astPath.node.source;
            if (!sourceNode) return;

            const replacement = replacements.get(sourceNode.value);
            if (replacement) sourceNode.value = replacement;
        },
        ExportAllDeclaration(astPath: NodePath<t.ExportAllDeclaration>) {
            const replacement = replacements.get(astPath.node.source.value);
            if (replacement) astPath.node.source.value = replacement;
        },
    });

    const code = `${generateModule(ast)}\n//# sourceURL=${pathToFileURL(resolvedPath).href}?t=${version}`;
    await writeFile(tempModulePath, code, 'utf-8');
    stack.delete(key);

    return moduleUrl;
}

export async function importFreshModule(filePath: string, source?: string) {
    const version = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempDir = await mkdtemp(path.join(process.cwd(), '.oweb-hmr-'));
    const tsConfig = await getTsConfig();

    try {
        await mkdir(tempDir, { recursive: true });
        const moduleUrl = await createCacheBustedModuleUrl(
            filePath,
            source,
            version,
            tempDir,
            tsConfig,
            new Map(),
            new Set(),
        );

        return await import(moduleUrl);
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}
