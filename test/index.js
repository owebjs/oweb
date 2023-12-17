import Oweb from '../dist/index.js';

const app = new Oweb({ uWebSocketsEnabled: false });

app.setInternalErrorHandler((req, res, err) => {
    res.status(500).send({
        hello_from: 'my custom error handler',
        error: err.message,
    });
});

await app.setup();
await app.loadRoutes({ directory: 'test/routes' });
await app.start({ port: 3000 });

console.log('listening');
