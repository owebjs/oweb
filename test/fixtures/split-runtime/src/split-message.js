import { splitVersion } from './split-version.js';

export function getSplitMessage() {
    return `helper-${splitVersion}`;
}
