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
