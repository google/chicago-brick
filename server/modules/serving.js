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
import express from 'express';
import fs from 'fs';
import path from 'path';

const fsp = fs.promises;

const log = easyLog('wall:serving');

function serveFile(path) {
  return async (req, res) => {
    try {
      const contents = await fsp.readFile(path, {encoding: 'utf-8'});
      res.statusCode = 200;
      res.end(contents, 'utf-8');
    } catch (e) {
      res.statusCode = 404;
      res.end('Not Found', 'utf-8');
    }
  };
}

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
      static: express.static(path.join(process.cwd(), dir)),
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

  // Create a router just for the brick files that could be served to the client.
  // These are:
  //   /client => node_modules/brick/client
  //   /lib => node_modules/brick/lib
  //   /node_modules => node_modules
  const brickRouter = express.Router();
  brickRouter.use('/client', express.static(path.join(brickPath, 'client')));
  brickRouter.use('/lib', express.static(path.join(brickPath, 'lib')));
  brickRouter.use('/node_modules', express.static(path.join(cwd, 'node_modules')));

  // We support a global set of asset directories.
  const assetRouter = express.Router();
  for (let assets_dir of flags.assets_dir) {
    assetRouter.use('/asset', express.static(assets_dir));
  }

  // We also support per-module routing.
  const moduleRouter = express.Router();
  moduleRouter.use('/module/:name', (req, res, next) => {
    if (moduleRoutes.has(req.params.name)) {
      const route = moduleRoutes.get(req.params.name);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      route.static(req, res, next);
    } else {
      res.statusCode = 404;
      res.end('Not Found', 'utf-8');
    }
  });

  // The express app.
  const app = express();
  app.use(brickRouter);
  app.use(assetRouter);
  app.use(moduleRouter);

  app.get('/', serveFile(path.join(brickPath, 'client/index.html')));

  return app;
}
