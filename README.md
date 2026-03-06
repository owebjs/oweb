# Oweb

<p align="center">
  <strong>A high-performance file-based web framework with seamless Fastify compatibility and native real-time capabilities</strong><br/>
  Build APIs and real-time endpoints with a clean folder structure and fast iteration.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/owebjs"><img src="https://img.shields.io/npm/v/owebjs" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/owebjs"><img src="https://img.shields.io/npm/dm/owebjs" alt="npm downloads"></a>
  <a href="https://github.com/owebjs/oweb/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/owebjs" alt="license"></a>
</p>

## What Is Oweb?

Oweb is a route-per-file framework built on Fastify, with an optional **uWebSockets runtime mode** for high-throughput workloads.

You keep Fastify compatibility and plugin ergonomics, while getting a cleaner architecture, built-in HMR, and first-class SSE/WebSocket support.

## Feature Overview

- **Dual runtime**: Fastify-compatible default runtime + optional `uWebSockets.js` runtime
- File-based routing
- Dynamic params (`[id]`), method files (`.post`, `.put`, ...), and matcher params (`[id=integer]`)
- Hierarchical hooks via `_hooks.js` / `_hooks.ts`
- Route-level and global error handling
- Built-in HMR for routes and matchers
- SSE via iterable / async-iterable route handlers
- WebSocket routes with `WebSocketRoute`
- Fastify plugin ecosystem support
- TypeScript-first codebase and typings

## Installation

```bash
npm install owebjs
```

## Runtime Modes (Fastify vs uWebSockets)

Use the same Oweb API in both modes.

### Default mode (Fastify runtime)

```js
import Oweb from 'owebjs';

const app = await new Oweb().setup();
```

### High-performance mode (uWebSockets runtime)

```js
import Oweb from 'owebjs';

const app = await new Oweb({ uWebSocketsEnabled: true }).setup();
```

When to prefer `uWebSocketsEnabled: true`:

- very high connection count
- aggressive WebSocket usage
- throughput-focused deployments

## Benchmark

**Machine**: Windows 11, Ryzen 5 5500, 16GB RAM, 6C/12T, SSD (Base 3.60 GHz, boost ~4.1 GHz observed)

**Method**: `autocannon -c 100 -d 40 -p 10 localhost:3000` \* 2, taking the
second average

| Runtime                   | Version   | Requests/sec |
| ------------------------- | --------- | -----------: |
| uWebSockets.js            | 20.52.0   |       79,149 |
| **Oweb (uWS)**            | 1.5.8-dev |       76,853 |
| 0http                     | 4.4.0     |       46,605 |
| Fastify                   | 4.23.2    |       46,238 |
| **Oweb (Fastify)**        | 1.5.8-dev |       42,570 |
| Node.js http.createServer | 24.5.0    |       42,544 |
| Express                   | 5.2.1     |       24,913 |

This is a synthetic "Hello, Word!" benchmark that aims to evaluate the framework overhead.
The overhead that each framework has on your application depends on your application.
You should always benchmark if performance matters to you.

## Best Performance

For the highest throughput, use these defaults:

- Enable uWebSockets runtime: `uWebSocketsEnabled: true`
- Disable powered-by header: `poweredByHeader: false`
- For headers that should be sent on every request (for example CORS-related headers), use `staticResponseHeaders` instead of per-request hooks

Example (production-oriented):

```js
import Oweb from 'owebjs';

const app = await new Oweb({
    uWebSocketsEnabled: true,
    poweredByHeader: false,
    staticResponseHeaders: {
        // CORS (set your real origin in production)
        'access-control-allow-origin': 'https://yourdomain.com',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization',
        vary: 'Origin',

        // Security headers
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'permissions-policy': 'geolocation=(), microphone=(), camera=()',
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-resource-policy': 'same-site',
    },
}).setup();

await app.loadRoutes({
    directory: 'routes',
    hmr: {
        enabled: false,
    },
});

await app.start({ port: 3000, host: '0.0.0.0' });
```

## First App (2 Minutes)

Start with a minimal app, then we will add route conventions step by step.

```js
import Oweb from 'owebjs';

const app = await new Oweb({ uWebSocketsEnabled: true }).setup();

await app.loadRoutes({
    directory: 'routes',
    hmr: {
        enabled: true,
    },
});

const { err, address } = await app.start({ port: 3000, host: '127.0.0.1' });
if (err) throw err;

console.log(`Server running at ${address}`);
```

What this does:

- Creates an Oweb app instance (here in uWebSockets mode)
- Loads your route files from `routes/`
- Enables HMR for development
- Starts the HTTP server

## How Oweb Maps Files to URLs

The file system is the routing table. Here is a representative structure:

```txt
routes/
  _hooks.js
  hello.js
  users/
    [id].js
  auth/
    login.post.js
  posts/
    [id=integer].js
  events/
    sse.js
  ws/
    echo.js

matchers/
  integer.js
```

Now let's go through each convention in isolation.

## Routing Conventions

### 1) Basic route

Use a normal file for a `GET` route.

`routes/hello.js` -> `GET /hello`

```js
import { Route } from 'owebjs';

export default class HelloRoute extends Route {
    handle() {
        return { message: 'hello-world' };
    }
}
```

### 2) Dynamic params

Put parameter names in brackets.

`routes/users/[id].js` -> `GET /users/:id`

```js
import { Route } from 'owebjs';

export default class UserRoute extends Route {
    handle(req) {
        return { id: req.params.id };
    }
}
```

### 3) HTTP method suffix

Use filename suffixes when an endpoint is not `GET`.

`routes/auth/login.post.js` -> `POST /auth/login`

Supported suffixes: `.get`, `.post`, `.put`, `.patch`, `.delete`

```js
import { Route } from 'owebjs';

export default class LoginPostRoute extends Route {
    handle(req, res) {
        return res.status(201).send({ method: req.method, body: req.body });
    }
}
```

### 4) Matcher params

Matcher params add filename-level validation.

`routes/posts/[id=integer].js` + `matchers/integer.js`

```js
// matchers/integer.js
export default function integerMatcher(value) {
    return /^-?\d+$/.test(String(value));
}
```

Then register the matcher directory:

```js
await app.loadRoutes({
    directory: 'routes',
    matchersDirectory: 'matchers',
    hmr: {
        enabled: true,
        matchersDirectory: 'matchers',
    },
});
```

If the matcher returns `false`, the route is treated as not matched.

## Hooks (Directory Middleware)

Hooks are defined with `_hooks.js` and run for that folder scope.

Example root hook:

```js
import { Hook } from 'owebjs';

export default class RootHook extends Hook {
    handle(req, _res, done) {
        req.locals ??= {};
        req.locals.trace = ['root'];
        done();
    }
}
```

Key behavior:

- Hooks apply to the current directory and child directories
- Nested folders can add more hooks
- Hooks run before the route handler
- Scoped folders using parentheses (like `(admin)`) creates a hook boundary

### Scoped hook groups

Oweb's route walker inspects parent hook paths and looks for the nearest folder whose name is wrapped in parentheses (for example `(api)` or `(admin)`).

When such a folder exists, hook resolution is cut at that scope boundary. In practice, hooks above that scoped folder are excluded.

Example:

```txt
routes/
  _hooks.js                # global hook
  (admin)/
    _hooks.js              # admin scope boundary hook
    users/
      _hooks.js
      [id].js
```

For `routes/(admin)/users/[id].js`, Oweb uses hooks inside that scoped chain and stops climbing above the `(admin)` boundary.

## Error Handling

You can handle errors globally, or per route when you need custom behavior.

### Global internal error handler

```js
app.setInternalErrorHandler((req, res, error) => {
    res.status(500).send({
        source: 'global-handler',
        message: error.message,
    });
});
```

### Route-specific `handleError`

```js
import { Route } from 'owebjs';

export default class RouteWithCustomError extends Route {
    handle() {
        throw new Error('route-specific-error');
    }

    handleError(_req, res, err) {
        return res.status(409).send({
            source: 'route-handleError',
            message: err.message,
        });
    }
}
```

Use route-level handling when you want endpoint-specific status codes or payload shape.

## SSE (Server-Sent Events)

If a route returns an iterable or async iterable, Oweb streams it as SSE.

```js
import { setTimeout as delay } from 'node:timers/promises';
import { Route } from 'owebjs';

export default class SseRoute extends Route {
    async *handle(req, res) {
        if (req.query?.deny === '1') {
            return res.status(401).send({ code: 'error.unauthorized' });
        }

        yield 'event-1';
        await delay(20);

        yield { step: 2 };
        await delay(20);

        yield 3;
    }
}
```

This is useful for live feeds, progress updates, and long-running operations.

## WebSockets

Create a file that exports a class extending `WebSocketRoute`.

`routes/ws/echo.js` -> `WS /ws/echo`

```js
import { WebSocketRoute } from 'owebjs';

export default class EchoSocketRoute extends WebSocketRoute {
    open(ws) {
        ws.send('ready');
    }

    message(ws, message, isBinary) {
        ws.send(message, isBinary);
    }
}
```

Works in both runtime modes:

- Fastify WebSocket adapter (default)
- Native `uWebSockets.js` mode

## HMR (Hot Module Replacement)

Enable HMR while loading routes:

```js
await app.loadRoutes({
    directory: 'routes',
    matchersDirectory: 'matchers',
    hmr: {
        enabled: true,
        directory: 'routes',
        matchersDirectory: 'matchers',
    },
});
```

Notes:

- HMR is disabled in `NODE_ENV=production`
- Route hook files (`_hooks.js` / `_hooks.ts`) are not hot-reloaded
- For hook changes, restart the server

## Fastify Plugin Compatibility

Because Oweb sits on Fastify, you can register Fastify plugins directly.

```js
import multipart from '@fastify/multipart';

await app.register(multipart, {
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});
```

## Built-in Plugin: Chunk Upload

Oweb exposes `ChunkUpload` from `owebjs/plugins` for chunked upload workflows.

```js
import { Route } from 'owebjs';
import { ChunkUpload, ChunkUploadStatus } from 'owebjs/plugins';

export default class ChunkUploadRoute extends Route {
    async handle(req, res) {
        const file = await req.file();
        const buffer = await file.toBuffer();

        const result = await ChunkUpload(
            {
                buffer,
                fileName: file.filename,
                currentChunk: Number(req.query.currentChunk),
                totalChunks: Number(req.query.totalChunks),
            },
            {
                path: './uploads',
                maxChunkSize: 1024 * 1024,
                maxFileSize: 10 * 1024 * 1024,
            },
        );

        if (
            result.status === ChunkUploadStatus.ChunkTooLarge ||
            result.status === ChunkUploadStatus.FileTooLarge
        ) {
            return res.status(413).send(result);
        }

        return res.send(result);
    }
}
```

## TypeScript

Oweb supports `.ts` route files and exports framework typings. You can keep the same file conventions and class model in TypeScript projects.

## License

MIT
