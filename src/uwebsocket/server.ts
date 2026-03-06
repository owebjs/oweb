import { EventEmitter } from 'node:events';
const REQUEST_EVENT = 'request';

import HttpRequest from './request';
import HttpResponse from './response';
import http from 'node:http';

export default async function ({
    cert_file_name,
    key_file_name,
}: {
    cert_file_name?: string;
    key_file_name?: string;
}) {
    let uWS;
    uWS = (await import('uWebSockets.js')).default;

    let appType = 'App';

    if (cert_file_name && key_file_name) {
        appType = 'SSLApp';
    }

    let handler = (req, res) => {
        res.statusCode = 404;
        res.statusMessage = 'Not Found';
        res.end();
    };

    const config = {
        cert_file_name,
        key_file_name,
    };

    const copyArrayBufferToBuffer = (bytes: ArrayBuffer): Buffer => {
        const src = new Uint8Array(bytes);
        const out = Buffer.allocUnsafe(src.byteLength);
        out.set(src);
        return out;
    };

    const uServer = uWS[appType](config).any('/*', (res, req) => {
        const method = req.getMethod().toUpperCase();
        const query = req.getQuery();
        const url = req.getUrl();
        const requiresBody = method !== 'HEAD' && method !== 'GET';

        res.finished = false;
        res.aborted = false;

        if (requiresBody) {
            res.isPaused = false;
        }

        res.onAborted(() => {
            res.aborted = true;
            res.finished = true;
        });

        const reqWrapper = new HttpRequest(req, res, { method, query, url });
        const resWrapper = new HttpResponse(res, uServer);

        reqWrapper.res = resWrapper;
        resWrapper.req = reqWrapper;
        reqWrapper.bindSocketFactory(() => resWrapper.socket);

        handler(reqWrapper, resWrapper);

        // also check for finished state so that the 404 handler doesnt crap itself
        if (requiresBody && !resWrapper.finished) {
            const originalResume = res.resume;
            res.resume = function () {
                if (res.isPaused && !res.finished && !res.aborted) {
                    res.isPaused = false;
                    originalResume.call(res);
                }
            };

            res.onData((bytes, isLast) => {
                if (res.finished || res.aborted || reqWrapper.destroyed) return;

                const chunk = copyArrayBufferToBuffer(bytes);
                const streamReady = reqWrapper.push(chunk);

                if (isLast) {
                    reqWrapper.complete = true;
                    reqWrapper.push(null);
                    return;
                }

                if (!streamReady && !res.isPaused) {
                    res.isPaused = true;
                    res.pause();
                }
            });
        } else if (!resWrapper.finished) {
            reqWrapper.complete = true;
            reqWrapper.push(null);
        }
    });

    class uServerClass extends EventEmitter {
        public _socket: any;

        constructor() {
            super();

            const oldThisOn = this.on.bind(this);
            const oldThisOnce = this.once.bind(this);

            this.once = function (eventName, listener) {
                return oldThisOnce(eventName, listener);
            };

            this.on = function (eventName, listener) {
                if (eventName === REQUEST_EVENT) {
                    handler = listener;
                    return;
                }
                return oldThisOn(eventName, listener);
            };
        }

        close(cb) {
            if (uServer._socket) {
                uWS.us_listen_socket_close(uServer._socket);
                uServer._socket = null;
            }
            if (cb) cb();
        }

        start(host, port, cb) {
            const callbackFunction = function (token) {
                uServer._socket = token;
                if (cb) cb(token);
            };

            if (host && port) {
                return uServer.listen(host, port, callbackFunction);
            } else {
                return uServer.listen(port || host, callbackFunction);
            }
        }

        listen(host, port, cb) {
            if (typeof host === 'object') {
                const listenOptions = host;
                port = listenOptions.port;
                cb = listenOptions.cb;
                host = listenOptions.host || '0.0.0.0';

                return this.start(host, port, (token) => {
                    if (token) {
                        uServer._socket = token;

                        if (cb) cb(null, `http://${host}:${port}`);
                    } else {
                        if (cb) cb(new Error(`Failed to listen on ${host}:${port}`));
                    }
                });
            } else {
                if ((!port || typeof port === 'function') && !cb) {
                    cb = port;
                    port = host;
                    host = '0.0.0.0';
                }

                return this.start(host, port, (token) => {
                    if (token) {
                        uServer._socket = token;
                        if (cb) cb(null, `http://${host}:${port}`);
                    } else {
                        if (cb) cb(new Error(`Failed to listen on ${host}:${port}`));
                    }
                });
            }
        }

        ws(pattern, behaviors, hooks = []) {
            uServer.ws(pattern, {
                compression: behaviors.compression,
                maxPayloadLength: behaviors.maxPayloadLength,
                idleTimeout: behaviors.idleTimeout,
                sendPingsAutomatically: behaviors.sendPingsAutomatically,

                upgrade: async (res, req, context) => {
                    const url = req.getUrl();
                    const query = req.getQuery();
                    const method = req.getMethod().toUpperCase();
                    const headers = {};

                    req.forEach((key, value) => {
                        headers[key] = value;
                    });

                    const params = {};

                    if (pattern.includes(':') || pattern.includes('*')) {
                        const parts = pattern.split('/');
                        let paramIndex = 0;

                        for (const part of parts) {
                            if (part.startsWith(':')) {
                                const name = part.slice(1);
                                params[name] = req.getParameter(paramIndex);
                                paramIndex++;
                            } else if (part === '*') {
                                params['*'] = req.getParameter(paramIndex);
                                paramIndex++;
                            }
                        }
                    }

                    const secKey = headers['sec-websocket-key'];
                    const secProtocol = headers['sec-websocket-protocol'];
                    const secExtensions = headers['sec-websocket-extensions'];

                    let aborted = false;
                    res.onAborted(() => {
                        aborted = true;
                    });

                    const reqWrapper = {
                        url: url + (query ? '?' + query : ''),
                        routerPath: pattern,
                        query: new URLSearchParams(query),
                        headers,
                        method,
                        params,
                        raw: { url, method, headers },
                    };

                    const resWrapper = {
                        statusCode: 200,
                        _headers: {},
                        finished: false,
                        get sent() {
                            return this.finished;
                        },

                        header(key, value) {
                            this._headers[key.toLowerCase()] = value;
                            return this;
                        },
                        status(code) {
                            this.statusCode = code;
                            return this;
                        },
                        send(payload) {
                            if (aborted || this.finished) return;
                            this.finished = true;

                            const message = http.STATUS_CODES[this.statusCode] || 'Response';
                            res.writeStatus(`${this.statusCode} ${message}`);

                            for (const [k, v] of Object.entries(this._headers)) {
                                res.writeHeader(k, String(v));
                            }
                            res.end(
                                typeof payload === 'object'
                                    ? JSON.stringify(payload)
                                    : String(payload),
                            );
                            return this;
                        },
                    };
                    const sendUpgradeError = (hookError: any) => {
                        if (aborted || resWrapper.finished) return;

                        const normalizedError =
                            hookError instanceof Error ? hookError : new Error(String(hookError));

                        console.error('WebSocket Hook Error:', normalizedError);
                        res.writeStatus('500 Internal Server Error');
                        res.end(
                            JSON.stringify({
                                error: 'Internal Server Error',
                                message: normalizedError.message,
                            }),
                        );
                    };

                    const finishUpgrade = () => {
                        if (aborted || resWrapper.finished) return;

                        const reqData = {
                            ...reqWrapper,
                            query: query,
                        };

                        res.upgrade({ req: reqData }, secKey, secProtocol, secExtensions, context);
                    };

                    let hookIndex = 0;

                    const runNextHook = (hookError?: any) => {
                        if (hookError) {
                            sendUpgradeError(hookError);
                            return;
                        }

                        if (aborted || resWrapper.finished) return;

                        if (hookIndex >= hooks.length) {
                            finishUpgrade();
                            return;
                        }

                        const HookClass = hooks[hookIndex++];
                        const hookInstance =
                            typeof HookClass === 'function' ? new HookClass() : HookClass;

                        let doneCalled = false;
                        const done = (doneError?: any) => {
                            if (doneCalled) return;
                            doneCalled = true;
                            runNextHook(doneError);
                        };

                        try {
                            hookInstance.handle(reqWrapper, resWrapper, done);
                        } catch (err) {
                            done(err);
                        }
                    };

                    runNextHook();
                },

                open: (ws) => {
                    if (behaviors.open) {
                        const data = ws.getUserData();
                        behaviors.open(ws, data.req);
                    }
                },
                message: behaviors.message,
                drain: behaviors.drain,
                close: behaviors.close,
                ping: behaviors.ping,
                pong: behaviors.pong,
            });
        }

        get uwsApp() {
            return uServer;
        }
    }

    const initUServer = new uServerClass();

    initUServer[Symbol('IncomingMessage')] = HttpRequest;
    initUServer[Symbol('ServerResponse')] = HttpResponse;

    return initUServer;
}

