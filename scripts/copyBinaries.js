import fs from 'node:fs';
import path from 'node:path';

for (const file of fs.readdirSync('node_modules/uWebSockets.js')) {
    if (file.endsWith('.node')) {
        fs.copyFileSync(
            path.resolve('node_modules/uWebSockets.js/' + file),
            path.resolve('dist/' + file),
        );
    }
}
