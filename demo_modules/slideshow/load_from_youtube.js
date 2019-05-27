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

'use strict';
const debug = require('debug');
const serverRequire = require('lib/server_require');

const interfaces = require('./interfaces');

// LOAD YOUTUBE PLAYLIST STRATEGY
// Config:
//   playlistId: string - Playlist ID that contains the videos we should show.
//   seekTo: number - Number of seconds into which we should start playing the
//                    video. This doesn't affect looping behavior.
//   playThroughPlaylist: boolean - If true, don't just loop a single video, but
//                        rather, continue playing the next video in the
//                        playlist.
//   sync: boolean - If true, keep the videos sync'd across their displays.

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
      debug('Downloaded ' + response.data.items.length + ' more content ids.');
      return {
        content: response.data.items.map((item, index) => {
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
  init(surface, startTime) {
    this.surface = surface;
    this.startTime = startTime;
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

      let video = player.getIframe();
      if (this.config.sync) {
        video.draw = (time, delta) => {
          // When restarting a server, time can wind backwards. If we ever see
          // this case, just flip out.
          if (delta <= 0 || !player.getDuration) {
            return;
          }

          let duration = player.getDuration() * 1000.0;

          // We want the videos to be sync'd to some ideal clock. We use the
          // server's clock, as guessed by the client.
          let correctTime = ((time - this.startTime) % duration + duration) % duration;

          // The video is currently here:
          let actualTime = player.getCurrentTime() * 1000.0;

          // If these times are off by a lot, we should seek to the right time.
          // We can't always seek, because the HTML5 video spec doesn't specify
          // the granuality of seeking, and browsers round by as much as 250ms
          // in practice!
          if (Math.abs(actualTime - correctTime) > 3000) {
            video.lastSeekTime = video.lastSeekTime || time;
            // Don't seek too often! YouTube doesn't like that!
            if (time - video.lastSeekTime > 3000) {
              debug('seek', actualTime, correctTime);
              player.seekTo(correctTime / 1000.0, true);
              video.lastSeekTime = time;
            }
          } else {
            // The time difference is too small to rely on seeking, so let's
            // adjust the playback speed of the video in order to gradually
            // sync the videos.
            let msOff = correctTime - actualTime;

            let rate = msOff >= 33 ? 2.0 : msOff <= -33 ? 0.5 : 1.0;
            player.setPlaybackRate(rate);
          }
        };
      }

      return video;
    });
  }
}

module.exports = {
  Server: LoadYouTubePlaylistServerStrategy,
  Client: LoadYouTubePlaylistClientStrategy
};
