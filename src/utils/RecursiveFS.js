import { readdirSync, statSync } from "fs";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { buildRoutePath, buildRouteUrl, mergePaths } from "./utils.js";

export const walkTree = (directory, tree = []) => {
  const results = [];

  for (const fileName of readdirSync(directory)) {
    const filePath = path.join(directory, fileName);
    const fileStats = statSync(filePath);

    if (fileStats.isDirectory()) {
      results.push(...walkTree(filePath, [...tree, fileName]));
    } else {
      results.push({
        name: fileName,
        path: directory,
        rel: mergePaths(...tree, fileName),
        filePath,
      });
    }
  }

  return results;
};

export const generateRoutes = async (files) => {
  const routes = [];

  for (const file of files) {
    const parsedFile = path.parse(file.rel);
    const filePath = file.filePath.replaceAll("\\", "/");

    const packageURL = new URL(
      path.resolve(filePath),
      "file://",
      __dirname
    ).pathname.replaceAll("\\", "/");

    let def = await import(packageURL);

    console.log(def);

    const routePath = buildRoutePath(parsedFile);
    const route = buildRouteUrl(routePath);

    routes.push({
      url: route.url,
      method: route.method,
      fn: def?.default,
    });
  }

  return routes;
};
