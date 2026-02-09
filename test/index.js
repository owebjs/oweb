import Oweb from '../dist/index.js';
import fastifyMultipart from '@fastify/multipart';
import cors from '@fastify/cors';

const app = await new Oweb({ uWebSocketsEnabled: false }).setup();

await app.register(fastifyMultipart, {
    limits: {
        fileSize: 20 * 1024 * 1024,
    },
});

const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];

await app.register(cors, {
    origin: '*',
    methods: allowedMethods,
    allowedHeaders: ['Content-Type', 'Authorization'],
});

app.setInternalErrorHandler((req, res, err) => {
    res.status(500).send({
        hello_from: 'my custom error handler',
        error: err.message,
    });
});

await app.loadRoutes({
    directory: 'test/routes',
    matchersDirectory: 'test/matchers',
    hmr: {
        enabled: true,
        matchersDirectory: 'test/matchers',
        directory: 'test/routes',
    },
});

await app.start({ port: 3000 });

console.log('listening');
