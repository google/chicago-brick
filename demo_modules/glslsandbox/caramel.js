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

class CaramelServer extends ModuleInterface.Server {}

class CaramelClient extends ModuleInterface.Client {
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
precision lowp float;
uniform vec2 resolution;
uniform float time;
uniform vec2 iOffset;

float r=time/3.,i,ii;
float e(vec3 c)
{
  c = cos(vec3(cos(c.r+r/6.)*c.r-cos(c.g+r/5.)*c.g,c.b/3.*c.r-cos(r/7.)*c.g,c.r+c.g+c. b+r));
  return dot(c*c,vec3(1.))-1.0;
}
void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
  vec2 c=-1.+2.0*fragCoord.rg/resolution.xy;
  vec3 o = vec3(0.0);
  vec3 g = vec3(c.r,c.g,1)/64.;
  vec4 v = vec4(0.0);
	//the only good variable is an initialized variable :facepalm:
  for(float i=1.;i<2666.;i+=1.0)
    {
      vec3 vct = o+g*i;
      float scn = e(vct);
      if(scn<.4)
        {
          vec3 r=vec3(.15,0.,0.),c=r;
          c.r=scn-e(vec3(vct+r.rgg));
          c.g=scn-e(vec3(vct+r.grg));
          c.b=scn-e(vec3(vct+r.ggr));
          v+=dot(vec3(0.,0.,-1.0),c)+dot(vec3(0.0,-0.5,0.5),c);
          break;
        }
        ii=i;
    }
  fragColor=v+vec4(.1+cos(r/14.)/9.,0.1,.1-cos(r/3.)/19.,1.)*(ii/44.);
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

register(CaramelServer, CaramelClient);

