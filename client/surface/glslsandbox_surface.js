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
  var Surface = require('client/surface/surface');

  var GlslSandboxSurface = function(container, wallGeometry, fragCode) {
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
    
    this.gl = this.canvas.getContext('webgl');

    this.vertCode = `
attribute vec3 coordinates;

void main(void) {
  gl_Position = vec4(coordinates, 1.0);
}
    `;

    const gl = this.gl;
     
    var vertices = [
      -1.0,1.0,0.0,
      -1.0,-1.0,0.0,
      1.0,-1.0,0.0,
      1.0,1.0,0.0 
    ];

    let indices = [3,2,1,3,1,0];

    // Create an empty buffer object to store vertex buffer
    var vertex_buffer = gl.createBuffer();

    // Bind appropriate array buffer to it
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);

    // Pass the vertex data to the buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    // Unbind the buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Create an empty buffer object to store Index buffer
    var Index_Buffer = gl.createBuffer();

    // Bind appropriate array buffer to it
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, Index_Buffer);

    // Pass the vertex data to the buffer
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    // Unbind the buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    /*====================== Shaders =======================*/

    // Create a vertex shader object
    var vertShader = gl.createShader(gl.VERTEX_SHADER);

    // Attach vertex shader source code
    gl.shaderSource(vertShader, this.vertCode);

    // Compile the vertex shader
    gl.compileShader(vertShader);

    // Create fragment shader object 
    var fragShader = gl.createShader(gl.FRAGMENT_SHADER);

    // Attach fragment shader source code
    gl.shaderSource(fragShader, fragCode);

    // Compile the fragmentt shader
    gl.compileShader(fragShader);
    
    if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
      console.log(gl.getShaderInfoLog(fragShader));
    }    

    // Create a shader program object to
    // store the combined shader program
    var shaderProgram = gl.createProgram();

    // Attach a vertex shader
    gl.attachShader(shaderProgram, vertShader);

    // Attach a fragment shader
    gl.attachShader(shaderProgram, fragShader);

    // Link both the programs
    gl.linkProgram(shaderProgram);

    // Use the combined shader program object
    gl.useProgram(shaderProgram);

    /* ======= Associating shaders to buffer objects =======*/

    // Bind vertex buffer object
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);

    // Bind index buffer object
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, Index_Buffer); 

    // Get the attribute location
    var coord = gl.getAttribLocation(shaderProgram, "coordinates");

    // Point an attribute to the currently bound VBO
    gl.vertexAttribPointer(coord, 3, gl.FLOAT, false, 0, 0);

    // Enable the attribute
    gl.enableVertexAttribArray(coord);
    
    this.indices = indices;
    this.shaderProgram = shaderProgram;
    const iResolution = gl.getUniformLocation(shaderProgram,  "resolution");
    gl.uniform2f(iResolution, this.wallRect.w, this.wallRect.h);

    const iMouse = gl.getUniformLocation(shaderProgram,  "mouse");
    gl.uniform2f(iMouse, this.wallRect.w / 2.0, this.wallRect.h / 2.0);
    
    const iOffset = gl.getUniformLocation(shaderProgram,  "iOffset");
    gl.uniform2f(iOffset, this.virtualRect.x, -this.virtualRect.y);
  };
  
  GlslSandboxSurface.prototype = Object.create(Surface.prototype);

  GlslSandboxSurface.prototype.destroy = function() {
    this.canvas.remove();
    this.canvas = null;
  };

  GlslSandboxSurface.prototype.draw = function(time, delta) {
    if (!this.gl) return;
    
    const gl = this.gl;
    const canvas = this.canvas;
    const shaderProgram = this.shaderProgram;
    
    const iTime = gl.getUniformLocation(shaderProgram, "time");
    gl.uniform1f(iTime, time/1000.0);
    
    // Clear the canvas
    gl.clearColor(0.5, 0.5, 0.5, 0.9);

    // Enable the depth test
    gl.enable(gl.DEPTH_TEST);

    // Clear the color buffer bit
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Set the view port
    gl.viewport(0,0,canvas.width,canvas.height);

    // Draw the triangle
    gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT,0);    
  };
  
  return GlslSandboxSurface;
});
