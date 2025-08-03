import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import path from 'node:path';
import babel from '@babel/core';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

export default async function generateFunctionFromTypescript(tsCode: string, filePath: string) {
    const result = babel.transformSync(tsCode, {
        presets: ['@babel/preset-typescript'],
        filename: filePath,
    });

    const jsCode = result?.code ?? '';

    const ast = parse(jsCode, {
        sourceType: 'module',
    });

    traverse.default(ast, {
        ImportDeclaration(astPath) {
            const importSourceNode = astPath.node.source;
            let relativePath = importSourceNode.value;

            if (relativePath.startsWith('.')) {
                let resolvedPath = relativePath;

                if (path.extname(relativePath) === '') {
                    resolvedPath = relativePath + '.ts';
                }

                const originalFileDir = path.dirname(filePath);
                const absoluteDepPath = path.resolve(originalFileDir, resolvedPath);

                const absoluteDepUrl = pathToFileURL(absoluteDepPath).href;

                importSourceNode.value = absoluteDepUrl;
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
