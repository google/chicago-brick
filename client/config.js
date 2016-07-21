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

requirejs.config({
  // Karma serves files under /base, which is the basePath from your config file
  baseUrl : '/',

  // example of using a couple path translations (paths), to allow us to refer
  // to different library dependencies, without using relative paths
  paths : {
    'clock-skew' : 'sys/clock-skew/lib/clock_skew',
    'gl-matrix': 'sys/gl-matrix/dist/gl-matrix-min',
    'noisejs': 'sys/noisejs/index',
    'p5' : 'sys/p5/lib/p5',
    'p5.dom' : 'sys/p5/lib/addons/p5.dom',
    'peer': 'sys/peerjs/dist/peer',
    'querystring': 'sys/qs/dist/qs',
    'socket.io' : 'sys/socket.io-client/socket.io',
    'three' : 'sys/three/three',
    'underscore' : 'sys/underscore/underscore',
    'vm-shim' : 'sys/vm-shim/vm-shim',
  },

  // example of using a shim, to load non AMD libraries (such as underscore)
  shim : {
    'noisejs': {exports: 'Noise'},
    'peer': {exports: 'Peer'},
    'three': {exports: 'THREE'},
    'vm-shim': {exports: 'vm'}
  }
});
