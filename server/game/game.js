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

/**
 * @fileoverview Game management for the video wall.
 *
 * Creating a game:
 *
 * 1. Create a game instance.  Options is an optional object with the following
 *    possible properties:
 *     - maxPlayers: Number (default: 4)
 *     - colors: Array<string>, list of css colors. Length must be >=
 *       maxPlayers (default: 4 google logo colors).
 *
 *    // game is available as a global with one method: create().
 *    var mygame = game.create('MyGame', options);
 *
 * 2. Player info (index, controls, etc) is available from the player instances
 *    stored in Game.players.
 *
 *    var players = mygame.players;    // Sparse array of players by index.
 *    var playerMap = mygame.players;  // Map playerId -> player
 *
 *    // Each player has an assigned index (0 - maxPlayers - 1) and an assigned
 *    // css color string.
 *    var playerFoo = mygame.playerMap[playerFooId];
 *    playerFoo.color;  // -> '#4285F4'
 *    playerFoo.index;  // -> 0;
 *
 *    var player1 = mygame.players[1];  // Will be undefined in < 2 players.
 *
 *    // Controls is a map of input -> boolean. Available controls are up, down,
 *    // left, right, a, b, x, y.
 *    if (player1.controls.x) { doSomething(); };
 *
 *
 * 3. To manage per-player state in your module, listen for lifecycle events:
 *    (playerJoin, playerQuit).  It is fine to hang onto player references.
 *    Their controls fields will be updated asynchronously and you can just read
 *    them during tick() invocations.
 *
 *    mygame.on('playerJoin', function(player) { setUpPlayer(player) });
 *    mygame.on('playerQuit', function(player) { cleanUpPlayer(player) });
 *
 *    // There is also a controlsUpdate event if you need to do something more
 *    // complicated.
 *    mygame.on('controlsUpdate', function(player) { doSomething(player) });
 *
 * Games can be played by visiting the game server from a computer or mobile
 * device. They are listed by host + game in the dropdown while the game is on
 * a wall somewhere.
 */

import Debug from 'debug';
import EventEmitter from 'events';
import ioClient from 'socket.io-client';
import os from 'os';
const debug = Debug('wall:game');

/**
 * An individual player.
 * Clients get a player instance from the player map (Game.players) or by
 * listening to one of the lifecycle events on the game instance itself.
 * Controls are updated asynchronously and can be read directly in server module
 * code.
 */
class Player {
  constructor(playerId, index, color) {
    this.id = playerId;
    this.index = index;
    this.color = color;
    this.score = 0;
    this.controls = {};
  }
}

/**
 * This class is returned to clients who create a game using
 * GameManager.create(). Player instances are available in Game.players and
 * lifecycle events are emitted by instances of this class.  Games are
 * automatically cleaned up when modules are torn down.
 */
class Game extends EventEmitter {
  constructor(socket, host, name, opt_options) {
    super();
    var options = opt_options || {};

    var maxPlayers = options.maxPlayers || 4;
    var colors = options.colors || ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];

    if (!colors.length || colors.length < 4) {
      throw new Error(
          'Invalid game options: ' + options.maxPlayers + ' players and ' +
          colors.length + ' colors.');
    }

    var players = Array.from({length:maxPlayers});
    var playerMap = {};
    var gameStateInterval = null;

    var game = this;
    this.players = players;
    this.playerMap = playerMap;

    function sendGameState() {
      socket.emit('gameState', {
        // Sending controls back makes no sense.
        players: game.players.map(p => {
          const {controls, ...newP} = p || {};
          return newP;
        }),
      });
    }

    function onConnect() {
      debug('Connected to game server.');
      // TODO: rename this to gameReady.
      socket.emit('serverReady', {host: host, name: name});
      gameStateInterval = setInterval(sendGameState, 1000);
    }

    function onDisconnect() {
      debug('Disconnected from game server.');
      clearInterval(gameStateInterval);
    }

    function provisionPlayer(playerId) {
      var slot = players.findIndex(s => !s);
      if (slot == -1) {
        debug('Too many players: ', playerId);
        socket.emit('errorMsg', 'Too many players.', playerId);
      } else {
        var color = colors[slot];
        var player = new Player(playerId, slot, color);
        players[slot] = player;
        playerMap[playerId] = player;

        debug('Player ready: ', playerId);
        socket.emit('playerReady', player);
        game.emit('playerJoin', player);
      }
    }

    function removePlayer(playerId) {
      debug('Removing player: ' + playerId);
      var player = playerMap[playerId];
      delete playerMap[playerId];
      delete players[player.index];
      game.emit('playerQuit', player);
    }

    function setControls(playerId, controls) {
      if (playerMap[playerId]) {
        Object.assign(playerMap[playerId].controls, controls);
        game.emit('controlsUpdate', playerMap[playerId]);
      }
    }

    function setPlayerName(playerId, name) {
      if (playerMap[playerId]) {
        debug("Setting Name.");
        playerMap[playerId].name = name;
      }
    }

    // Hook up listeners.
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // TODO: Remove players that quit (heartbeat?).
    socket.on('playerJoin', provisionPlayer);
    socket.on('playerExit', removePlayer);
    socket.on('playerName', setPlayerName);
    socket.on('control', setControls);
  }
}

let host = '';
export function init(flags) {
  host = flags.game_server_host;
}
export function forModule() {
  var connections = [];
  var games = [];

  return {
    // Called by module code to add a game. Returns a new Game.
    create: function(gameName, options) {
      debug('Connecting to game server.');
      var client = ioClient('http://' + host + '/servers', {multiplex: false});
      connections.push(client);

      var game = new Game(client, os.hostname(), gameName, options);
      games.push(game);
      return game;
    },

    // Called when module is finished.
    dispose: function() {
      connections.forEach(c => c.close());
    }
  };
}
