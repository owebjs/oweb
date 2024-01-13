import Oweb from '../dist/index.js';
import fastifyMultipart from '@fastify/multipart';

const app = await new Oweb({ uWebSocketsEnabled: false }).setup();

await app.register(fastifyMultipart, {
    limits: {
        fileSize: 20 * 1024 * 1024,
    },
});

app.setInternalErrorHandler((req, res, err) => {
    res.status(500).send({
        hello_from: 'my custom error handler',
        error: err.message,
    });
});

await app.loadRoutes({ directory: 'test/routes' });
await app.start({ port: 3000 });

console.log('listening');
