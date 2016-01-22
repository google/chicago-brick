/* Copyright 2015 Google Inc. All Rights Reserved.

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
  var Surface = require('client/surface/surface');

  var CanvasSurface = function(container, wallGeometry) {
    Surface.call(this, container, wallGeometry);
    
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.left = 0;
    this.canvas.style.right = 0;
    this.canvas.style.top = 0;
    this.canvas.style.bottom = 0;
    this.canvas.style.padding = 0;
    this.canvas.style.margin = 0;

    this.canvas.setAttribute('width', this.virtualRect.w);
    this.canvas.setAttribute('height', this.virtualRect.h);
    
    container.appendChild(this.canvas);
    
    this.context = this.canvas.getContext('2d');
    
  };
  CanvasSurface.prototype = Object.create(Surface.prototype);

  CanvasSurface.prototype.destroy = function() {
    this.canvas.remove();
    this.canvas = null;
  };

  CanvasSurface.prototype.pushOffset = function() {
    this.context.save();
    this.applyOffset();
  };
  
  CanvasSurface.prototype.applyOffset = function() {
    this.context.translate(-this.virtualRect.x, -this.virtualRect.y);
  };

  CanvasSurface.prototype.popOffset = function() { this.context.restore(); };

  CanvasSurface.prototype.setOpacity = function(alpha) {
    this.canvas.style.opacity = alpha;
  };

  return CanvasSurface;
});
