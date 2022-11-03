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

import { Rectangle } from "../../lib/math/rectangle.ts";
import { Point } from "../../lib/math/vector2d.ts";

export interface ClientInfo {
  virtualOffset: Point;
  virtualRect: Rectangle;
}

export interface ContentId {
  /** If known, the width of the content when loaded. */
  readonly width?: number;
  /** If known, the height of the content when loaded. */
  readonly height?: number;
  /** A unique identifier for this content. */
  id: string;
}

export interface Content {
  /** The type of the content. */
  readonly type: "video" | "image";
  /** Returns the width of the content. */
  readonly width: number;
  /** Returns the height of the content. */
  readonly height: number;
  /** The 'size' of the content, in terms of bytes. */
  readonly size: number;
  /** Some Element that refers to the content itself. */
  element: HTMLElement;
  /** Some pieces of content have a draw function. */
  draw?: (startTime: number, time: number, delta: number) => void;
}

export interface ContentPage {
  paginationToken?: string;
  contentIds: ContentId[];
}

export interface ContentBag {
  contentIds: ContentId[];
}

export interface SlideshowConfig {
  load: LoadConfig;
  display: DisplayConfig;
}

export interface LoadConfig {
  drive?: DriveConfig;
  youtube?: YouTubeLoadConfig;
  local?: LocalLoadConfig;
  flickr?: FlickrLoadConfig;
}

export interface DisplayConfig {
  fullscreen?: FullscreenDisplayConfig;
}

export interface LocalLoadConfig {
  /** A list of local files (relative to the asset directory). */
  files?: string[];
  /** A list of local directories (relative to the asset directory). */
  directories?: string[];
  /** Options related to video files. */
  video?: {
    /** If true, video files should start at a random timestamp. */
    randomize_start?: boolean;
    /**
     * If true, keeps the video looping.
     * Otherwise, changes to the next video.
     */
    loop?: boolean;
    /** If true, sync multiple files across the wall. */
    sync?: boolean;
    /** If true, show some debugging information about the synced videos. */
    syncDebug?: boolean;
  };
}

export interface DriveConfig {
  /** The name of the credential file in the credentials dir. */
  creds: string;
  /** The ids of the Google Drive folders that contains the content. */
  folderIds?: string[];
  /** The ids of the Google Drive files that are the content. */
  fileIds?: string[];
  /** If true, if the module should automatically split the content to fix the screens. */
  split?: boolean;
}

export interface YouTubeLoadConfig {
  /** The credentials file. */
  creds: string;
  /** A list of YouTube video ids. */
  videos?: string[];
  /** A list of YouTube playlists that each contain videos. */
  playlists?: string[];
  /** If true, randomizes the order of the videos. */
  shuffle?: boolean;
}

export interface FlickrLoadConfig {
  /** The query to search for. */
  query: string;
}

export interface FullscreenDisplayConfig {
  /**
   * Number of milliseconds until the display should change the visible asset.
   * If not set or 0, the initial content is not refreshed.
   */
  period?: number;
  /**
   * Specifies the behavior when the content does not fit the screen:
   * - stretch: Scales the content to completely fill the screen and no further.
   * - full: Scales the content uniformly to completely fill the screen.
   * - fit: Scales the content uniformly to the edges of the screen.
   */
  scale?: "stretch" | "full" | "fit";
  /**
   * When true, the files have already been stored in a specific format (rNcN.ext).
   * These numbers should be used when assigning content to different screens on the wall.
   * If a screen has position 0,1, we should send the content with the name r1c0.ext.
   * When this is true, the wall chooses content among the paths with the last path part stripped.
   * If multiple content, all pre-split is specified, these will be rendered correctly.
   * However, it's not possible to mix pre-split and not-presplit content yet.
   */
  presplit?: boolean;
  /**
   * When true, chooses the next content to display randomly. Otherwise, chooses the next sequentially.
   */
  shuffle?: boolean;
}

declare global {
  interface EmittedEvents {
    "slideshow:init_res": (config: SlideshowConfig) => void;
    "slideshow:init": () => void;
    "slideshow:content_ended": (contentId: ContentId, offset: Point) => void;

    "slideshow:fullscreen:content_req": (virtualOffset: Point) => void;
    "slideshow:fullscreen:content": (
      chosenId: ContentId,
      deadline: number,
    ) => void;

    "slideshow:drive:init": () => void;
    "slideshow:drive:credentials": (headers: Record<string, string>) => void;
  }
}
