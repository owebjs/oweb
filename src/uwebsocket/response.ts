import { Writable } from 'stream';
import { toLowerCase } from './utils/string.js';
import HttpResponseSocket from './responseSocket';
import http from 'node:http';

export default class HttpResponse extends Writable {
    res;
    req;
    server;
    statusCode;
    statusMessage;
    __headers;
    headersSent;
    finished;
    staticHeaders?: [string, string][];
    private _socket: any = null;

    constructor(uResponse, uServer, staticHeaders?: [string, string][]) {
        super();

        this.res = uResponse;
        this.server = uServer;

        this.statusCode = 200;
        this.statusMessage = null;
        this.__headers = {};
        this.headersSent = false;
        this.finished = false;
        this.staticHeaders = staticHeaders;
    }

    public get socket() {
        if (!this._socket) {
            this._socket = new HttpResponseSocket(this.res);
        }

        return this._socket;
    }

    private isClosed() {
        return this.finished || this.res.aborted || this.res.finished;
    }

    public get sent() {
        return this.isClosed();
    }

    setHeader(name, value) {
        this.__headers[toLowerCase(name)] = value;
    }

    getHeaderNames() {
        return Object.keys(this.__headers);
    }

    getHeaders() {
        // returns shallow copy
        return Object.assign({}, this.__headers);
    }

    getHeader(name) {
        return this.__headers[toLowerCase(name)];
    }

    hasHeader(name) {
        return !!this.__headers[toLowerCase(name)];
    }

    removeHeader(name) {
        delete this.__headers[toLowerCase(name)];
    }

    _flushHeaders() {
        if (this.headersSent || this.isClosed()) return;

        const message = this.statusMessage || http.STATUS_CODES[this.statusCode] || 'Unknown';
        this.res.writeStatus(`${this.statusCode} ${message}`);

        if (this.staticHeaders?.length) {
            for (let i = 0; i < this.staticHeaders.length; i++) {
                const [key, value] = this.staticHeaders[i];

                if (key === 'content-length' || key === 'transfer-encoding') {
                    continue;
                }

                if (this.__headers[key] !== undefined) {
                    continue;
                }

                this.res.writeHeader(key, value);
            }
        }

        const keys = Object.keys(this.__headers);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];

            // https://github.com/uNetworking/uWebSockets.js/issues/1169
            if (key === 'content-length' || key === 'transfer-encoding') {
                continue;
            }

            const value = this.__headers[key];
            if (Array.isArray(value)) {
                for (let j = 0; j < value.length; j++) {
                    this.res.writeHeader(key, String(value[j]));
                }
            } else {
                this.res.writeHeader(key, String(value));
            }
        }

        this.headersSent = true;
    }

    //@ts-ignore
    write(data) {
        if (this.isClosed()) return;

        this.res.cork(() => {
            this._flushHeaders();
            if (!this.isClosed()) {
                this.res.write(data);
            }
        });
    }

    writeHead(statusCode) {
        if (this.isClosed()) return;

        this.statusCode = statusCode;
        let headers;
        if (arguments.length === 2) {
            headers = arguments[1];
        } else if (arguments.length === 3) {
            this.statusMessage = arguments[1];
            headers = arguments[2];
        } else {
            headers = {};
        }
        Object.keys(headers).forEach((key) => {
            this.setHeader(key, headers[key]);
        });
    }

    //@ts-ignore
    end(data) {
        if (this.isClosed()) return;

        this.res.cork(() => {
            this._flushHeaders();

            this.finished = true;

            if (!data) {
                this.res.end();
            } else {
                this.res.end(data);
            }
        });
    }

    getRaw() {
        return this.res;
    }
}
