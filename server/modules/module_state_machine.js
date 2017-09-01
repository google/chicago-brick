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

const ModuleDef = require('server/modules/module_def');
const debug = require('debug')('wall:module_state_machine');
const random = require('random-js')();
const assert = require('lib/assert');

const stateMachine = require('lib/state_machine');
const time = require('server/util/time');
const library = require('server/modules/module_library');
const ServerStateMachine = require('server/modules/server_state_machine');
const geometry = require('lib/geometry');
const monitor = require('server/monitoring/monitor');

function isDisplayInPoly(rect, poly) {
  // find the center point of this display:
  var cx = rect.w / 2 + rect.x;
  var cy = rect.h / 2 + rect.y;

  return geometry.isInside(poly, cx, cy);
}

// Takes a map of client ids -> client state machines. Not owned or changed
// by this class, only read.
class ModuleStateMachine extends stateMachine.Machine {
  constructor(allClients, geo) {
    super(new IdleState, debug);

    // Map of ID to ClientControlStateMachine for all clients.
    this.allClients_ = allClients;

    this.setContext({
      geo,
      server: new ServerStateMachine(geo),
      clients: Object.keys(allClients)
          .map(k => allClients[k])
          .filter(c => isDisplayInPoly(c.getClientInfo().rect, geo)),
    });
    
    // Forward errors from my child state machines to my listener.
    this.context_.server.setErrorListener(error => this.errorListener_(error));
    this.context_.clients.forEach(c => c.setErrorListener(error => this.errorListener_(error)));
    this.setErrorListener(error => {
      debug('Error in sub-sm, continuing playlist...');
      // If an error occurs in any client or server, skip this module.
      this.nextModule();
    });

    this.reloadHandler = reloadedModule => {
      // If the module that was just reloaded is the same one that we are playing, we should reload it.
      let currentModuleName = this.state.getCurrentModuleName();
      if (reloadedModule.name == currentModuleName) {
        this.playModule(reloadedModule.name);
      } else {
        // Otherwise, we ignore the reload event.
      }
    };
    library.on('reloaded', this.reloadHandler);
    
    /** True when the reload handler is installed. */
    this.reloadHandlerInstalled_ = true;
  }
  
  // Turn off the state machine at the specified, coordinated time.
  fadeToBlack(deadline) {
    if (monitor.isEnabled()) {
      monitor.update({module: {
        time: time.now(),
        event: 'fade-to-black',
        deadline: deadline
      }});
    }
    
    if (this.reloadHandlerInstalled_) {
      library.removeListener('reloaded', this.reloadHandler);
      this.reloadHandlerInstalled_ = false;
    }

    // Tell the clients to stop.
    this.context_.clients.forEach(c => c.nextModule(ModuleDef.emptyModule(), deadline, this.context_.geo));
    
    // Tell the server to stop.
    this.context_.server.nextModule(ModuleDef.emptyModule(), deadline);

    // Set us back to idle, awaiting further instructions.
    this.transitionTo(new IdleState);
  }
  
  newClient(clientInfo) {
    if (!isDisplayInPoly(clientInfo.rect, this.context_.geo)) {
      return false;
    }

    let client = this.allClients_[clientInfo.socket.id];
    this.context_.clients.push(client);
    this.state.newClient(client, this.context_.geo);
    return true;
  }
  dropClient(id) {
    let client = this.allClients_[id];
    
    let i = this.context_.clients.findIndex(c => c === client);
    
    if (i == -1) {
      return false;
    }

    this.context_.clients.splice(i, 1);

    return true;
  }
  loadPlaylist(layout, deadline) {
    if (monitor.isEnabled()) {
      monitor.update({module: {
        time: time.now(),
        event: 'load-playlist',
        deadline: deadline
      }});
    }
    
    // Copy the playlist & shuffle.
    let playlist = Array.from(layout.modules);
    random.shuffle(playlist);
    
    // Load the modules referenced in this playlist.
    Promise.allSettled(playlist.map(m => library.modules[m].whenLoadedPromise)).done(results => {
      // TODO(applmak): Omitting bad modules at THIS point is a weird choice.
      // We should do it earlier, perhaps at load time.
      
      // Check to see if any modules were rejected. If so, remove them from the 
      // playlist before requesting the state machine to execute anything.
      let filteredPlaylist = playlist.filter(
          (module, index) => results[index].status == 'resolved');
      if (filteredPlaylist.length > 0) {
        this.transitionTo(new DisplayState(filteredPlaylist, layout, deadline));
      } else {
        throw new Error('Playlist has no modules!');
      }
    });
  }
  playModule(moduleName) {
    if (monitor.isEnabled()) {
      monitor.update({module: {
        time: time.now(),
        event: moduleName
      }});
    }
    
    if (!this.reloadHandlerInstalled_) {
      library.on('reloaded', this.reloadHandler);
      this.reloadHandlerInstalled_ = true;
    }
    
    // Note: this will throw if the module is not in the current playlist, as
    // we have no def for it.
    // TODO(applmak): Handle this better.
    this.state.playModule(moduleName);
  }
  nextModule() {
    this.state.nextModule();
  }
  getGeo() {
    return this.context_.geo;
  }
  getDeadlineOfNextTransition() {
    return this.state.getDeadline();
  }
}

class IdleState extends stateMachine.State {
  enter(transition) {
    if (monitor.isEnabled()) {
      monitor.update({module: {
        time: time.now(),
        state: this.getName(),
      }});
    }
    
    this.transition_ = transition;
  }
  newClient(client) {}
  playModule(moduleName) {
    throw new Error(`No module named ${moduleName}`);
  }
  nextModule() {
    // ... no next module!
    throw new Error('No next module!');
  }
  getCurrentModuleName() {
    return '';
  }
  getDeadline() {
    return Infinity;
  }
}

class DisplayState extends stateMachine.State {
  constructor(playlist, layout, deadline, index = 0) {
    super();

    this.layout_ = layout;
    this.playlist_ = playlist;
    
    // Index cannot be out of bounds.
    assert(index < playlist.length);
    this.index_ = index;

    this.displayDuration_ = this.layout_.moduleDuration * 1000;
    this.deadline_ = deadline;
    
    // The current module we are attempting to show or showing.
    this.module_ = playlist[index];
    
    this.timer_ = null;
  }
  enter(transition, context) {
    this.transition_ = transition;
    
    debug(`Displaying ${this.module_} starting at ${this.deadline_}`);
    
    if (monitor.isEnabled()) {
      monitor.update({module: {
        time: time.now(),
        deadline: this.deadline_,
        state: this.getName(),
      }});
    }
    
    // Tell the server to transition to this new module.
    context.server.nextModule(this.module_, this.deadline_, context.geo);
    
    // Be prepared for the server to go to error state.
    let errorHandler = () => {
      if (!this.timer_) {
        // We're leaving the state anyway.
        return;
      }
      if (context.server.state.getName() == 'ErrorState') {
        // We transitioned to the error state!
        debug(`Error encountered in server module ${this.module_}`);
        // Allow the server to transition internally (back to idle).
        context.server.restartMachineAfterError();
        
        // Remove the module from the list.
        this.playlist_.splice(this.index_, 1);
        
        if (this.playlist_.length == 0) {
          throw new Error('No modules left in playlist!');
        }

        // Go to the next module in 5 seconds.
        let nextModuleIndex = this.index_ % this.playlist_.length;
        this.transition_(new DisplayState(this.playlist_, this.layout_, time.inFuture(5000), nextModuleIndex));
      } else {
        context.server.getTransitionPromise().then(errorHandler);
      }
    };
    context.server.getTransitionPromise().then(errorHandler);

    // Tell each client to transition to the module.
    context.clients.forEach(client => client.nextModule(this.module_, this.deadline_, context.geo));

    // Transition to the next thing in the playlist when the deadline + the 
    // duration pass.
    let durationBeforePrepare = Math.max(this.displayDuration_ - 5000, 0);
    let prepareDeadline = this.deadline_ + durationBeforePrepare;
    debug('Waiting until', this.deadline_, prepareDeadline);
    this.timer_ = setTimeout(() => this.nextModule(), time.until(prepareDeadline));
  }
  exit() {
    clearTimeout(this.timer_);
    // Signal that we are leaving.
    this.timer_ = null;
  }
  newClient(client, geo) {
    // Tell the new guy to load the next module NOW.
    client.nextModule(this.module_, this.deadline_, geo);
  }
  playModule(moduleName) {
    // Find what index that is.
    var index = this.playlist_.findIndex(m => m == moduleName);
    if (index == -1) {
      throw new Error(`Unable to find module ${moduleName} in the playlist!`);
    }
    this.transition_(new DisplayState(this.playlist_, this.layout_, time.inFuture(0), index));
  }
  nextModule() {
    if (this.playlist_.length == 0) {
      throw new Error('No modules left in playlist!');
    }
    let nextModuleIndex = (this.index_ + 1) % this.playlist_.length;
    debug(`Begin preparing to transition to ${this.playlist_[nextModuleIndex]} (item ${nextModuleIndex} of ${this.playlist_.length})`);
    this.transition_(new DisplayState(this.playlist_, this.layout_, time.now(), nextModuleIndex));
  }
  getCurrentModuleName() {
    return this.module_;
  }
  getDeadline() {
    return this.deadline_ + this.displayDuration_;
  }
}

module.exports = ModuleStateMachine;
