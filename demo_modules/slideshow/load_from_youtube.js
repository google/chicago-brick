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
const debug = require('debug');
const interfaces = require('demo_modules/slideshow/interfaces');
const serverRequire = require('lib/server_require');

// LOAD YOUTUBE PLAYLIST STRATEGY
// Config:
//   playlistId: string - Playlist ID that contains the videos we should show.
//   seekTo: number - Number of seconds into which we should start playing the
//                    video. This doesn't affect looping behavior.
//   playThroughPlaylist: boolean - If true, don't just loop a single video, but
//                        rather, continue playing the next video in the
//                        playlist.
class LoadYouTubePlaylistServerStrategy extends interfaces.ServerLoadStrategy {
  constructor(config) {
    super();
    this.config = config;
    
    // YouTube data api v3
    this.api = null;
  }
  init() {
    // Get an authenticated API. When init's promise is resolved, we succeeded.
    const googleapis = serverRequire('server/util/googleapis');
    return googleapis.getAuthenticatedClient().then((client) => {
      debug('Initialized YouTube Client.');
      this.config.credentials = client.credentials;
      this.api = client.googleapis.youtube('v3');
    }, (e) => {
      throw new Error('Error initializing YouTube Client', e);
    });
  }
  loadMoreContent(opt_paginationToken) {
    return new Promise((resolve, reject) => 
      this.api.playlistItems.list({
        playlistId: this.config.playlistId,
        pageToken: opt_paginationToken,
        maxResults: 50,
        part: 'snippet'
      }, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      })
    ).then((response) => {
      debug('Downloaded ' + response.items.length + ' more content ids.');
      return {
        content: response.items.map((item, index) => {
          return {
            videoId: item.snippet.resourceId.videoId,
            index: index
          };
        }),
        hasMoreContent: !!response.nextPageToken,
        paginationToken: response.nextPageToken
      };
    }, (error) => {
      debug('Failed to download more youtube content! Delay a bit...');
      return Promise.delay(Math.random() * 4000 + 1000).then(() => this.loadMoreContent(opt_paginationToken));
    });
  }
  serializeForClient() {
    return {youtube: this.config};
  }
}

class LoadYouTubePlaylistClientStrategy extends interfaces.ClientLoadStrategy {
  constructor(config) {
    super();
    this.config = config;

    const loadYoutubeApi = require('client/util/load_youtube_api');
    debug('Loading YouTube API');
    this.apiLoaded = loadYoutubeApi().then(() => {
      debug('YouTube API ready');
    });
  }
  init(surface) {
    this.surface = surface;
  }
  loadContent(content) {
    return this.apiLoaded.then(() => {
      debug('Loading video ' + content.videoId);
      let container = document.createElement('div');
      let player = new YT.Player(container, {
        width: this.surface.container.offsetWidth,
        height: this.surface.container.offsetHeight,
        videoId: content.videoId,
        playerVars: {
          listType: this.config.playThroughPlaylist ? 'playlist' : undefined,
          list: this.config.playThroughPlaylist ? this.config.playlistId : undefined,
          iv_load_policy: 3,  // Disable annotations.
          controls: 0,
          showinfo: 0,
          loop: 1,
          start: this.config.seekTo,
          autoplay: true,
        },
        events: {
          onReady: () => {
            player.setPlaybackQuality('hd1080');
            player.mute();
          },
          onError: (e) => {
            reject(e)
          },
          onStateChange: (e) => {
            debug('state', e.data);
            if (!this.config.playThroughPlaylist && e.data == YT.PlayerState.ENDED) {
              // Restart the video. The loop=1 parameter should cause this to 
              // happen automatically when playing a single video, but it 
              // doesn't work!
              player.seekTo(0);
            }
          }
        },
      });
      return player.getIframe();
    });
  }
}

module.exports = {
  Server: LoadYouTubePlaylistServerStrategy,
  Client: LoadYouTubePlaylistClientStrategy
};
