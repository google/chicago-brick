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
  PlaylistItemsListOptions,
  VideoListResponse,
  VideosListOptions,
  YouTube,
} from "https://googleapis.deno.dev/v1/youtube:v3.ts";
import * as credentials from "../../server/util/credentials.ts";
import { easyLog } from "../../lib/log.ts";
import { GoogleAuth } from "./authenticate_google_api.ts";

const log = easyLog("slideshow:youtube");

async function fetchYoutubePlaylistItemsList(
  params: PlaylistItemsListOptions,
  headers: Headers,
): Promise<PlaylistItemListResponse> {
  const url = new URL("https://youtube.googleapis.com/v3/playlistItems");
  if (params.id) {
    url.searchParams.set("id", params.id);
  }
  if (params.maxResults) {
    url.searchParams.set("maxResults", String(params.maxResults));
  }
  if (params.pageToken) {
    url.searchParams.set("pageToken", params.pageToken);
  }
  if (params.part) {
    url.searchParams.set("part", params.part);
  }
  if (params.playlistId) {
    url.searchParams.set("playlistId", params.playlistId);
  }

  const key = headers.get("X-goog-api-key");
  if (key) {
    headers.delete("X-goog-api-key");
    url.searchParams.set("key", key);
  }

  console.log(url);

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Bad YT response: ${res.statusText}`);
  }
  return await res.json();
}

async function fetchYoutubeVideosList(
  params: VideosListOptions,
  headers: Headers,
): Promise<VideoListResponse> {
  const url = new URL("https://youtube.googleapis.com/v3/videos");
  if (params.id) {
    url.searchParams.set("id", params.id);
  }
  if (params.maxResults) {
    url.searchParams.set("maxResults", String(params.maxResults));
  }
  if (params.pageToken) {
    url.searchParams.set("pageToken", params.pageToken);
  }
  if (params.part) {
    url.searchParams.set("part", params.part);
  }

  const key = headers.get("X-goog-api-key");
  if (key) {
    headers.delete("X-goog-api-key");
    url.searchParams.set("key", key);
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Bad YT response: ${res.statusText}`);
  }
  return await res.json();
}

class VideoIdGenerator {
  readonly loadVideoIds: ReadableStream<string[]>;
  readonly loadVideos: TransformStream<string[], ContentId[]>;
  constructor(readonly config: YouTubeLoadConfig, youtube: YouTube) {
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
                  `Loaded ${result.items} YT videos from playlist ${playlistId}`,
                );
                controller.enqueue(result.items.map((item) => {
                  return item.contentDetails!.videoId!;
                }));
              }
              pageToken = result.nextPageToken;
            } while (pageToken);
          }
        }
        log("Done loading YT videos");
        controller.close();
      },
    });
    this.loadVideos = new TransformStream({
      async transform(chunk, controller) {
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
      },
    });
  }
}

export class LoadYouTubeServerStrategy implements ServerLoadStrategy {
  nextPlaylistToLoad = 0;
  readonly youtube: YouTube;
  videoIdGenerator?: VideoIdGenerator;
  readonly loadedContentIds: ContentId[] = [];
  contentIdReader?: ReadableStreamReader<ContentId[]>;
  client: GoogleAuth;
  constructor(readonly config: YouTubeLoadConfig) {
    if (!config.creds) {
      throw new Error("YouTube loading strategy requires credentials");
    }
    const creds = credentials.get(config.creds) as any;
    if (!creds) {
      throw new Error("Unable to load youtube creds!");
    }
    this.client = new GoogleAuth(creds);
    this.client.setScopes([
      "https://www.googleapis.com/auth/youtube.readonly",
    ]);
    this.youtube = new YouTube(this.client);
  }
  getBytes(): Promise<Uint8Array> {
    throw new Error("Method not implemented.");
  }

  async loadMoreContent(): Promise<ContentPage> {
    if (!this.videoIdGenerator) {
      this.videoIdGenerator = new VideoIdGenerator(this.config, this.youtube);
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