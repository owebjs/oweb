import type { ParsedPath } from 'node:path';

export const mergePaths = (...paths: string[]) =>
    '/' +
    paths
        .map((path) => path.replace(/^\/|\/$/g, ''))
        .filter((path) => path !== '')
        .join('/');

const regBackets = /\[([^}]*)\]/g;

const transformBrackets = (value: string) =>
    regBackets.test(value) ? value.replace(regBackets, (_, s) => `:${s}`) : value;

export const convertParamSyntax = (path: string) => {
    const subpaths = [];

    for (const subpath of path.split('/')) {
        subpaths.push(transformBrackets(subpath));
    }

    return mergePaths(...subpaths);
};

export const convertCatchallSyntax = (url: string) => url.replace(/:\.\.\.\w+/g, '*');

export const buildRoutePath = (parsedFile: ParsedPath) => {
    const directory = parsedFile.dir === parsedFile.root ? '' : parsedFile.dir;
    const name = parsedFile.name.startsWith('index')
        ? parsedFile.name.replace('index', '')
        : `/${parsedFile.name}`;

    return directory + name;
};

export const buildRouteURL = (path: string) => {
    const paths = path.split('/');

    //remove paranthesis used to group hooks to normalize the path
    const normalizedPath = paths
        .map((x) => {
            if (x.startsWith('(') && x.endsWith(')')) {
                x = x.slice(1, -1);
            }
            return x;
        })
        .join('/');

    let method = 'get';

    const paramURL = convertParamSyntax(normalizedPath);
    let url = convertCatchallSyntax(paramURL);

    for (const m of ['.DELETE', '.POST', '.PATCH', '.GET', '.PUT']) {
        if (path.endsWith(m) || path.endsWith(m.toLowerCase())) {
            method = m.toLowerCase().slice(1);
            url = url.slice(0, url.length - m.length);
            break;
        }
    }

    return {
        url,
        method,
    };
};
