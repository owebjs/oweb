export default class HttpResponseSocket {
    uResponse;
    private _remoteAddress?: string;

    constructor(uResponse) {
        this.uResponse = uResponse;
    }

    get remoteAddress() {
        if (this._remoteAddress === undefined) {
            this._remoteAddress = Buffer.from(this.uResponse.getRemoteAddressAsText()).toString();
        }

        return this._remoteAddress;
    }

    destroy() {
        return this.uResponse.end();
    }
}
