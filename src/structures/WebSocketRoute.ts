import { Awaitable } from '../types';

export interface WebSocketAdapter {
    send(message: string | ArrayBuffer, isBinary?: boolean, compress?: boolean): number;
    close(code?: number, shortMessage?: string | ArrayBuffer): void;
    end(code?: number, shortMessage?: string | ArrayBuffer): void;
    cork(cb: () => void): void;
    getUserData(): any;
    getRemoteAddressAsText(): ArrayBuffer;
    getRemoteAddress(): ArrayBuffer;
    subscribe(topic: string): boolean;
    unsubscribe(topic: string): boolean;
    publish(
        topic: string,
        message: string | ArrayBuffer,
        isBinary?: boolean,
        compress?: boolean,
    ): boolean;
}

export interface WebSocketRouteOptions {
    compression?: number;
    maxPayloadLength?: number;
    idleTimeout?: number;
    sendPingsAutomatically?: boolean;
}

export abstract class WebSocketRoute {
    public _options: WebSocketRouteOptions = {};

    public constructor(options?: WebSocketRouteOptions) {
        this._options = options ?? {
            compression: 0,
            maxPayloadLength: 16 * 1024 * 1024,
            idleTimeout: 120,
        };
    }

    /**
     * Called when a client connects.
     */
    open?(ws: WebSocketAdapter, req: any): Awaitable<void>;

    /**
     * Called when a message is received.
     */
    message?(ws: WebSocketAdapter, message: ArrayBuffer, isBinary: boolean): Awaitable<void>;

    /**
     * Called when the connection is closed.
     */
    close?(ws: WebSocketAdapter, code: number, message: ArrayBuffer): Awaitable<void>;

    /**
     * Called when the socket buffer is empty (backpressure).
     */
    drain?(ws: WebSocketAdapter): Awaitable<void>;

    ping?(ws: WebSocketAdapter, message: ArrayBuffer): Awaitable<void>;
    pong?(ws: WebSocketAdapter, message: ArrayBuffer): Awaitable<void>;
}
