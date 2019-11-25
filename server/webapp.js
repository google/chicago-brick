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

import {easyLog} from '../lib/log.js';
import bodyParser from 'body-parser';
import express from 'express';
import fs from 'fs';
import glob from 'glob';
import library from './modules/module_library.js';
import path from 'path';

const fsp = fs.promises;

const log = easyLog('wall:webapp');

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
  // TODO(applmak): Make this work dynamically, installing and removing these
  // as needed.
  const moduleRouter = express.Router();
  const moduleStaticFileHandlers = {};
  for (let pattern of flags.module_dir) {
    // Make sure the pattern ends with a "/" so we match only directories.
    const dirpattern = pattern.substring(-1) === '/' ? pattern : pattern + '/';
    for (let dir of glob.sync(dirpattern)) {
      // Remove the ending slash that was added just to force glob to only
      // return directories.
      const path = dir.substring(0, dir.length - 1);
      if (!moduleStaticFileHandlers[path]) {
        moduleStaticFileHandlers[path] = express.static(path);
      }
    }
  }
  moduleRouter.use('/module/:name', function(req, res, next){
    const module = library.modules[req.params.name];
    if (!module) {
      log.error(`No module found by name: ${req.params.name}`);
      return res.sendStatus(404);
    }
    const handler = moduleStaticFileHandlers[module.root];
    if (!handler) {
      log.error(`No static file handler for module root: ${module.root}`);
      return res.sendStatus(404);
    }
    // Disable caching of module code.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return handler(req, res, next);
  });

  // The express app.
  const app = express();
  app.use(brickRouter);
  app.use(assetRouter);
  app.use(moduleRouter);

  // Needed by control.js for POST requests.
  // TODO(applmak): Install this only on the needed router.
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: false}));

  app.get('/', serveFile(path.join(brickPath, 'client/index.html')));

  return app;
}
