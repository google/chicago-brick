/* Copyright 2015 Google Inc. All Rights Reserved.

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
  // Also, serve the modules on /modules
  let moduleHandler = (function() {
    // As we want to wrap the static-serve middleware response, and it's
    // designed to not let you do that, really, we create a fake res object
    // that can capture what the middleware would have written.
    let write = null, end = null;
    
    return (req, res, next) => {
      write = res.write;
      end = res.end;

      // Disable caching of module code.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    
      res.write = function() {
        // Remove the length header.
        res.removeHeader('Content-Length');
    
        // After headers, but before the real content, add the wrapping marker.
        write.call(res, 'define(function(require, exports, module) {\n');
        write.apply(res, Array.from(arguments));
        // Restore original write function, so subsequent writes work just fine.
        res.write = write;
      };
      res.end = function() {
        let args = Array.from(arguments);
        if (args.length) {
          // Stuff to send... use normal write to send it.
          write.apply(res, args);
        } else {
          write.call(res, '});\n');
        }
        end.call(res);
        res.end = end;
      };
    
      next();
    };
  })();
  for (let dir of flags.module_dir) {
    app.use(`/${dir}`, moduleHandler, express.static(dir));
  }

  app.use(express.static(path.join(base, 'client')));

  // Needed by control.js for POST requests.
  app.use(bodyParser.urlencoded({extended: false}));
  return app;
}

module.exports = {
  create: create,
};
