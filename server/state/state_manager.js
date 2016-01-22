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
var sharedState = require('lib/shared_state');
var debug = require('debug')('wall:state_manager');
var _ = require('underscore');
var StateSchedule = require('server/state/state_schedule');

// Describes something that tracks all sharedstate and provides methods for
// the communication of that state across the network.
var StateManager = function(network) {
  // A map of tracked state name -> state variable.
  this.trackedState_ = {};
  // A map of tracked state name -> owner id.
  this.stateOwners_ = {};

  // A map of name -> interpolatordef;
  this.interpolatorDefs_ = {};

  // The network to communicate on.
  this.network_ = network;

  var self = this;
  this.network_.on('connection', function StateManagerClientHandler(socket) {
    socket.on('newclientstatecreated', function(data) {
      if (!(data.name in self.trackedState_) ||
          self.stateOwners_[data.name] === socket.id) {
        debug('New client state created: ' + data.name);
        self.stateOwners_[data.name] = socket.id;
        self.create(data.name, data.interpolatorDef, socket.id);
      } else if (!(data.name in self.stateOwners_)) {
        debug('Registering new owner for state ' + data.name);
        // TODO(pieps): Make it an error on the new client if interpolatorDef
        // isn't the same.
        self.stateOwners_[data.name] = socket.id;
      } else {
        debug('Did not create new state ' + data.name + ': ' +
            self.stateOwners_[data.name] + ' already owns it.');
      }
      socket.on('disconnect', function() {
        if (self.stateOwners_[data.name] === socket.id) {
          debug('Client disconnected; removing state: ' + data.name);
          delete self.stateOwners_[data.name];
        }
      });
    });
    socket.on('newclientstateset', function(data) {
      if (self.stateOwners_[data.name] === socket.id) {
        console.assert(data.name in self.trackedState_);
        self.get(data.name).set(data.value, data.time);
      } else {
        debug('State update for ' + data.name + ' not accepted. ' +
            'State already owned by ' + self.stateOwners_[data.name]);
      }
    });
    debug('Received late request for new state from ' + socket.id);
    self.informLateClient_(socket);
  });
};
StateManager.prototype.create = function(name, interpolatorDef, owner) {
  console.assert(!(name in this.trackedState_));
  if (owner === undefined) {
    owner = 'server';
  }
  this.trackedState_[name] = new sharedState.SharedState(
    name, sharedState.decodeInterpolator(interpolatorDef), owner);

  this.interpolatorDefs_[name] = interpolatorDef;
  this.informClient_(name, this.network_);
};
// Makes an unshared SharedState instance for the private use of the server.  It
// is not sent to clients.
StateManager.prototype.createPrivate = function(interpolatorDef) {
  return new sharedState.SharedState(
    'private', sharedState.decodeInterpolator(interpolatorDef), 'server');
};
StateManager.prototype.createSchedule = function(interpolatorDef, schedule) {
  return new StateSchedule(this, interpolatorDef, schedule);
};
StateManager.prototype.informLateClient_ = function(socket) {
  for (var k in this.trackedState_) {
    this.informClient_(k, socket);
  }
};
StateManager.prototype.informClient_ = function(name, socket) {
  if (socket.id) {
    debug('informing client ' + socket.id + ' about state', name);
  } else {
    debug('informing all clients about state', name);
  }
  socket.emit('newstate', {
    name: name,
    interpolatorDef: this.interpolatorDefs_[name],
    owner: this.stateOwners_[name]
  });
};
StateManager.prototype.get = function(name) {
  return this.trackedState_[name];
};

// Sends all of the most recent state to the clients.
// This assumes that we'll call this function no more often than we change the
// value of the variable for the latest time (which seems safe).
StateManager.prototype.send = function() {
  // Build a packet of data about all of the tracked state.
  var stateData = _.map(this.trackedState_, function(state, name) {
    return {
      name: name,
      dataPoint: _.last(state.store_)
    };
  });

  this.network_.emit('state', stateData);
};

module.exports = StateManager;
