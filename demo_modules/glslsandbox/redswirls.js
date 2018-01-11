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

const register = require('register');
const ModuleInterface = require('lib/module_interface');
const wallGeometry = require('wallGeometry');

class RedSwirlServer extends ModuleInterface.Server {}

class RedSwirlClient extends ModuleInterface.Client {
  constructor(config) {
    super();
  }

  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
  }
  
  willBeShownSoon(container, deadline) {
    const GlslSandboxSurface = require('client/surface/glslsandbox_surface');
    
    /*
1. add this line

uniform vec2 iOffset;

2. replace "void main() {" with

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {

3. find and replace "gl_FragCoord" with "fragCoord"

4. find and replace "gl_FragColor" with "fragColor"

5. add these lines to the end:

void main() {
  vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage( color, gl_FragCoord.xy + iOffset.xy);
  color.w = 1.0;
  gl_FragColor = color;
}
    */

    this.surface = new GlslSandboxSurface(container, wallGeometry, `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec2      resolution;
uniform vec2      mouse; // unused
uniform float     time;
uniform vec2 iOffset;



float rand(vec2 n) {
	return fract(cos(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 n) {
	const vec2 d = vec2(0.0, 1.0);
	vec2 b = floor(n), f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
	return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);
}

float fbm(vec2 n) {
	float total = 0.0, amplitude = 1.0;
	for (int i = 0; i < 5; i++) {
		total += (noise(n) * sqrt(amplitude));
		n += n;
		amplitude *= atan(0.345);
	}
	return total;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
	const vec3 c1 = vec3(27.0/255.0, 153.0/255.0, 139.0/255.0);
	const vec3 c2 = vec3(244.0/255.0, 96.0/255.0, 54.4/255.0);
	const vec3 c3 = vec3(1.0, 0.4, 0.0);
	const vec3 c4 = vec3(45.0/255.0, 46.0/255.0, 18.4/255.0);
	
	
	float pace = time * 2.0;
		
	vec2 p = abs(fragCoord.xy) * 8.0 / (resolution.xx);
	float q =abs(exp2(fbm(p + pace * 0.03)));
	vec2 r = abs(vec2(fbm(p + q + pace * 0.1 - p.x - p.y), fbm(p + q - pace * 0.3)));
	vec3 c = mix(c1, c2, fbm(p + r)) + mix(c3, c4, r.x);  
	fragColor = abs(vec4((c ), 1.0));
	fragColor.w = 0.5;
}

// -----------------------------------------------

void main() {
  vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage( color, gl_FragCoord.xy + iOffset.xy);
  color.w = 1.0;
  gl_FragColor = color;
}
    `);
    return Promise.resolve();
  }
  
  draw(time, delta) {
    this.surface.draw(time, delta);
  }
}

register(RedSwirlServer, RedSwirlClient);

