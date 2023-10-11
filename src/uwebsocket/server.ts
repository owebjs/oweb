import uWS from 'uWebSockets.js';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const REQUEST_EVENT = 'request';

import HttpRequest from './request';
import HttpResponse from './response';

export default function ({
    cert_file_name,
    key_file_name,
}: {
    cert_file_name?: string;
    key_file_name?: string;
}) {
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

        const reqWrapper = new HttpRequest(req);
        const resWrapper = new HttpResponse(res, uServer);

        reqWrapper.res = resWrapper;
        resWrapper.req = reqWrapper;

        reqWrapper.socket = resWrapper.socket;

        const method = reqWrapper.method;
        if (method !== 'HEAD') {
            // 0http's low checks also that method !== 'GET', but many users would send request body with GET, unfortunately
            res.onData((bytes, isLast) => {
                const chunk = Buffer.from(bytes);
                if (isLast) {
                    reqWrapper.push(chunk);
                    reqWrapper.push(null);
                    if (!res.finished) {
                        return handler(reqWrapper, resWrapper);
                    }
                    return;
                }

                return reqWrapper.push(chunk);
            });
        } else if (!res.finished) {
            handler(reqWrapper, resWrapper);
        }
    });

    class uServerClass extends EventEmitter {
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

        get uwsApp() {
            return uServer;
        }
    }

    const initUServer = new uServerClass();

    initUServer[Symbol('IncomingMessage')] = HttpRequest;
    initUServer[Symbol('ServerResponse')] = HttpResponse;

    return initUServer;
}
