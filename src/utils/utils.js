export const mergePaths = (...paths) =>
  "/" +
  paths
    .map((path) => path.replace(/^\/|\/$/g, ""))
    .filter((path) => path !== "")
    .join("/");

const regBackets = /\[([^}]*)\]/g;

const transformBrackets = (value) =>
  regBackets.test(value) ? value.replace(regBackets, (_, s) => `:${s}`) : value;

export const convertParamSyntax = (path) => {
  const subpaths = [];

  for (const subpath of path.split("/")) {
    subpaths.push(transformBrackets(subpath));
  }

  return mergePaths(...subpaths);
};

export const convertCatchallSyntax = (url) => url.replace(/:\.\.\.\w+/g, "*");

export const buildRoutePath = (parsedFile) => {
  const directory = parsedFile.dir === parsedFile.root ? "" : parsedFile.dir;
  const name = parsedFile.name.startsWith("index")
    ? parsedFile.name.replace("index", "")
    : `/${parsedFile.name}`;

  return directory + name;
};

export const buildRouteUrl = (path) => {
  let method = "get";

  const paramURL = convertParamSyntax(path);
  let url = convertCatchallSyntax(paramURL);

  for (const m of [".DELETE", ".POST", ".PATCH", ".GET", ".PUT"]) {
    if (path.endsWith(m) || path.endsWith(m.toLowerCase())) {
      method = m.toLowerCase().slice(1);
      url = url.slice(0, url.length - m.length);
      break;
    }
  }

  return {
    url,
    method,
  };
};
