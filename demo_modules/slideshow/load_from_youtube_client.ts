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

/// <reference types="https://esm.sh/v96/@types/youtube@0.0.47/index.d.ts" />

import { easyLog } from "../../lib/log.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import { ClientLoadStrategy, Content } from "./client_interfaces.ts";
import { ContentId } from "./interfaces.ts";

const log = easyLog("slideshow:youtube");

// LOAD YOUTUBE PLAYLIST STRATEGY
// Config:
//   playlistId: string - Playlist ID that contains the videos we should show.
//   seekTo: number - Number of seconds into which we should start playing the
//                    video. This doesn't affect looping behavior.
//   playThroughPlaylist: boolean - If true, don't just loop a single video, but
//                        rather, continue playing the next video in the
//                        playlist.
//   sync: boolean - If true, keep the videos sync'd across their displays.

type RealWindow = typeof globalThis;

interface YTIFrameAPI extends RealWindow {
  YT: typeof YT;
  onYouTubeIframeAPIReady?(): void;
}

function getYTAPI(): Promise<void> {
  return new Promise<void>((resolve) => {
    const ytwindow = globalThis as YTIFrameAPI;
    if (ytwindow.YT) {
      resolve();
      return;
    }

    ytwindow.onYouTubeIframeAPIReady = () => {
      resolve();
    };
    const el = document.createElement("script");
    el.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode!.insertBefore(el, firstScriptTag);
  });
}

export class LoadYouTubeClientStrategy implements ClientLoadStrategy {
  apiLoaded: Promise<void>;

  constructor() {
    this.apiLoaded = getYTAPI();
  }
  async loadContent(
    contentId: ContentId,
    virtualRect: Rectangle,
  ): Promise<Content> {
    await this.apiLoaded;
    log(`Loading video: ${contentId}`);
    const container = document.createElement("div");
    const player = new YT.Player(container, {
      videoId: contentId.id,
      width: virtualRect.w,
      height: virtualRect.h,
      playerVars: {
        iv_load_policy: YT.IvLoadPolicy.Hide, // Disable annotations.
        controls: YT.Controls.Hide,
        showinfo: YT.ShowInfo.Hide,
        autoplay: YT.AutoPlay.AutoPlay,
      },
      events: {
        onReady: () => {
          player.setPlaybackQuality("hd1080");
          player.mute();
        },
        onError: (e) => {
          log.error(e);
        },
      },
    });

    const video = player.getIframe();

    return {
      width: contentId.width!,
      height: contentId.height!,
      element: video,
      size: contentId.width! * contentId.height!,
      type: "video",
    };
  }
}
