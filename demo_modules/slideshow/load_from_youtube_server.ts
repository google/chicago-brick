/* Copyright 2019 Google Inc. All Rights Reserved.

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

/* globals YT */

// LOAD YOUTUBE PLAYLIST STRATEGY
// Config:
//   playlistId: string - Playlist ID that contains the videos we should show.
//   seekTo: number - Number of seconds into which we should start playing the
//                    video. This doesn't affect looping behavior.
//   playThroughPlaylist: boolean - If true, don't just loop a single video, but
//                        rather, continue playing the next video in the
//                        playlist.
//   sync: boolean - If true, keep the videos sync'd across their displays.

export class LoadYouTubePlaylistServerStrategy extends ServerLoadStrategy {
  constructor(config) {
    super();
    this.config = config;

    // YouTube data api v3
    this.api = null;
  }
  async init() {
    // Get an authenticated API. When init's promise is resolved, we succeeded.
    const { getAuthenticatedClient } = await import(
      "../../server/util/googleapis.js"
    );
    const client = await getAuthenticatedClient();
    debug("Initialized YouTube Client.");
    this.config.credentials = client.credentials;
    this.api = client.googleapis.youtube("v3");
  }
  async loadMoreContent(opt_paginationToken) {
    let response;
    try {
      response = await this.api.playlistItems.list({
        playlistId: this.config.playlistId,
        pageToken: opt_paginationToken,
        maxResults: 50,
        part: "snippet",
      });
    } catch (e) {
      debug("Failed to download more youtube content! Delay a bit...");
      await delay(Math.random() * 4000 + 1000);
      return this.loadMoreContent(opt_paginationToken);
    }
    debug("Downloaded " + response.data.items.length + " more content ids.");
    return {
      content: response.data.items.map((item, index) => {
        return {
          videoId: item.snippet.resourceId.videoId,
          index: index,
        };
      }),
      paginationToken: response.nextPageToken,
    };
  }
}
