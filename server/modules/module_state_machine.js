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

var _ = require('underscore');
var debug = require('debug')('wall:module_state_machine');
var random = require('random-js')();

var stateMachine = require('lib/state_machine');
var time = require('server/util/time');
var moduleRegistry = require('server/modules/module_registry');
var library = require('server/modules/library');
var ServerStateMachine = require('server/modules/server_state_machine');
var geometry = require('lib/geometry');

function isDisplayInPoly(rect, poly) {
  // find the center point of this display:
  var cx = rect.w / 2 + rect.x;
  var cy = rect.h / 2 + rect.y;

  return geometry.isInside(poly, cx, cy);
}

// Takes a map of client ids -> client state machines. Not owned or changed
// by this class, only read.
var ModuleStateMachine = function(allClients, geo) {
  stateMachine.Machine.call(this, 'ModuleSM', new IdleState);

  // The geo that contains this module sm.
  this.geo_ = geo;

  // Map of ID to ClientControlStateMachine for all clients.
  this.allClients_ = allClients;

  // Server module controller by the module state machine.
  this.context_.server = new ServerStateMachine(geo);

  // Clients controlled by the module state machine.
  this.context_.clients = _.pick(allClients, (client) =>
      isDisplayInPoly(client.getClientInfo().rect, geo));

  _.each(this.context_.clients, (clientSM) => clientSM.setGeo(geo));

  this.context_.playlist = null;
  this.context_.moduleDuration = null;
};
ModuleStateMachine.prototype = Object.create(stateMachine.Machine.prototype);
ModuleStateMachine.prototype.newClient = function(client) {
  if (!isDisplayInPoly(client.rect, this.geo_)) {
    return false;
  }

  this.context_.clients[client.socket.id] = this.allClients_[client.socket.id];
  this.context_.clients[client.socket.id].setGeo(this.geo_);
  this.current_.newClient(client);
  return true;
};
ModuleStateMachine.prototype.dropClient = function(id) {
  if (!(id in this.context_.clients)) {
    return false;
  }

  delete this.context_.clients[id];

  return true;
};
ModuleStateMachine.prototype.loadPlaylist = function(layout, deadline) {
  debug('switch to layout', layout);
  this.context_.playlist = layout.modules.slice(0);
  random.shuffle(this.context_.playlist);
  this.context_.moduleDuration = layout.moduleDuration;
  this.current_.loadPlaylist(deadline);
};
ModuleStateMachine.prototype.fadeToBlack = function(deadline) {
  this.context_.playlist = ['memory-debug'];
  this.context_.moduleDuration = deadline;
  this.current_.loadPlaylist(deadline);

  // Return a promise that will be resolved when the state machine is
  // idling (technically, in Display state with a black-screen module).
  return this.context_.server.monitorState(function(state) {
    return state.name_ == 'DisplayState';
  }).then(() => this.stop());
};
ModuleStateMachine.prototype.playModule = function(moduleName) {
  return this.current_.playModule(moduleName);
};
ModuleStateMachine.prototype.getGeo = function() {
  return this.geo_;
};
ModuleStateMachine.prototype.getDeadlineOfNextTransition = function() {
  return this.current_.getDeadline();
};
ModuleStateMachine.prototype.stop = function() {
  this.context_.server.stop();
};

var IdleState = function() {
  stateMachine.State.call(this, 'IdleState');
};
IdleState.prototype = Object.create(stateMachine.State.prototype);
IdleState.prototype.enter_ = function() {};
IdleState.prototype.loadPlaylist = function(deadline) {
  this.transition_(new LoadingState(deadline));
};
IdleState.prototype.newClient = function(client) {};
IdleState.prototype.playModule = function(moduleName) {
  return false;
};
IdleState.prototype.getDeadline = function() {
  return Infinity;
};

var LoadingState = function(deadline) {
  stateMachine.State.call(this, 'LoadingState');

  // The time at which we should swap to the new playlist.
  this.deadline_ = deadline;
};
LoadingState.prototype = Object.create(stateMachine.State.prototype);
LoadingState.prototype.enter_ = function() {
  // Load the playlist.
  var modulePromises = this.context_.playlist.map((module) =>
      library.load(moduleRegistry.allModules[module].path));
  Promise.allSettled(modulePromises).done((results) => {
    // Check to see if any modules were rejected. If so, remove them from the 
    // playlist.
    this.context_.playlist = this.context_.playlist.filter((module, index) => {
      if (results[index].status != 'resolved') {
        debug('Removing ' + module + ' from the playlist!');
      }
      return results[index].status == 'resolved';
    });
    this.transition_(new TransitionState(this.deadline_));
  });
};
LoadingState.prototype.loadPlaylist = function(deadline) {
  // Stop any prior async work from continuing.
  // The fact that we still be in the 'map' above is no big deal, we'll just
  // extra disk i/o.
  this.transition_(new LoadingState(deadline));
};
LoadingState.prototype.newClient = function(client) {};
LoadingState.prototype.playModule = function(moduleName) {
  return false;
};
LoadingState.prototype.getDeadline = function() {
  return this.deadline_;
};

var TransitionState = function(deadline, opt_index) {
  stateMachine.State.call(this, 'TransitionState');

  // If no next item passed, choose the first one.
  this.index_ = opt_index || 0;

  this.deadline_ = deadline;
};
TransitionState.prototype = Object.create(stateMachine.State.prototype);
TransitionState.prototype.enter_ = function() {
  // Check for wrapping.
  this.index_ = this.index_ % this.context_.playlist.length;

  // We'll attempt to transition the clients to this module.
  this.module_ = moduleRegistry.allModules[
      this.context_.playlist[this.index_]];

  // Tell the server to transition.
  this.context_.server.nextModule(this.module_, this.deadline_);
  this.context_.server
      .monitorState((state) => {
        return state.name_ == 'ErrorState' || state.name_ == 'TransitionState';
      }).then(() => {
        if (this.context_.server.getState() == 'ErrorState') {
          debug('Advancing to next module soon due to error state');
          // Wait a bit so that if we only have one module (as in
          // development mode) we don't throw errors in a tight loop.
          this.deadline_ = time.inFuture(2000);
          Promise.delay(2000).then(() => this.transition_(
              new TransitionState(time.inFuture(5000), this.index_ + 1)));
        }
      });

  // Tell each client to do the module.
  _.each(this.context_.clients, function(clientState) {
    clientState.nextModule(this.module_, this.deadline_);
  }, this);

  // When the deadline arrives, enter display state.
  debug('Waiting until', this.deadline_);
  Promise.delay(time.until(this.deadline_)).done(() => {
    this.transition_(new DisplayState(
        this.module_, this.deadline_, this.index_));
  });
};
TransitionState.prototype.loadPlaylist = function(deadline) {
  // We changed the layout... immediately load the new playlist.
  this.transition_(new LoadingState(deadline));
};
TransitionState.prototype.newClient = function(client) {
  // Tell the new guy to load the next module NOW.
  this.context_.clients[client.socket.id].nextModule(
      this.module_, this.deadline_);
};
TransitionState.prototype.playModule = function(moduleName) {
  var index = this.context_.playlist.findIndex(moduleName);
  if (index != -1) {
    debug('Found requested module ' + this.context_.playlist[index].name);
    this.index_ = index;
    return true;
  }
  debug('Could not find requested module ' + moduleName);
  return false;
};
TransitionState.prototype.getDeadline = function() {
  return this.deadline_;
};

var DisplayState = function(module, deadline, index) {
  stateMachine.State.call(this, 'DisplayState');

  // The module to tell late clients to transition to.
  this.lateClientModule_ = module;
  this.lateClientDeadline_ = deadline;

  // What to play from the playlist.
  this.index_ = index;
};
DisplayState.prototype = Object.create(stateMachine.State.prototype);
DisplayState.prototype.enter_ = function() {
  if (this.context_.playlist.length > 1) {
    // Hold for a while, then transition to the next module.

    // Pad the module duration by 20% so that individual wall partitions
    // transition at slightly different times.
    var displayDuration = this.context_.moduleDuration +
        Math.random() * this.context_.moduleDuration / 5;
    this.deadline_ = time.inFuture(1000 * displayDuration);

    debug('Displaying ', this.lateClientModule_.name, 'until', this.deadline_);
    Promise.delay(time.until(this.deadline_)).done(() => {
      this.transition_(new TransitionState(
          this.deadline_, this.index_ + 1));
    });
  } else {
    debug('Displaying ', this.lateClientModule_.name);
    this.deadline_ = Infinity;
  }
};
DisplayState.prototype.loadPlaylist = function(deadline) {
  // We changed the layout... immediately load the new playlist.
  this.transition_(new LoadingState(deadline));
};
DisplayState.prototype.newClient = function(client) {
  // Tell the new guy to load the next module NOW.
  this.context_.clients[client.socket.id].nextModule(
      this.lateClientModule_, this.lateClientDeadline_);
};
DisplayState.prototype.playModule = function(moduleName) {
  var index = this.context_.playlist.findIndex(moduleName);
  if (index != -1) {
    debug('Found requested module ' + this.context_.playlist[index].name);
    this.index_ = index;
    return true;
  }
  debug('Could not find requested module ' + moduleName);
  return false;
};
DisplayState.prototype.getDeadline = function() {
  return this.deadline_;
};

module.exports = ModuleStateMachine;
