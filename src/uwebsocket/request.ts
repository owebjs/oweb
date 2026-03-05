import { Readable } from 'stream';
import { forEach } from './utils/object';

export default class HttpRequest extends Readable {
    public req: any;
    public res: any;
    public uResponse: any;
    public url: string;
    public method: string;
    public statusCode: number | null;
    public statusMessage: string | null;
    public body: any;
    public headers: Record<string, string>;
    public socket: any;

    // https://nodejs.org/api/http.html#class-httpincomingmessage
    public complete: boolean = false;
    public connection: any;
    private resumeScheduled: boolean = false;

    constructor(uRequest: any, uResponse: any) {
        super({ highWaterMark: 64 * 1024 });

        this.uResponse = uResponse;
        this.req = uRequest;

        const q = uRequest.getQuery();
        this.url = uRequest.getUrl() + (q ? '?' + q : '');
        this.method = uRequest.getMethod().toUpperCase();
        this.body = {};
        this.headers = {};

        this.socket = {
            destroy: () => {},
            on: () => {},
            removeListener: () => {},
        };

        this.connection = this.socket;

        uRequest.forEach((header: string, value: string) => {
            this.headers[header.toLowerCase()] = value;
        });
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
