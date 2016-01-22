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
var debug = require('debug')('wall:layout_state_machine');

var stateMachine = require('lib/state_machine');
var time = require('server/util/time');
var wallGeometry = require('server/util/wall_geometry');
var ClientControlStateMachine = require('server/modules/client_control_state_machine');
var ModuleStateMachine = require('server/modules/module_state_machine');

var describeLayout = function(partitions) {
  var layout = [];
  partitions.forEach((moduleSM) => {
    layout.push({
      geo: moduleSM.getGeo(),
      deadline: moduleSM.getDeadlineOfNextTransition(),
      state: moduleSM.getState()
    });
  });
  return layout;
};

var LayoutStateMachine = function() {
  stateMachine.Machine.call(this, 'LayoutSM', new IdleState);

  // All known clients. Maps client ID to ClientControlStateMachine.
  this.context_.clients = {};

  // A playlist here is a list of layouts.
  this.context_.playlist = null;
  this.context_.index = 0;
};
LayoutStateMachine.prototype = Object.create(stateMachine.Machine.prototype);
LayoutStateMachine.prototype.newClient = function(client) {
  this.context_.clients[client.socket.id] =
      new ClientControlStateMachine(client);
  this.current_.newClient(client);
};
LayoutStateMachine.prototype.dropClient = function(id) {
  this.current_.dropClient(id);
  delete this.context_.clients[id];
};
LayoutStateMachine.prototype.setPlaylist = function(playlist) {
  debug('set playlist', playlist);
  this.context_.playlist = playlist;
  this.context_.index = 0;
  this.current_.didUpdatePlaylist();
};
LayoutStateMachine.prototype.skipAhead = function() {
  this.context_.index = (this.context_.index + 1) %
      this.context_.playlist.length;
  this.current_.didUpdatePlaylist();
};
LayoutStateMachine.prototype.getPlaylist = function() {
  return {
    playlist: this.context_.playlist,
    index: this.context_.index,
  };
};
LayoutStateMachine.prototype.getLayout = function() {
  return this.current_.getLayout();
};
LayoutStateMachine.prototype.getClientState = function() {
  var ret = [];
  for (var key in this.context_.clients) {
    var client = this.context_.clients[key];
    ret.push({
      module: client.getModuleName(),
      rect: client.getClientInfo().rect,
      state: client.getState(),
    });
  }
  return ret;
};
LayoutStateMachine.prototype.playModule = function(moduleName) {
  return this.current_.playModule(moduleName);
};

var IdleState = function() {
  stateMachine.State.call(this, 'IdleState');
};
IdleState.prototype = Object.create(stateMachine.State.prototype);
IdleState.prototype.enter_ = function() {};
IdleState.prototype.didUpdatePlaylist = function() {
  this.transition_(new TransitionToNewLayoutState);
};
IdleState.prototype.newClient = function(client) {};
IdleState.prototype.dropClient = function(id) {};
IdleState.prototype.getLayout = function() {
  return {
    partitions: [],
    wall: wallGeometry.getGeo(),
  };
};
IdleState.prototype.playModule = function(moduleName) {
  return false;
};

var TransitionToNewLayoutState = function() {
  stateMachine.State.call(this, 'TransitionToNewLayoutState');

  // The partition to use when asked to display a particular module.
  this.nextPartition_ = 0;
};
TransitionToNewLayoutState.prototype = Object.create(
    stateMachine.State.prototype);
TransitionToNewLayoutState.prototype.enter_ = function() {
  this.layout_ = this.context_.playlist[this.context_.index];
  this.context_.index = (this.context_.index + 1) %
      this.context_.playlist.length;
  debug('Layout is now', this.layout_);

  // Repartition the wall.
  var geos = wallGeometry.partitionGeo(this.layout_.maxPartitions);
  this.partitions_ = geos.map((geo) => {
    return new ModuleStateMachine(this.context_.clients, geo);
  });

  // Transition in 5 seconds.
  var deadline = time.inFuture(5000);

  debug(
      'Fading ' + this.partitions_.length + ' screens in at ' + deadline);
  this.partitions_.forEach((sm) => {
    sm.loadPlaylist(this.layout_, deadline);
  });

  // If we have more than one layout, schedule the next one.
  if (this.context_.playlist.length > 1) {
    Promise.delay(this.layout_.duration * 1000)
        .then(() => this.transition_(new FadeOutLayoutState(this.partitions_)));
  }
};
TransitionToNewLayoutState.prototype.didUpdatePlaylist = function() {
  this.transition_(new FadeOutLayoutState(this.partitions_));
};
TransitionToNewLayoutState.prototype.newClient = function(client) {
  // Which partition is this in?
  var moduleSM = _.find(this.partitions_, function(moduleSM) {
    return moduleSM.newClient(client);
  });
  if (!moduleSM) {
    // Client tried to connect outside the wall geometry.
    throw new Error(
        'New client ' + client.socket.id + ' has no module sm! ' +
            this.partitions_.length);
  }
};
TransitionToNewLayoutState.prototype.dropClient = function(id) {
  _.each(this.partitions_, function(moduleSM) {
    return moduleSM.dropClient(id);
  });
};
TransitionToNewLayoutState.prototype.getLayout = function() {
  return {
    partitions: describeLayout(this.partitions_),
    wall: wallGeometry.getGeo(),
  };
};
TransitionToNewLayoutState.prototype.playModule = function(moduleName) {
  debug('Requested to play module ' + moduleName);
  var success = this.partitions_[this.nextPartition_].playModule(moduleName);
  this.nextPartition_ = (this.nextPartition_ + 1) % this.partitions_.length;
  return success;
};

var FadeOutLayoutState = function(partitions) {
  stateMachine.State.call(this, 'FadeOutLayoutState');

  // The layout to fade out.
  this.partitions_ = partitions;

  // The time to fade out.
  this.deadline_ = time.inFuture(5000);
};
FadeOutLayoutState.prototype = Object.create(stateMachine.State.prototype);
FadeOutLayoutState.prototype.enter_ = function() {
  debug('Fading out at ' + this.deadline_);

  Promise.all(this.partitions_.map((sm) => sm.fadeToBlack(this.deadline_)))
      .then(() => this.transition_(new TransitionToNewLayoutState));
};
FadeOutLayoutState.prototype.didUpdatePlaylist = function() {
  // We'll fade in soon enough.
};
FadeOutLayoutState.prototype.newClient = function() {
  // We'll fade in soon enough & repartition.
};
FadeOutLayoutState.prototype.dropClient = function() {
  // We'll fade in soon enough & repartition.
};
FadeOutLayoutState.prototype.getLayout = function() {
  return {
    partitions: describeLayout(this.partitions_),
    wall: wallGeometry.getGeo(),
  };
};
FadeOutLayoutState.prototype.playModule = function(moduleName) {
  // TODO: better would be to save up the module for the next layout.
  return false;
};


module.exports = LayoutStateMachine;
