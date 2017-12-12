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

(function(factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['require'], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory(require);
  }
}(function(require) {
  // "Huh?" you may be thinking.
  // Well, we have a problem: our clients use requirejs which use a regexp to
  // find users of require() before running code so that folks can write 
  // synchronous-looking code (e.g. var a = require('a')) even though loading
  // the code takes time, but our modules sometimes need to include server-only
  // dependencies (like server/util/googleapis). One approach is to move all
  // such deps to lib/, and require that all implementers provide SOME version
  // that works in both client and server, but I suspect that this is a high
  // burden. Instead, when you need to include a server-only dep, use this
  // library:
  //
  // var serverRequire = require('lib/server_require');
  // ...
  // class ServerOnlyCode extends ModuleInterface.Server {
  //   willBeShownSoon() {
  //     var serverOnlyDep = serverRequire('server/dep');
  //   }
  // }
  return require;
}));
