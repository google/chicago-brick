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

function readClientRectFromLocation(): Rectangle {
  const config = new URL(window.location.href).searchParams.get("config") ||
    "0,0,1920,1080";
  return Rectangle.deserialize(config)!;
}

const rect = readClientRectFromLocation();
export const virtualRect = rect;
// TODO: Figure out how to implement bezel properly.
export const virtualRectNoBezel = rect;
export const virtualOffset = {
  x: rect.x / rect.w,
  y: rect.y / rect.h,
};
