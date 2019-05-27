/* Copyright 2016 Google Inc. All Rights Reserved.

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

import _ from 'underscore';
import socketIoClient from 'socket.io-client';

export function load(debug, network) {
  //
  // Module Confguration
  //
  let DEFAULT_CONFIG = {
    codeServer: "http://localhost:3001",
    noCodeMessage: "Feed me code"
  };

  //
  // Helper methods
  //
  function defaultClientCode(client, text) {
    return `canvas.writeText(screen.width/2, screen.height/2-300, "Chicago Brick Live!", "#f4c20d", "140px Arial", {textAlign: "center"});
  canvas.writeText(screen.width/2, screen.height/2-150, "${text}", "white", "100px Arial", {textAlign: "center"});
  canvas.writeText(screen.width/2, screen.height/2+50, "${client.x}, ${client.y}", "white", "180px Arial", {textAlign: "center"});
  canvas.draw.image(10, 10, "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png", 0.5);`;
  }

  function getClientKey(client) {
    return `${client.x},${client.y}`;
  }

  //
  // Server Module
  //
  class ChicagoBrickLiveServer {
    constructor(config) {
      this.config = _.defaults(config, DEFAULT_CONFIG);
      debug(`Attempting to use codeserver at ${this.config.codeServer}`);

      // All clients (x, y) that have ever connected.  Used to notify all clients
      // of global code changes (e.g., codeserver comes online) and cache code.
      this.clients = {};

      this.codeServer = socketIoClient(this.config.codeServer);

      // Setup connection to code server.
      this.codeServer.on('connect', () => {
        debug(`Connected to code server (${this.config.codeServer}).`);

        // When code server connection is made re-request code for all clients
        // we know about.
        // #TODO Is there any client list provided by brick?
        for (var key in this.clients) {
          this.requestCode(this.clients[key].client);
        }
      });

      this.codeServer.on('disconnect', () => {
        debug('Disconnected from code server.');
      });

      this.codeServer.on('code', (data) => {
        // Make a unique key of the form 'x,y' so we can use a dictionary for clients.
        var key = getClientKey(data.client);
        debug(`Received new info for client(${key}).`);

        // Override empty code
        data.code = data.code || defaultClientCode(data.client, this.config.noCodeMessage);

        // Cache the code in case the code server goes away.
        this.clients[key] = data;

        // Forward code to clients.
        network.emit(`code(${key})`, data);
      });

      // Handle connections from clients.
      network.on('connection', (socket) => {
        socket.on('requestCode', (data) => {

          const key = getClientKey(data.client);
          debug(`Client(${key}) requested code.`);
          debug(`Code server connected: ${this.codeServer.connected}`);

          // Track the client
          this.clients[key] = _.extend(this.clients[key] || {}, { client: data.client });
          this.clients[key] = _.defaults(this.clients[key], { code: undefined });

          let response;

          if (this.clients[key].code || !this.codeServer.connected) {
            debug(`Sending cached code to client(${key}).`);
            response = _.defaults(this.clients[key], {
              client: data.client,
              code: defaultClientCode(data.client, "No code server available")
            });

            socket.emit(`code(${key})`, response);
          } else {
            // If there isn't any code yet, ask the code server. Any code
            // it sends back will be forwarded to clients automatically.
            this.requestCode(data.client);
          }
        });
      });
    }

    dispose() {
      this.codeServer.close();
    }

    requestCode(client) {
      // Request code from code server
      const key = getClientKey(client);
      debug(`Requesting code for client(${key}) from code server.`);
      this.codeServer.emit('requestCode', { client: client });
    }
  }
  return {server: ChicagoBrickLiveServer};
}
