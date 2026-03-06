import { Readable } from 'stream';
import { forEach } from './utils/object';

const NOOP_SOCKET = Object.freeze({
    destroy: () => {},
    on: () => {},
    removeListener: () => {},
});

type RequestPrefetch = {
    method?: string;
    url?: string;
    query?: string;
};

export default class HttpRequest extends Readable {
    public req: any;
    public res: any;
    public uResponse: any;
    public url: string;
    public method: string;
    public statusCode: number | null;
    public statusMessage: string | null;
    public body: any;

    // https://nodejs.org/api/http.html#class-httpincomingmessage
    public complete: boolean = false;
    public connection: any;
    private resumeScheduled: boolean = false;
    private _headers: Record<string, string> | null = null;
    private _socket: any = NOOP_SOCKET;
    private _socketFactory?: () => any;

    public get socket() {
        if (this._socketFactory && this._socket === NOOP_SOCKET) {
            this._socket = this._socketFactory();
            this.connection = this._socket;
        }

        return this._socket;
    }

    public set socket(value: any) {
        this._socket = value || NOOP_SOCKET;
        this.connection = this._socket;
        this._socketFactory = undefined;
    }

    public bindSocketFactory(factory: () => any) {
        this._socketFactory = factory;
        this._socket = NOOP_SOCKET;
        this.connection = this._socket;
    }

    public get headers(): Record<string, string> {
        if (!this._headers) {
            const headers: Record<string, string> = {};

            this.req.forEach((header: string, value: string) => {
                headers[header.toLowerCase()] = value;
            });

            this._headers = headers;
        }

        return this._headers;
    }

    public set headers(value: Record<string, string>) {
        this._headers = value;
    }

    constructor(uRequest: any, uResponse: any, prefetched?: RequestPrefetch) {
        super({ highWaterMark: 64 * 1024 });

        this.uResponse = uResponse;
        this.req = uRequest;

        const query = prefetched?.query ?? uRequest.getQuery();
        const url = prefetched?.url ?? uRequest.getUrl();

        this.url = url + (query ? '?' + query : '');
        this.method = prefetched?.method ?? uRequest.getMethod().toUpperCase();
        this.body = {};

        this.connection = this._socket;
    }

    getRawHeaders() {
        const raw: string[] = [];
        forEach(this.headers, (header: string, value: string) => {
            raw.push(header, value);
        });
        return raw;
    }

    getRaw() {
        return this.req;
    }

    _read(_: number) {
        const uRes = this.uResponse;

        if (!uRes || uRes.aborted || uRes.finished || !uRes.isPaused) return;
        if (this.resumeScheduled) return;

        this.resumeScheduled = true;

        setImmediate(() => {
            this.resumeScheduled = false;

            const res = this.uResponse;
            if (res && !res.aborted && !res.finished && res.isPaused) {
                res.resume();
            }
        });
    }
}
