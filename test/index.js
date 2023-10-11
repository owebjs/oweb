import Oweb from '../dist/index.js';

const app = new Oweb();

await app.loadRoutes({ routeDir: 'test/routes' });

await app.start({ port: 3000 });

console.log('listening');
