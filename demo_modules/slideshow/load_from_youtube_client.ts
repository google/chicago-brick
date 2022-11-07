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
import { ContentId, YouTubeLoadConfig } from "./interfaces.ts";
import { DrawFn, setUpVideo } from "./video_content_utils.ts";

const log = easyLog("slideshow:youtube");

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

  constructor(readonly config: YouTubeLoadConfig) {
    this.apiLoaded = getYTAPI();
  }
  async loadContent(
    contentId: ContentId,
    virtualRect: Rectangle,
  ): Promise<Content> {
    await this.apiLoaded;
    log(`Loading video: ${contentId.id}`);
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

    let drawFn: DrawFn | undefined = undefined;
    if (this.config.video) {
      drawFn = setUpVideo(
        this.config.video,
        () => {
          return player.getDuration() * 1000;
        },
        () => {
          return player.getCurrentTime() * 1000.0;
        },
        (time: number) => {
          return player.seekTo(time / 1000.0, true);
        },
        (newRate: number) => {
          const rate = player.getPlaybackRate();
          if (rate !== newRate) {
            log(`Adjusting YT playback rate to ${newRate}`);
            player.setPlaybackRate(newRate);
          }
        },
        () => {},
        log,
      );
    }

    return {
      width: contentId.width!,
      height: contentId.height!,
      element: video,
      size: contentId.width! * contentId.height!,
      type: "video",
      draw: drawFn,
    };
  }
}
