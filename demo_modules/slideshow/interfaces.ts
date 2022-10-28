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
import { DriveConfig } from "./load_from_drive_server.ts";

export interface ClientInfo {
  virtualOffset: Point;
  virtualRect: Rectangle;
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
  draw?: (time: number, delta: number) => void;
}

export interface ContentPage {
  paginationToken?: string;
  contentIds: string[];
}

export interface ContentBag {
  contentIds: string[];
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
  /**
   * If true, the assets are pre-split, meaning that they are already tiled for the screens
   * in the wall and named according to a specific format. For video files, the screens' playback
   * will be sync'd.
   */
  presplit?: boolean;
  /** Options related to video files. */
  video?: {
    /** If true, video files should start at a random timestamp. */
    randomize_start?: boolean;
    /**
     * If true, keeps the video looping.
     * Otherwise, changes to the next video.
     */
    loop?: boolean;
  };
}

export interface YouTubeLoadConfig {
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
}

declare global {
  interface EmittedEvents {
    "slideshow:init_res": (config: SlideshowConfig) => void;
    "slideshow:init": () => void;
    "slideshow:content_ended": (contentId: string) => void;

    "slideshow:fullscreen:content_req": () => void;
    "slideshow:fullscreen:content": (chosenId: string) => void;
  }
}
