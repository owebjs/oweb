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
    outDir?: string;
    paths: Record<string, string[]>;
};

export type HMRModuleLoaderSession = {
    version: string;
    tempDir: string;
    tsConfig: TsConfig | null;
    moduleCache: Map<string, string>;
    dependencyCache: Map<string, Set<string>>;
    mongoosePatched: boolean;
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

function traverseModule(ast: t.File, visitors: traverse.Visitor) {
    const traverseFunction = (traverse as any).default ?? traverse;
    traverseFunction(ast, visitors);
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
        outDir: compilerOptions.outDir
            ? path.resolve(path.dirname(tsConfigPath), compilerOptions.outDir)
            : undefined,
        paths: compilerOptions.paths || {},
    } satisfies TsConfig;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getAliasTargetCandidates(targetPath: string, tsConfig: TsConfig) {
    const candidates = [path.resolve(tsConfig.baseUrl, targetPath)];

    if (!tsConfig.outDir) return candidates;

    const normalizedTargetPath = targetPath.replaceAll('\\', '/');

    if (normalizedTargetPath.startsWith('src/')) {
        candidates.push(path.resolve(tsConfig.outDir, normalizedTargetPath.slice('src/'.length)));
    } else if (!normalizedTargetPath.startsWith('dist/')) {
        candidates.push(path.resolve(tsConfig.outDir, normalizedTargetPath));
    }

    return candidates;
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

            for (const candidate of getAliasTargetCandidates(targetPath, tsConfig)) {
                const resolvedPath = resolveExistingPath(candidate);

                if (resolvedPath) return resolvedPath;
            }
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

    traverseModule(ast, {
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

async function patchMongooseForHMR(tempDir: string) {
    const patchModulePath = path.join(tempDir, 'mongoose-hmr-patch.mjs');
    const patchModuleUrl = pathToFileURL(patchModulePath).href;

    try {
        await writeFile(
            patchModulePath,
            `
import mongooseDefault, * as mongooseNamespace from 'mongoose';

const mongoose = mongooseDefault ?? mongooseNamespace.default ?? mongooseNamespace;
const patchKey = Symbol.for('oweb:hmr:mongoose-patch');

function patchModelHost(host) {
    if (!host?.model || host[patchKey]) return;

    const originalModel = host.model;

    host.model = function (name, ...args) {
        const models = this?.models ?? mongoose.models;

        if (args.length > 0 && models?.[name]) {
            return models[name];
        }

        return originalModel.call(this, name, ...args);
    };

    Object.defineProperty(host, patchKey, {
        value: true,
    });
}

patchModelHost(mongoose);
patchModelHost(mongoose.Connection?.prototype);
`,
            'utf-8',
        );

        await import(patchModuleUrl);
    } catch {}
}

export async function createHMRModuleLoaderSession() {
    const version = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempDir = await mkdtemp(path.join(process.cwd(), '.oweb-hmr-'));

    await mkdir(tempDir, { recursive: true });

    return {
        version,
        tempDir,
        tsConfig: await getTsConfig(),
        moduleCache: new Map(),
        dependencyCache: new Map(),
        mongoosePatched: false,
    } satisfies HMRModuleLoaderSession;
}

export async function disposeHMRModuleLoaderSession(session: HMRModuleLoaderSession) {
    await rm(session.tempDir, { recursive: true, force: true }).catch(() => {});
}

export async function collectLocalDependencies(
    filePath: string,
    source?: string,
    session?: HMRModuleLoaderSession,
) {
    const dependencies = new Set<string>();
    const visited = new Set<string>();
    const tsConfig = session?.tsConfig ?? (await getTsConfig());

    async function visit(currentPath: string, currentSource?: string) {
        const resolvedPath = path.resolve(currentPath);
        const key = resolvedPath.toLowerCase();

        if (visited.has(key)) return new Set<string>();
        visited.add(key);

        if (!currentSource && session?.dependencyCache.has(key)) {
            const cachedDependencies = session.dependencyCache.get(key)!;
            for (const dependencyPath of cachedDependencies) {
                dependencies.add(dependencyPath);
            }
            return cachedDependencies;
        }

        const jsSource = await readJavaScript(resolvedPath, currentSource);
        const importSources = getStaticImportSources(jsSource);
        const subtreeDependencies = new Set<string>();

        for (const importSource of importSources) {
            const dependencyPath = resolveImportModule(importSource, resolvedPath, tsConfig);
            if (!dependencyPath) continue;

            const absoluteDependencyPath = path.resolve(dependencyPath);
            subtreeDependencies.add(absoluteDependencyPath);
            dependencies.add(absoluteDependencyPath);

            const childDependencies = await visit(dependencyPath);
            for (const childDependency of childDependencies) {
                subtreeDependencies.add(childDependency);
            }
        }

        if (!currentSource && session) {
            session.dependencyCache.set(key, subtreeDependencies);
        }

        return subtreeDependencies;
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
    session: HMRModuleLoaderSession,
    stack: Set<string>,
) {
    const resolvedPath = path.resolve(filePath);
    const key = resolvedPath.toLowerCase();

    if (session.moduleCache.has(key)) return session.moduleCache.get(key)!;

    const tempModulePath = getTempModulePath(session.tempDir, resolvedPath, session.moduleCache.size);
    const moduleUrl = pathToFileURL(tempModulePath).href;
    session.moduleCache.set(key, moduleUrl);

    if (stack.has(key)) {
        return moduleUrl;
    }

    stack.add(key);

    const jsSource = await readJavaScript(resolvedPath, source);
    const ast = parseModule(jsSource);
    const replacements = new Map<string, string>();

    for (const importSource of getStaticImportSources(jsSource)) {
        const dependencyPath = resolveImportModule(importSource, resolvedPath, session.tsConfig);
        if (!dependencyPath) continue;

        replacements.set(
            importSource,
            await createCacheBustedModuleUrl(
                dependencyPath,
                undefined,
                session,
                stack,
            ),
        );
    }

    traverseModule(ast, {
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

    const code = `${generateModule(ast)}\n//# sourceURL=${pathToFileURL(resolvedPath).href}?t=${session.version}`;
    await writeFile(tempModulePath, code, 'utf-8');
    stack.delete(key);

    return moduleUrl;
}

export async function importFreshModule(
    filePath: string,
    source?: string,
    session?: HMRModuleLoaderSession,
) {
    const ownsSession = !session;
    const loaderSession = session ?? (await createHMRModuleLoaderSession());

    try {
        const moduleUrl = await createCacheBustedModuleUrl(
            filePath,
            source,
            loaderSession,
            new Set(),
        );

        if (!loaderSession.mongoosePatched) {
            await patchMongooseForHMR(loaderSession.tempDir);
            loaderSession.mongoosePatched = true;
        }

        return await import(moduleUrl);
    } finally {
        if (ownsSession) {
            await disposeHMRModuleLoaderSession(loaderSession);
        }
    }
}
