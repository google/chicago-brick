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

// INTERFACES
// Here, we specify the interfaces for the load and display strategies. There is
// a separate interface for the server and the client.
export class ServerLoadStrategy {
  async init() {
    // Return a promise when initialization is complete. More items might
    // become available over time, but the promise should only resolve when
    // there is at least one item to show.
  }
  serializeForClient() {
    // Return JSON that can be transmitted to the client and can instantiate
    // the strategy there.
    return {};
  }
  async contentForClient(client) {
    // Returns an array of all content loaded so far that could be displayed
    // on the specified client.
  }
}

export class ClientLoadStrategy {
  init(surface, deadline) {
    // Init the load strategy with the surface information and a timestamp that
    // is guaranteed to be shared among all clients.
  }
  async loadContent(content) {
    // Loads content specified by the content id. The first parameter comes
    // from the  server version of this strategy by way of the display
    // strategy. The promise is expected to resolve to an object:
    // {
    //   element: Some element, ready to be attached to the DOM and displayed.
    //   client: A x,y pair that indicates that this content should be
    //   restricted to a single client.
    // }
  }
}

export class ServerDisplayStrategy {
  async init(loadStrategy) {
    // Return a promise when initialization is complete.
  }
  tick(time, delta) {
    // Coordinate with the clients about what should be shown.
  }
  serializeForClient() {
    // Return JSON that can be transmitted to the client and can instantiate
    // the strategy there.
    return {};
  }
}

export class ClientDisplayStrategy {
  init(surface, loadStrategy) {
    // The surface on which the strategy should draw, and the client-side load
    // strategy, which is invoked when new content is downloaded.
  }
  draw(time, delta) {
    // Update the surface with the content.
  }
}
