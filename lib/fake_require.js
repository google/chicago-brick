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

if (typeof define === 'function' && define.amd) {
  // Client-side takes a context name and an env. This is really, really
  // complicated, so we'll walk through it.
  //  - Our goal is to be able to require a file from the client that the
  //    server hosts using requirejs.
  //  - This means that our normal approach of faking-out require won't work
  //    because we won't be in control of the definition of require for
  //    anything but the main module.
  //  - Instead, we must muck with requirejs itself so that any file we include
  //    will get our mucked-with version, and be able to find dependencies that
  //    aren't real files, like debug or network.
  //  - To do this, we'll create a special requirejs context that contains all
  //    of the symbols from the default context, but then also provides the
  //    fake dependencies. This way, a bog-standard requirejs call will find
  //    the right deps.
  //  - The only non-hacky way to force a symbol into a requirejs context is
  //    via define with the name as the first parameter. Symbols added in this
  //    way go into the most recently created context.
  //  - Furthermore, the symbols don't _really_ enter into the context until the
  //    next require call after they are defined.
  //  - Since such a require call is theoretically async (even though we know
  //    all of the deps we are asking for are fake and already loaded), we are 
  //    forced to deal with a Promise.
  //  - Inside of our require, we can resolve the Promise with our requirejs
  //    context.
  //  - Finally, we have to clean up these contexts, so they don't just occupy
  //    all memory forever.
  define(function(require) {
    'use strict';
    const _ = require('underscore');
    
    /* globals requirejs */
    
    return {
      createEnvironment: function(name, env) {
        return new Promise((resolve) => {
          // First, create a custom requirejs context. Note that we use the
          // global requirejs, and not the 'local' require, as they are, in 
          // fact, different functions with different kinds of functionality.
          let config = {
            // Name the context.
            context: name,
            // Copy over the paths from the base context so that library deps
            // like 'three' or 'p5' work correctly.
            paths: _.clone(requirejs.s.contexts._.config.paths)
          };
          let contextRequire = requirejs.config(config);
          
          // Next, extend our new context with all of the symbols from the 
          // original context, so modules can find files like 
          // lib/module_interface.
          // NOTE: This is brittle, and uses non-public APIs of requirejs.
          _.extend(requirejs.s.contexts[name].defined, requirejs.s.contexts._.defined);
        
          // Next, inject our globals into the requirejs context via define.
          _.each(env, (dep, name) => {
            define(name, [], () => {
              return dep;
            });
          });
        
          // Next, force requirejs to gather the new defines into the local 
          // context.
          contextRequire(Object.keys(env), () => {
            // Return the new context, with all of the deps loaded.
            resolve(contextRequire);
          });
        });
      },
      deleteEnvironment: function(name) {
        // NOTE: This is brittle, relying on non-public APIs of requirejs.
        delete requirejs.s.contexts[name];
      }
    };
  });
} else if (typeof exports === 'object') {
  var _ = require('underscore');
  // Server-side takes just an env. This is sorta complicated, but simpler than
  // the client-side case because we are synchronous.
  //  - Our goal is to be able to require a file that lives on the server from
  //    the server.
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
    createEnvironment: function(env) {
      'use strict';
      // First, create a list of the the current valid deps, so we can remove
      // any new ones that appear when it's time to clean up.
      let loadedDeps = Object.keys(require.cache);
      
      // Next, tell the Module._resolveFilename method to ignore our special
      // deps.
      let Module = require('module');
      let origResolve = Module._resolveFilename;
      Module._resolveFilename = function() {
        let args = Array.prototype.slice.call(arguments);
        if (args[0] in env) {
          return args[0];
        }
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
        newDeps.forEach((k) => delete require.cache[k]);
      };
      
      return ret;
    },
  };
}
