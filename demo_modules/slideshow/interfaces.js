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

export class ContentFetcher {
  async chooseContent(client) {
    // Returns 1 unit of opaque content loaded by the server-side loading
    // strategy.
  }
}

export class ContentMetadata {
  get width() {
    // Returns the width of the content.
    return 0;
  }
  get height() {
    // returns the height of the content.
    return 0;
  }
}

// Here, we specify the interfaces for the load and display strategies. There is
// a separate interface for the server and the client.
export class ServerLoadStrategy {
  async init() {
    // Return a promise when initialization is complete.
  }
  async loadMoreContent(opt_paginationToken) {
    // Return a promise of a result with the following properties:
    //  - paginationToken: An opaque token that will be passed to the next
    //    invocation of loadMoreContent if there is more content to download.
    //  - content: An array of content, suitable for transmission to the client.
  }
  async downloadFullContent(content, clippingRect, cache) {
    // Allows the load strategy to optimize the content for a specific
    // client. The strategy should return the content in the clipping rect. It
    // should also make use of the provided cache (a Map) to avoid duplicating
    // work, such as downloading or clipping.
    return null;
  }
  async metadataForContent(content) {
    // Returns a ContentMetadata associated with this content, or null if
    // there isn't any.
    return null;
  }
  serializeForClient() {
    // Return JSON that can be transmitted to the client and can instantiate
    // the strategy there.
    return {};
  }
}

export class ClientLoadStrategy {
  init(surface, deadline) {
    // Init the load strategy with the surface information and a timestamp that
    // is guaranteed to be shared among all clients.
  }
  loadContent(content) {
    // Loads content specified by the content id. The first parameter comes
    // from the  server version of this strategy by way of the display
    // strategy. The promise is expected to resolve to an Element.
    return Promise.resolve();
  }
}

export class ServerDisplayStrategy {
  tick(time, delta) {
    // Coordinate with the clients about what should be shown.
  }
  clipRectForMetadata(metadata, client) {
    // Returns a clipping rect for the content specified by the metadata for
    // the specified client. The returned Rectangle should be in the unit-space
    // of the content (0,0) contentWidth x contentHeight. The strategy can
    // instead return null to denote that no clipping should occur.
    return null;
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
