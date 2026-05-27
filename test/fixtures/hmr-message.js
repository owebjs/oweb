import { hmrVersion } from './hmr-version.js';

export function getHmrMessage() {
    return `helper-${hmrVersion}`;
}
