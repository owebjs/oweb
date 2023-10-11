import fs from 'fs';
import path from 'path';

fs.readdirSync('node_modules/uWebSockets.js').forEach((file) => {
    if (file.endsWith('.node')) {
        const source = path.resolve('node_modules/uWebSockets.js/' + file);
        const target = path.resolve('dist/' + file);

        fs.copyFile(source, target, (err) => {
            if (err) throw err;
        });
    }
});
