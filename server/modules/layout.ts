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

import { LayoutConfig } from "../playlist/playlist.ts";

/**
 * Defines the wall layout: what modules to run, for how long, etc.
 */
export class Layout {
  /** The list of module names to play. */
  readonly modules: string[];
  /** How long to run the entire layout. */
  readonly duration: number;
  /** How long to run individual modules, if there is more than one module. */
  readonly moduleDuration: number;

  constructor(config: LayoutConfig) {
    this.modules = config.modules || [];
    // TODO(applmak): What is this even doing?
    this.duration = config.duration || config.moduleDuration;
    this.moduleDuration = config.moduleDuration || config.duration;
  }
}
