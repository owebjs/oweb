import { Writable } from 'stream';
import { toLowerCase } from './utils/string.js';
import HttpResponseSocket from './responseSocket';

export default class HttpResponse extends Writable {
    res;
    req;
    server;
    statusCode;
    statusMessage;
    __headers;
    headersSent;
    socket;
    finished;

    constructor(uResponse, uServer) {
        super();

        this.res = uResponse;
        this.server = uServer;

        this.statusCode = 200;
        this.statusMessage = 'OK';

        this.__headers = {};
        this.headersSent = false;

        this.socket = new HttpResponseSocket(uResponse);

        this.res.onAborted(() => {
            this.finished = this.res.finished = true;
        });
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
        if (this.headersSent) return;

        this.res.writeStatus(`${this.statusCode} ${this.statusMessage}`);

        const keys = Object.keys(this.__headers);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
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
        if (this.finished) return;

        this._flushHeaders();

        this.res.write(data);
    }

    writeHead(statusCode) {
        if (this.finished) return;

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
        if (this.finished) return;

        const self = this;

        function doWrite() {
            self._flushHeaders();

            self.finished = true;

            self.res.end(data);
        }

        if (!data) {
            data = '';
        }

        return doWrite();
    }

    getRaw() {
        return this.res;
    }
}
