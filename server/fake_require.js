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

const _ = require('underscore');
const path = require('path');

// Server-side takes just an env. This is sorta complicated, but simpler than
// the client-side case because we are synchronous.
//  - Our goal is to be able to require a file that lives on the server from
//    the server and support module-relative paths in modules.
//  - A simple sandbox won't work, because the sandbox is not inherited by
//    files that the eval'd file itself requires.
//  - Instead, we must muck with node's require so that our fake deps will
//    get found and processed as if they were normal files.
//  - To do this, we'll add our deps to require.cache as Modules, but faking
//    out all the bits that do all of the actual work and instead delegating
//    to our existing defintions.
//  - Furthermore, we need to change Module._resolveFilename (semi-private
//    api) to not hit the file system for these deps.
//  - Finally, we have to clean up this when we're done, so they don't stick
//    around forever.
module.exports = {
  createEnvironment: function(env, moduleRoot) {
    'use strict';
    // First, create a list of the the current valid deps, so we can remove
    // any new ones that appear when it's time to clean up.
    let loadedDeps = Object.keys(require.cache);
    // We also need to track this module's deps, too.
    let originalChildren = Array.from(module.children);

    // Next, tell the Module._resolveFilename method to ignore our special
    // deps.
    let Module = require('module');
    let origResolve = Module._resolveFilename;
    Module._resolveFilename = function() {
      let args = Array.prototype.slice.call(arguments);
      // For cached impots, let it go without doing anything.
      if (args[0] in env) {
        return args[0];
      }

      // For relative imports we rewrite them to be relative to the
      // module root directory.
      if (args[0][0] == '.') {
        args[0] = path.join(moduleRoot, args[0]);
      }

      // Otherwise delegate to the normal resolve function.
      return origResolve.apply(null, args);
    };

    // Add our fake deps to the cache.
    for (let name in env) {
      let fakeModule = new Module(name, null);
      fakeModule.exports = env[name];
      fakeModule.loaded = true;
      require.cache[name] = fakeModule;
    }

    // Create a function that delegates to require. It contains a single
    // 'destroy' method that cleans up all of our mucking.
    let ret = path => require(path);
    ret.destroy = () => {
      // Restore _resolveFilename.
      Module._resolveFilename = origResolve;

      // Remove new cache entries.
      let newDeps = _.difference(Object.keys(require.cache), loadedDeps);
      newDeps.forEach(k => delete require.cache[k]);

      // Also, remove these entries from MY module's children list.
      module.children = originalChildren;
    };

    return ret;
  },
};
