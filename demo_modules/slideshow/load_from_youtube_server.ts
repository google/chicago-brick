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

import { ContentId, ContentPage, YouTubeLoadConfig } from "./interfaces.ts";
import { ServerLoadStrategy } from "./server_interfaces.ts";
import {
  PlaylistItemListResponse,
  YouTube,
} from "https://googleapis.deno.dev/v1/youtube:v3.ts";
import * as credentials from "../../server/util/credentials.ts";
import { easyLog } from "../../lib/log.ts";
import { GoogleAuth } from "../../server/util/authenticate_google_api.ts";
import { JWTInput } from "https://googleapis.deno.dev/_/base@v1/auth/jwt.ts";

const log = easyLog("slideshow:youtube");

class VideoIdGenerator {
  readonly loadVideoIds: ReadableStream<string[]>;
  readonly loadVideos: TransformStream<string[], ContentId[]>;
  constructor(
    readonly config: YouTubeLoadConfig,
    youtube: YouTube,
    readonly abortSignal: AbortSignal,
  ) {
    this.loadVideoIds = new ReadableStream({
      async start(controller) {
        if (config.videos) {
          log(`Loaded ${config.videos.length} YT videos`);
          controller.enqueue(config.videos);
        }
        if (config.playlists) {
          for (const playlistId of config.playlists) {
            let pageToken;
            do {
              const result: PlaylistItemListResponse = await youtube
                .playlistItemsList({
                  playlistId,
                  part: "contentDetails",
                  maxResults: 50,
                  pageToken,
                });
              if (result.items) {
                log(
                  `Loaded ${result.items.length} YT videos from playlist ${playlistId}`,
                );
                controller.enqueue(result.items.map((item) => {
                  return item.contentDetails!.videoId!;
                }));
              }
              pageToken = result.nextPageToken;
            } while (pageToken && !abortSignal.aborted);
          }
        }
        log("Done loading YT videos");
        controller.close();
      },
    });
    this.loadVideos = new TransformStream({
      async transform(chunk, controller) {
        try {
          const videos = await youtube.videosList({
            id: chunk.join(","),
            part: "fileDetails",
          });
          if (!videos.items) {
            return;
          }
          log(`Loaded data about ${videos.items.length}`);
          controller.enqueue(videos.items.map((video) => {
            return {
              id: video.id!,
              width: video.fileDetails?.videoStreams![0].widthPixels,
              height: video.fileDetails?.videoStreams![0].heightPixels,
            };
          }));
        } catch {
          // Can't load the video details.
          controller.enqueue(chunk.map((i) => {
            return { id: i };
          }));
        }
      },
    });
  }
}

export class LoadYouTubeServerStrategy implements ServerLoadStrategy {
  nextPlaylistToLoad = 0;
  readonly youtube: YouTube;
  readonly videoIdGenerator: VideoIdGenerator;
  readonly loadedContentIds: ContentId[] = [];
  contentIdReader?: ReadableStreamReader<ContentId[]>;
  client: GoogleAuth;
  constructor(
    readonly config: YouTubeLoadConfig,
    readonly abortSignal: AbortSignal,
  ) {
    const credsKey = config.creds || "googleserviceaccountkey";
    const creds = credentials.get(credsKey) as JWTInput;
    if (!creds) {
      throw new Error(`Unable to load youtube creds: ${credsKey}`);
    }
    this.client = new GoogleAuth(creds);
    this.client.setScopes([
      "https://www.googleapis.com/auth/youtube.readonly",
    ]);
    this.youtube = new YouTube(this.client);
    this.videoIdGenerator = new VideoIdGenerator(
      this.config,
      this.youtube,
      this.abortSignal,
    );
  }
  getBytes(): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }

  async loadMoreContent(): Promise<ContentPage> {
    if (!this.contentIdReader) {
      const contentIds = this.videoIdGenerator.loadVideoIds.pipeThrough(
        this.videoIdGenerator.loadVideos,
      );
      this.contentIdReader = contentIds.getReader();
    }

    const { done, value } = await this.contentIdReader!.read();
    if (done) {
      return { contentIds: [] };
    }
    return { contentIds: value, paginationToken: "please keep going" };
  }
}
