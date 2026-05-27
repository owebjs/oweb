import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectLocalDependencies } from '../../dist/utils/hmrModuleLoader.js';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(SPEC_DIR, '..', 'fixtures');

describe('HMR module loader', () => {
    it('tracks tsconfig path alias imports as local dependencies', async () => {
        const routePath = path.join(FIXTURE_ROOT, 'routes', 'hmr', 'alias-dependency.js');
        const dependencies = await collectLocalDependencies(
            routePath,
            `import { getHmrMessage } from '@fixtures/hmr-message';`,
        );

        expect(Array.from(dependencies).map((filePath) => path.normalize(filePath))).toContain(
            path.join(FIXTURE_ROOT, 'hmr-message.js'),
        );
    });
});
