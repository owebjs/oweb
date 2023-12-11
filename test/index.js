import Oweb from '../dist/index.js';

const app = new Oweb({ uWebSocketsEnabled: true });

await app.setup();
await app.loadRoutes({ directory: 'test/routes' });
await app.start({ port: 3000 });

console.log('listening');
