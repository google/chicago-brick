/* Copyright 2019 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import {easyLog} from '../../lib/log.js';
import fs from 'fs';
import path from 'path';
import URLPattern from 'url-pattern';
import {serveDirectory, serveFile, routingMain} from '../util/serving.js';

const log = easyLog('wall:serving');

const moduleRoutes = new Map;
// Register a route. We need to refcount because we could have two copies of
// the same module playing.
export function registerRoute(name, dir) {
  if (moduleRoutes.has(name)) {
    const route = moduleRoutes.get(name);
    route.count++;
  } else {
    moduleRoutes.set(name, {
      count: 1,
      dir: path.join(process.cwd(), dir),
    });
  }
}
export function unregisterRoute(name) {
  if (!moduleRoutes.has(name)) {
    throw new Error('Unregistering module without registering it!');
  }
  const route = moduleRoutes.get(name);
  if (route.count > 1) {
    route.count--;
  } else {
    moduleRoutes.delete(name);
  }
}

/**
 * Creates the main ExpressJS web app.
 */
export function create(flags) {
  // The location we are running from.
  const cwd = process.cwd();

  // But we really want to get the path to the brick folder.
  const brickPath =
      fs.existsSync(path.join(cwd, 'node_modules/chicago-brick')) ?
      path.join(cwd, 'node_modules/chicago-brick') :
      cwd;

  log(`CWD: ${cwd}`);
  log(`Brick directory: ${brickPath}`);

  const routes = [];
  // The main app handler;
  const app = routingMain(routes);

  // Create routes just for the brick files that could be served to the client.
  // These are:
  //   /client => node_modules/brick/client
  //   /lib => node_modules/brick/lib
  //   /node_modules => node_modules
  routes.push(serveDirectory(new URLPattern('/client/*'), path.join(cwd, 'client')));
  routes.push(serveDirectory(new URLPattern('/lib/*'), path.join(cwd, 'lib')));
  routes.push(serveDirectory(new URLPattern('/node_modules/*'), path.join(cwd, 'node_modules')));

  // We support a global set of asset directories.
  for (const assets_dir of flags.assets_dir) {
    routes.push(serveDirectory(new URLPattern('/asset/*'), assets_dir));
  }

  // We also support per-module routing.
  routes.push(async (req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pattern = new URLPattern('/module/:name/*');
    const match = pattern.match(url.pathname);
    if (!match) {
      next();
      return;
    }
    if (moduleRoutes.has(match.name)) {
      const route = moduleRoutes.get(match.name);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      await serveDirectory(pattern, route.dir)(req, res, next);
    } else {
      res.statusCode = 404;
      res.end('Not Found', 'utf-8');
    }
  });

  routes.push(serveFile('/', path.join(brickPath, 'client/index.html')));

  return app;
}
