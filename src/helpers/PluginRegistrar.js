const creator = (allPlugins, plugin) => plugin(allPlugins);

class BaseRequest {
  constructor() {}
}

export const register = (...parts) => parts.reduce(creator, BaseRequest);
