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
var LayoutStateMachine = require('server/modules/layout_state_machine');

var Manager = function() {
  this.layoutSM_ = new LayoutStateMachine;
};

// Starts a playlist, which is a list of Layout objects.
Manager.prototype.startPlaylist = function(playlist) {
  this.layoutSM_.setPlaylist(playlist);
};

// Notification that a client has joined.
Manager.prototype.newClient = function(client) {
  this.layoutSM_.newClient(client);
};

// Notification that a client has lost.
Manager.prototype.lostClient = function(id) {
  this.layoutSM_.dropClient(id);
};

Manager.prototype.getLayoutSM = function() {
  return this.layoutSM_;
};

exports.Manager = Manager;
