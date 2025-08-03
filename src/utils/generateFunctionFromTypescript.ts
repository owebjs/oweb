import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import path from 'node:path';
import babel from '@babel/core';
import { pathToFileURL } from 'node:url';

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

    const dataUrl = `data:text/javascript,${encodeURIComponent(modifiedCode)}`;
    const module = await import(dataUrl);

    return module.default;
}
