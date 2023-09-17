const creator = (allPlugins: Function, plugin: Function) => plugin(allPlugins);

class BaseRequest {
    constructor() {}
}

export const register = (...plugins: Function[]) => plugins.reduce(creator, BaseRequest);
