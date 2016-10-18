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

define(function(require) {
  'use strict';
  var io = require('socket.io');
  var debug = require('client/util/debug')('wall:network');
  var info = require('client/util/info');
  var socket;

  return {
    // Open the connection with the server once the display properties are
    // known.
    openConnection : function(opt_displayRect) {
      socket = io(location.host);
      if (opt_displayRect) {
        socket.on('config', function(config) {
          socket.emit('config-response', opt_displayRect.serialize());
        });
      }
    },
    on : function(event, callback) { socket.on(event, callback); },
    once : function(event, callback) { socket.once(event, callback); },
    removeListener : function(event, callback) {
      socket.removeListener(event, callback);
    },
    send : function(event, data) { socket.emit(event, data); },
    forModule : function(id) {
      var moduleSocket;
      var externalNspName = `module${id.replace(/[^0-9]/g, 'X')}`;
      return {
        open: function() {
          var baseAddr = location.protocol + '//' + location.host;
          var addr = `${baseAddr}/${externalNspName}`;
          moduleSocket = io(addr, {
            multiplex: false,
            query: {
              id,
              rect: info.virtualRectNoBezel.serialize()
            }
          });
          debug('Opened per-module socket @ ' + externalNspName);
          return moduleSocket;
        },
        close: function() {
          debug('Closed per-module socket @ ' + externalNspName);
          moduleSocket.removeAllListeners();
          moduleSocket.close();
          moduleSocket = undefined;
        }
      };
    }
  };
});
