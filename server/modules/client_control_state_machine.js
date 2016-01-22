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
require('lib/promise');
var debug = require('debug')('wall:client_control_state_machine');

var stateMachine = require('lib/state_machine');
var time = require('server/util/time');
var library = require('server/modules/library');
var wallGeometry = require('server/util/wall_geometry');

var ClientControlStateMachine = function(client) {
  stateMachine.Machine.call(
      this, 'ClientControlSM: ' + client.socket.id, new IdleState);

  // Assume the whole wall.
  this.context_.geo = wallGeometry.getGeo();

  // Remember the client.
  this.context_.client = client;

  // The current module, for monitoring purposes.
  // Updated by the states when a transition occurs.
  this.context_.moduleName = null;
};
ClientControlStateMachine.prototype = Object.create(
    stateMachine.Machine.prototype);
ClientControlStateMachine.prototype.nextModule = function(moduleDef, deadline) {
  debug('Told to go to', moduleDef.name, 'by', deadline);
  this.current_.nextModule(moduleDef, deadline);
};
ClientControlStateMachine.prototype.setGeo = function(geo) {
  this.context_.geo = geo;
};
ClientControlStateMachine.prototype.getModuleName = function() {
  return this.context_.moduleName;
};
ClientControlStateMachine.prototype.getClientInfo = function() {
  return this.context_.client;
};

var IdleState = function() {
  stateMachine.State.call(this, 'IdleState');
};
IdleState.prototype = Object.create(stateMachine.State.prototype);
IdleState.prototype.enter_ = function() {
  this.context_.moduleName = null;
};
IdleState.prototype.nextModule = function(moduleDef, deadline) {
  this.transition_(new PrepareState(moduleDef, deadline));
};

var PrepareState = function(moduleDef, deadline) {
  stateMachine.State.call(this, 'PrepareState');

  // Server-side module info.
  this.module_ = moduleDef;

  // Client-side module definition.
  this.clientDef_ = library.modules[moduleDef.path];

  // The deadline at which we should transition to the new module.
  this.deadline_ = deadline;
};
PrepareState.prototype = Object.create(stateMachine.State.prototype);
PrepareState.prototype.enter_ = function() {

  this.context_.moduleName = this.module_.name;

  // Tell the clients to load.
  this.context_.client.socket.emit('loadModule', {
    module: this.module_,
    def: this.clientDef_,
    time: this.deadline_,
    geo: this.context_.geo.points
  });

  Promise.delay(time.until(this.deadline_)).done((function() {
    this.transition_(new DisplayState);
  }).bind(this));
};
PrepareState.prototype.nextModule = function(moduleDef, deadline) {
  // Return right away.
  this.transition_(new PrepareState(moduleDef, deadline));
};

var DisplayState = function() {
  stateMachine.State.call(this, 'DisplayState');
};
DisplayState.prototype = Object.create(stateMachine.State.prototype);
DisplayState.prototype.enter_ = function() {};
DisplayState.prototype.nextModule = function(moduleDef, deadline) {
  this.transition_(new PrepareState(moduleDef, deadline));
};

module.exports = ClientControlStateMachine;
