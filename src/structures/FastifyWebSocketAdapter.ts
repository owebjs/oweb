import { WebSocket } from 'ws';
import { WebSocketAdapter } from './WebSocketRoute';

const topicSubscribers = new Map<string, Set<FastifyWebSocketAdapter>>();

export class FastifyWebSocketAdapter implements WebSocketAdapter {
    private ws: any;
    private req: any;
    private userData: any;

    constructor(ws: any, req: any) {
        this.ws = ws;
        this.req = req;
        this.userData = {};
    }

    send(message: string | ArrayBuffer, isBinary?: boolean, compress?: boolean): number {
        if (this.ws.readyState === 1) {
            this.ws.send(message, { binary: isBinary, compress });
            return 1;
        }
        return 0;
    }

    close(code?: number, shortMessage?: string | ArrayBuffer): void {
        this.ws.close(code, shortMessage as string);
    }

    end(code?: number, shortMessage?: string | ArrayBuffer): void {
        this.ws.close(code, shortMessage as string);
    }

    cork(cb: () => void): void {
        // ws doesn't have cork() just execute immediately
        cb();
    }

    getUserData(): any {
        return this.userData;
    }

    getRemoteAddressAsText(): ArrayBuffer {
        return Buffer.from(this.req.socket?.remoteAddress || '');
    }

    getRemoteAddress(): ArrayBuffer {
        return this.getRemoteAddressAsText();
    }

    subscribe(topic: string): boolean {
        if (!topicSubscribers.has(topic)) {
            topicSubscribers.set(topic, new Set());
        }
        topicSubscribers.get(topic).add(this);
        return true;
    }

    unsubscribe(topic: string): boolean {
        const set = topicSubscribers.get(topic);
        if (set) {
            set.delete(this);
            if (set.size === 0) topicSubscribers.delete(topic);
            return true;
        }
        return false;
    }

    publish(
        topic: string,
        message: string | ArrayBuffer,
        isBinary?: boolean,
        compress?: boolean,
    ): boolean {
        const set = topicSubscribers.get(topic);
        if (!set) return false;

        set.forEach((client) => {
            if (client !== this && client.ws.readyState === 1) {
                client.send(message, isBinary, compress);
            }
        });
        return true;
    }

    cleanup() {
        topicSubscribers.forEach((set, topic) => {
            set.delete(this);
            if (set.size === 0) topicSubscribers.delete(topic);
        });
    }
}
