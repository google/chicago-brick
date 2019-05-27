/* Copyright 2018 Google Inc. All Rights Reserved.

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

'use strict';

var path = require('path');

var bodyParser = require('body-parser');
var debug = require('debug')('wall:webapp');
var express = require('express');
const glob = require('glob');
const library = require('server/modules/module_library');

/**
 * Creates the main ExpressJS web app.
 */
function create(flags) {
  // Force absolute paths.
  // This allows us to execute chicago-brick as a dep from another repo while
  // still finding the necessary dirs. However, this trick forces webapp.js to
  // always exist at /server/webapp.js. This will likely be true for a long
  // time, though. If the file moves, we just need to provide the relative path
  // between NODE_PATH and this file.
  // TODO(applmak): Calculate this path dynamically.
  // TODO(applmak): Figure out a way so that chicago-brick can be require'd, and
  // used as a normal node dep.
  let base = path.join(__dirname, '..');

  debug('webapp base dir is ' + base);
  debug('node_modules_dir is ' + flags.node_modules_dir);

  // Sub-app showing the status page.
  var status = express();
  status.use('/', express.static('client/status'));

  // Sub-app serving the static content (i.e. the modules and client).
  var app = express();
  app.use('/status', status);
  app.use('/client', express.static(path.join(base, 'client')));
  app.use('/lib', express.static(path.join(base, 'lib')));
  app.use('/sys', express.static(flags.node_modules_dir));
  for (let assets_dir of flags.assets_dir) {
    app.use('/asset', express.static(assets_dir));
  }

  /**
   * A map from path to static file handlers for module-relative imports.
   */
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

  app.use('/module/:name', function(req, res, next){
    const module = library.modules[req.params.name];
    if (!module) {
      debug(`No module found by name: ${req.params.name}`);
      return res.sendStatus(404);
    }
    const handler = moduleStaticFileHandlers[module.root];
    if (!handler) {
      debug(`No static file handler for module root: ${module.root}`);
      return res.sendStatus(404);
    }
    // Disable caching of module code.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return handler(req, res, next);
  });

  app.use(express.static(path.join(base, 'client')));

  // Needed by control.js for POST requests.
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: false}));
  return app;
}

module.exports = {
  create: create,
};
