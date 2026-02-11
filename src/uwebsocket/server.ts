import { EventEmitter } from 'node:events';
const REQUEST_EVENT = 'request';

import HttpRequest from './request';
import HttpResponse from './response';

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

    const uServer = uWS[appType](config).any('/*', (res, req) => {
        res.finished = false;
        res.aborted = false;

        res.isPaused = false;

        res.onAborted(() => {
            res.aborted = true;
            res.finished = true;
        });

        const reqWrapper = new HttpRequest(req, res);
        const resWrapper = new HttpResponse(res, uServer);

        reqWrapper.res = resWrapper;
        resWrapper.req = reqWrapper;
        reqWrapper.socket = resWrapper.socket;

        const originalResume = res.resume;

        res.resume = function () {
            if (res.isPaused && !res.finished && !res.aborted) {
                res.isPaused = false;
                originalResume.call(res);
            }
        };

        handler(reqWrapper, resWrapper);

        const method = reqWrapper.method;

        // also check for finished state so that the 404 handler doesnt crap itself
        if (method !== 'HEAD' && method !== 'GET' && !resWrapper.finished) {
            res.onData((bytes, isLast) => {
                if (res.finished || res.aborted) return;

                const chunk = Buffer.from(bytes.slice(0));

                const streamReady = reqWrapper.push(chunk);

                if (isLast) {
                    reqWrapper.complete = true;
                    reqWrapper.push(null);
                } else if (!streamReady) {
                    if (!res.isPaused) {
                        res.isPaused = true;
                        res.pause();
                    }
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
            uWS.us_listen_socket_close(uServer._socket);
            if (!cb) return;
            return cb();
        }

        start(host, port, cb) {
            let args;
            const callbackFunction = function (socket) {
                uServer._socket = socket;
                if (cb) cb(socket);
            };
            if (host && port && cb) {
                args = [host, port, callbackFunction];
            }
            if (!cb && (!port || typeof port === 'function')) {
                cb = port;
                port = host;
                args = [port, callbackFunction];
            }
            return uServer.listen(...args);
        }

        listen(host, port, cb) {
            if (typeof host === 'object') {
                const listenOptions = host;
                port = listenOptions.port;
                cb = listenOptions.cb;
                host = listenOptions.host;
                return this.start(host, port, (socket) => {
                    uServer._socket = socket;
                    if (cb) cb(socket);
                });
            } else {
                if ((!port || typeof port === 'function') && !cb) {
                    cb = port;
                    port = host;
                    //@ts-ignore
                    return this.start(port, cb);
                } else {
                    return this.start(host, port, cb);
                }
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

                            res.writeStatus(`${this.statusCode} Response`);
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

                    try {
                        for (const HookClass of hooks) {
                            if (aborted || resWrapper.finished) return;

                            await new Promise((resolve, reject) => {
                                try {
                                    const hookInstance =
                                        typeof HookClass === 'function'
                                            ? new HookClass()
                                            : HookClass;

                                    hookInstance.handle(reqWrapper, resWrapper, (err) => {
                                        if (err) reject(err);
                                        else resolve(true);
                                    });
                                } catch (err) {
                                    reject(err);
                                }
                            });
                        }
                    } catch (err) {
                        if (!aborted && !resWrapper.finished) {
                            console.error('WebSocket Hook Error:', err);
                            res.writeStatus('500 Internal Server Error');
                            res.end(
                                JSON.stringify({
                                    error: 'Internal Server Error',
                                    message: err.message,
                                }),
                            );
                        }
                        return;
                    }

                    if (aborted || resWrapper.finished) return;

                    const reqData = {
                        ...reqWrapper,
                        query: query,
                    };

                    res.upgrade({ req: reqData }, secKey, secProtocol, secExtensions, context);
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
