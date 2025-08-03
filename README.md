# Oweb

A flexible and modern web framework built on top of Fastify, designed for creating scalable and maintainable web applications with file-based routing and hot module replacement.

<p align="center">
  <img src="https://img.shields.io/npm/v/owebjs" alt="npm version">
  <img src="https://img.shields.io/npm/l/owebjs" alt="license">
  <img src="https://img.shields.io/npm/dt/owebjs" alt="downloads">
</p>

## Features

- **File-based Routing**: Automatically generate routes based on your file structure
- **Hot Module Replacement (HMR)**: Update your routes without restarting the server
- **Middleware Support**: Use hooks to add middleware functionality
- **Error Handling**: Global and route-specific error handling
- **TypeScript Support**: Built with TypeScript for better developer experience
- **Plugin System**: Extend functionality with plugins
- **uWebSockets.js Support**: Optional high-performance WebSocket server

## Installation

```bash
npm install owebjs
```

## Quick Start

```javascript
import Oweb from 'owebjs';

// Create and setup the app
const app = await new Oweb().setup();

// Load routes from a directory
await app.loadRoutes({
    directory: 'routes',
    hmr: {
        enabled: true, // Enable hot module replacement
    },
});

// Start the server
await app.start({ port: 3000 });
console.log('Server running at http://localhost:3000');
```

## Creating Routes

Routes are automatically generated based on your file structure. Create a file in your routes directory:

```javascript
// routes/hello.js
import { Route } from 'owebjs';

export default class extends Route {
    async handle(req, res) {
        res.send({ message: 'Hello, World!' });
    }
}
```

This will create a GET route at `/hello`.

### Dynamic Routes

Use brackets to create dynamic route parameters:

```javascript
// routes/users/[id].js
import { Route } from 'owebjs';

export default class extends Route {
    async handle(req, res) {
        res.send({ userId: req.params.id });
    }
}
```

This will create a GET route at `/users/:id`.

### HTTP Methods

Specify the HTTP method in the filename:

```javascript
// routes/api/users.post.js
import { Route } from 'owebjs';

export default class extends Route {
    async handle(req, res) {
        // Create a new user
        const user = req.body;
        res.status(201).send({ id: 1, ...user });
    }
}
```

## Middleware (Hooks)

Create hooks to add middleware functionality:

```javascript
// routes/_hooks.js
import { Hook } from 'owebjs';

export default class extends Hook {
    handle(req, res, done) {
        console.log(`${req.method} ${req.url}`);
        done(); // Continue to the next hook or route handler
    }
}
```

Hooks are applied to all routes in the current directory and its subdirectories.

## Error Handling

### Global Error Handler

```javascript
app.setInternalErrorHandler((req, res, error) => {
    console.error(error);
    res.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
    });
});
```

### Route-specific Error Handler

```javascript
import { Route } from 'owebjs';

export default class extends Route {
    async handle(req, res) {
        throw new Error('Something went wrong');
    }

    handleError(req, res, error) {
        res.status(500).send({
            error: 'Route Error',
            message: error.message,
        });
    }
}
```

## Plugins

Oweb supports Fastify plugins and comes with some built-in plugins:

### Using Fastify Plugins

```javascript
import Oweb from 'owebjs';
import fastifyMultipart from '@fastify/multipart';

const app = await new Oweb().setup();

// Register Fastify plugin
await app.register(fastifyMultipart, {
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
});
```

### Using Built-in Plugins

```javascript
import { Route } from 'owebjs';
import { ChunkUpload } from 'owebjs/dist/plugins';

export default class extends Route {
    async handle(req, res) {
        const file = await req.file();
        const buffer = await file.toBuffer();

        await ChunkUpload(
            {
                buffer,
                fileName: file.filename,
                currentChunk: +req.query.currentChunk,
                totalChunks: +req.query.totalChunks,
            },
            {
                path: './uploads',
                maxChunkSize: 5 * 1024 * 1024, // 5MB
            },
        );

        return res.status(204).send();
    }
}
```

## Advanced Configuration

### uWebSockets.js Support

```javascript
const app = await new Oweb({ uWebSocketsEnabled: true }).setup();
```

### Custom Route Options

```javascript
import { Route } from 'owebjs';

export default class extends Route {
    constructor() {
        super({
            schema: {
                body: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                        username: { type: 'string' },
                        password: { type: 'string' },
                    },
                },
            },
        });
    }

    async handle(req, res) {
        // Body is validated according to the schema
        res.send({ success: true });
    }
}
```
