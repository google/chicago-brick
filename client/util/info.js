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

define(function(require) {
  'use strict';
  const Rectangle = require('lib/rectangle');
  
  function readClientRectFromLocation() {
    const config = new URL(window.location.href).searchParams.get('config') || '0,0,1920,1080';
    return Rectangle.deserialize(config);
  }
  
  const ret = {};
  ret.virtualRectNoBezel = readClientRectFromLocation();
  ret.virtualOffset = {
    x: ret.virtualRectNoBezel.x / ret.virtualRectNoBezel.w,
    y: ret.virtualRectNoBezel.y / ret.virtualRectNoBezel.h,
  };

  // Bezel!
  ret.hbezel = parseInt(new URL(window.location.href).searchParams.get('hbezel') || '0');
  ret.vbezel = parseInt(new URL(window.location.href).searchParams.get('vbezel') || '0');
  ret.virtualRect = new Rectangle(
      ret.virtualRectNoBezel.x + ret.hbezel,
      ret.virtualRectNoBezel.y + ret.vbezel,
      ret.virtualRectNoBezel.w - 2 * ret.hbezel,
      ret.virtualRectNoBezel.h - 2 * ret.vbezel);
  return ret;
});
