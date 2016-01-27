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

// TODO(applmak): Take care of this lint error for real.
/*jshint loopfunc: true */
var Rectangle = require('lib/rectangle');
var _ = require('underscore');
var THREE = require('three');
var NeighborPersistence = require('NeighborPersistence');
var Noise = require('noisejs');
var assert = require('assert');

var MAX_PARTICLES_PER_CLIENT = 100;

class ParticlesServer extends ServerModuleInterface {
  makeParticle(time) {
    var x = Math.random() * wallGeometry.extents.w;
    var y = Math.random() * wallGeometry.extents.h;
    var winteryColors = [
      {r: 254, g: 254, b: 254, a: 254},
      {r: 40, g: 150, b: 254, a: 254},
      {r: 0, g: 30, b: 127, a: 254},
      {r: 150, g: 254, b: 254, a: 254},
    ];
    var chosenColor = _.sample(winteryColors);
    var newParticle = {
      eventualColor: chosenColor,
      x: x,
      y: y,
      vx: 300 * (Math.random()-0.5),
      vy: 300 * (Math.random()-0.5),
      r: 254,
      g: 254,
      b: 254,
      a: 0,
      s: 15,
      t0: time,
      l: 20000
    };
    return newParticle;
  }
  tick(time, delta) {
    for (var c = 0; c < 10; ++c) {
      var newParticle = this.makeParticle(time);
      var r = Rectangle.centeredAt(newParticle.x, newParticle.y, 0, 0);
      network.getClientsInRect(r).forEach((client) => {
        client.socket.emit('newParticle', newParticle);
      });
    }
  }
}

function swap(arr, a, b) {
  var i = arr[a];
  arr[a] = arr[b];
  arr[b] = i;
}

function lerp(alpha, a, b) {
  return alpha * b + (1-alpha) * a;
}

function linear(x, x1, x2, y1, y2) {
  return x <= x1 ? y1 :
         x >= x2 ? y2 :
         lerp((x - x1)/(x2 - x1), y1, y2);
}


class ParticleEmitter {
  constructor() {
    // Big block of CPU-particle data. We need:
    // 2 floats for (x,y) position
    // 2 floats for (vx,vy) velocity
    // 1 uint32 for (r,g,b,a) color
    // 1 float for (s) scalar size.
    // 1 float for (t0) scalar start time
    // 1 float for (l) scalar lifetime
    // We choose to pack this for GPU-efficiency & reduced overhead from
    // the Buffer object:
    // 4 floats for (x,y,vx,vy) position/velocity
    // 4 floats for (rgba, s, t0, l)
    // We expect this to increase our vertex buffer throughput, as we'll use
    // fewer temporary registers (this is always the goal with particles). This
    // will, however, require us to manually encode our uint32 as a float, and
    // then back. Encoding into a float is surprisingly easy in JS, and
    // incredibly performant. However, the GPU case requires a big ol' copy
    // and paste from an authoritive source.
    var posVel = new Float32Array(MAX_PARTICLES_PER_CLIENT * 4);
    var misc = new Float32Array(MAX_PARTICLES_PER_CLIENT * 4);

    // While we are here, also allocate memory in the GPU for these.
    var posVelBuffer = new THREE.BufferAttribute(posVel, 4).setDynamic(true);
    var miscBuffer = new THREE.BufferAttribute(misc, 4).setDynamic(true);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setDrawRange(0, 0);
    this.geometry.addAttribute('posVel', posVelBuffer);
    this.geometry.addAttribute('misc', miscBuffer);
    
    // Store the THREE versions of those attribute buffers for later mutation.
    this.posVelBuffer_ = this.geometry.getAttribute('posVel');
    this.miscBuffer_ = this.geometry.getAttribute('misc');
    
    // Provide an aliased buffer over the misc buffer so we can address the
    // color field.
    this.color_ = new Uint8Array(this.miscBuffer_.array.buffer);
    
    // We don't always have a fixed number of active particles. We'll use an
    // index buffer to mention the particles we want to change.
    var indices = new Uint16Array(MAX_PARTICLES_PER_CLIENT);
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1).setDynamic(true));
    this.indexBuffer_ = this.geometry.getIndex();
    // We'll fill out the index buffer with our reset index -1, indicating that
    // we have no particle here just as of yet.
    for (var i = 0; i < MAX_PARTICLES_PER_CLIENT; ++i) {
      this.indexBuffer_.array[i] = -1;
    }
    
    // Because we want to avoid looking through the indexBuffer for particles
    // that are available, we'll track this via a pool of unused indices.
    // Initially, all particles are dead.
    this.deadParticles_ = Array.from({length: MAX_PARTICLES_PER_CLIENT}).map((_, index) => index);
    
    // We'll also track where each index is in the index buffer. Whew!
    this.indexIndexes_ = Array.from({length: MAX_PARTICLES_PER_CLIENT}).map((_) => -1);
  }
  
  // Adds a particle to the emitter. All initial values must be well-specified.
  // If there are no particles, returns -1. No data is flushed to the GPU.
  addParticle(x, y, vx, vy, r, g, b, a, s, t0, l) {
    if (this.deadParticles_.length === 0) {
      // Can't handle any more particles!
      return -1;
    }
    
    // What is the index of our new particle?
    var index = this.deadParticles_.pop();
    
    // Assign the values into the buffers:
    // Enable this particle in the index buffer. We calculate the next available
    // index by remembering that MAX_PARTICLES_PER_CLIENT = dead + live, and
    // solving for live (with the +1 due to the pop).
    this.indexIndexes_[index] = this.numLiveParticles() - 1;
    this.indexBuffer_.array[this.numLiveParticles() - 1] = index;
    // Add position and velocity. Stride is 4 here, because there are 4 floats.
    this.posVelBuffer_.array[4 * index + 0] = x;
    this.posVelBuffer_.array[4 * index + 1] = y;
    this.posVelBuffer_.array[4 * index + 2] = vx;
    this.posVelBuffer_.array[4 * index + 3] = vy;
    // Add color, size, start time, lifetime. Stride is 4 here, too.
    this.color_[4*(4 * index + 0) + 0] = a;
    this.color_[4*(4 * index + 0) + 1] = b;
    this.color_[4*(4 * index + 0) + 2] = g;
    this.color_[4*(4 * index + 0) + 3] = r;
  
    this.miscBuffer_.array[4 * index + 1] = s;
    this.miscBuffer_.array[4 * index + 2] = t0;
    this.miscBuffer_.array[4 * index + 3] = l;
    
    this.indexBuffer_.needsUpdate = true;
    this.posVelBuffer_.needsUpdate = true;
    this.miscBuffer_.needsUpdate = true;
    
    // Update the indices we will draw:
    this.geometry.setDrawRange(0, this.numLiveParticles());
    
    // All done!
    return index;
  }
  
  numLiveParticles() {
    return MAX_PARTICLES_PER_CLIENT - this.deadParticles_.length;
  }
  
  removeParticle(index) {
    var lastParticleIndex = this.numLiveParticles() - 1;
    
    // Add a hole in the index buffer, because this index is invalid.
    this.indexBuffer_.array[this.indexIndexes_[index]] = -1;
    // But also, don't leave it there!
    var swappedLiveParticleIndex = this.indexBuffer_.array[lastParticleIndex];
    swap(this.indexBuffer_.array, this.indexIndexes_[index], lastParticleIndex);
    // Update our reverse index map, too:
    this.indexIndexes_[swappedLiveParticleIndex] = this.indexIndexes_[index];
    this.indexIndexes_[index] = -1;
    
    this.deadParticles_.push(index);
    this.indexBuffer_.needsUpdate = true;

    this.geometry.setDrawRange(0, this.numLiveParticles());
  }
  
  updateParticle(cb, index, opt_obj) {
    var particle = opt_obj || {x:0, y:0, vx:0, vy:0, r:0, g:0, b:0, a:0, s:0, t0:0, l:0};
    
    // copy to object
    particle.x = this.posVelBuffer_.array[4 * index + 0];
    particle.y = this.posVelBuffer_.array[4 * index + 1];
    particle.vx = this.posVelBuffer_.array[4 * index + 2];
    particle.vy = this.posVelBuffer_.array[4 * index + 3];
    
    particle.a = this.color_[4*(4 * index + 0) + 0];
    particle.b = this.color_[4*(4 * index + 0) + 1];
    particle.g = this.color_[4*(4 * index + 0) + 2];
    particle.r = this.color_[4*(4 * index + 0) + 3];
    
    particle.s = this.miscBuffer_.array[4 * index + 1];
    particle.t0 = this.miscBuffer_.array[4 * index + 2];
    particle.l = this.miscBuffer_.array[4 * index + 3];
    
    cb(particle, index);
    
    // copy back to buffer.
    this.posVelBuffer_.array[4 * index + 0] = particle.x;
    this.posVelBuffer_.array[4 * index + 1] = particle.y;
    this.posVelBuffer_.array[4 * index + 2] = particle.vx;
    this.posVelBuffer_.array[4 * index + 3] = particle.vy;
    
    this.color_[4*(4 * index + 0) + 0] = Math.floor(particle.a);
    this.color_[4*(4 * index + 0) + 1] = Math.floor(particle.b);
    this.color_[4*(4 * index + 0) + 2] = Math.floor(particle.g);
    this.color_[4*(4 * index + 0) + 3] = Math.floor(particle.r);

    this.miscBuffer_.array[4 * index + 1] = particle.s;
    this.miscBuffer_.array[4 * index + 2] = particle.t0;
    this.miscBuffer_.array[4 * index + 3] = particle.l;
  }
  
  markBuffersDirty() {
    this.posVelBuffer_.needsUpdate = true;
    this.miscBuffer_.needsUpdate = true;
  }
  
  // Updates particle state by calling cb with decoded data for each particle.
  // Remove & add are safe to call during this method.
  updateParticles(cb) {
    var N = this.numLiveParticles();
    var particle = {
      x:0, y:0, vx:0, vy:0, r:0, g:0, b:0, a:0, s:0, t0:0, l:0
    };
    for (var i = 0; i < N; ++i) {
      var index = this.indexBuffer_.array[i];
      this.updateParticle(cb, index, particle);
    }
    
    this.markBuffersDirty();
  }
  // Expensive sanity checks:
  sanityChecks() {
    // First, check that our reverse index map and index map agree.
    this.indexIndexes_.forEach((reverseIndex, index) => {
      if (reverseIndex !== -1) {
        assert(this.indexBuffer_.array[reverseIndex] === index,
            'Bad index found!', index, reverseIndex, this.indexBuffer_.array[reverseIndex]);
      }
    });
    
    // Next, check that each particle at every valid index has a + lifetime.
    for (var i = 0; i < this.numLiveParticles(); ++i) {
      var index = this.indexBuffer_.array[i];
      assert(this.miscBuffer_.array[4 * index + 3] > 0, 'Bad lifetime!');
    }
  }
}

class ParticlesClient extends ClientModuleInterface {
  willBeShownSoon(container, deadline) {
    this.noise = new Noise(deadline % 1);
    this.surface = new ThreeJsSurface(container, wallGeometry);
    this.debugCanvas = new CanvasSurface(container, wallGeometry);
    this.debugCanvas.canvas.addEventListener('click', (e) => {
      this.persistence_.addData({
        x: 100,
        y: this.surface.virtualRect.h/2,
        vx: 100,
        vy: 0,
        r: 254,
        g: 254,
        b: 254,
        a: 254,
        s: 10,
        t0: 0,
        l: 1000000
      });
    });
    this.debugCanvas.canvas.style.zIndex = '1000';
    this.peer_ = null;
    this.emitter = new ParticleEmitter();
    
    var mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      blending: THREE.AdditiveBlending,
      vertexShader: `
        precision highp float;
        #define FLOAT_MAX  1.70141184e38
        #define FLOAT_MIN  1.17549435e-38
        lowp vec4 decodeFloat(highp float v) {
          highp float av = abs(v);
          if (av < FLOAT_MIN) {
            return vec4(0.0, 0.0, 0.0, 0.0);
          } else if (v > FLOAT_MAX) {
            return vec4(127.0, 128.0, 0.0, 0.0) / 255.0;
          } else if (v < -FLOAT_MAX) {
            return vec4(255.0, 128.0, 0.0, 0.0) / 255.0;
          }
          highp vec4 c = vec4(0.0, 0.0, 0.0, 0.0);
          
          // Exponent & mantissa:
          highp float e = floor(log2(av));
          highp float m = av * pow(2.0, -e) - 1.0;
          
          // Unpack mantissa:
          c[1] = floor(128.0 * m);
          m -= c[1] / 128.0;
          c[2] = floor(32768.0 * m);
          m -= c[2] / 32768.0;
          c[3] = floor(8388608.0 * m);
          
          // Unpack exponent:
          highp float ebias = e + 127.0;
          c[0] = floor(ebias / 2.0);
          ebias -= c[0] * 2.0;
          c[1] += floor(ebias) * 128.0;
          
          // Unpack sign:
          c[0] += 128.0 * step(0.0, -v);
          
          // Scale to [0,1]:
          return c / 255.0;
        }
        
        attribute vec4 posVel;
        attribute vec4 misc;
        
        varying vec4 vColor;
        
        void main() {
          // We store color in x as a uint32_t
          vColor = decodeFloat(misc.x);
          // Point size is in y.
          gl_PointSize = misc.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(posVel.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying vec4 vColor;
        
        void main() {
          gl_FragColor = vColor;
        }
      `
    });
    
    this.points = new THREE.Points(this.emitter.geometry, mat);
    this.points.frustumCulled = false;
    this.surface.scene.add(this.points);

    this.surface.camera = new THREE.OrthographicCamera(
        this.surface.virtualRect.x, this.surface.virtualRect.x+this.surface.virtualRect.w,
        this.surface.virtualRect.y, this.surface.virtualRect.y+this.surface.virtualRect.h,
        -1, 1);
    this.surface.camera.updateProjectionMatrix();
    
    this.idToIndex_ = {};
    return peerNetwork.open(deadline).then((peer) => {
      debug('Connected to peer network.');
      this.peer_ = peer;
      this.persistence_ = new NeighborPersistence(this.surface.virtualRectNoBezel, peer);
      network.on('newParticle', (newParticle) => {
        // When the server sends us something, it's definitely relevant.
        this.persistence_.addData(newParticle);
      });
    });
  }
  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
    if (this.peer_) {
      this.peer_.close();
      this.peer_ = null;
    }
  }
  draw(time, delta) {
    if (delta < 0) {
      return;
    }
    this.persistence_.update((data) => {
      assert(!(data._id in this.idToIndex_), 'Id ' + data._id + ' already in index map!');
      // New data should be added to the emitter.
      var index = this.emitter.addParticle(
        data.x, data.y, data.vx, data.vy,
        data.r, data.g, data.b, data.a,
        data.s, data.t0, data.l
      );
      if (index == -1) {
        // Our emitter is full! Just drop this particle.
        debug('Emitter is full!', data._id);
        return false;
      }
      
      // Remember this data in our particle map.
      this.idToIndex_[data._id] = index;
      return true;
    }, (data) => {
      // Shared data
      assert(data._id in this.idToIndex_, 'Updating a shared particle ' + data._id + ' that isn\'t in the index map!');
      var index = this.idToIndex_[data._id];
      this.emitter.updateParticle((p) => {
        // In this case, we want to copy data to p. We copy _ fields, too, but
        // no big deal, the emitter ignores them.
        _.extend(p, data);
      }, index);
      
      return data.l >= 0;
    }, (data) => {
      assert(data._id in this.idToIndex_, 'Updating an owned particle ' + data._id + ' that isn\'t in the index map!');
      // We should move this particle, because we are the authority of it!
      var age = time - data.t0;
      // The wind walks a slow circle around 0,0
      var windSampleX = Math.cos(2*Math.PI * time / 100000);
      var windSampleY = Math.sin(2*Math.PI * time / 100000);
      var windX = 10000*this.noise.perlin3(windSampleX, windSampleY, 0.1);
      var windY = 10000*this.noise.perlin3(windSampleX, windSampleY, 0.6);
      
      var m = data.s + 0.1;
      var Fx = windX;
      var Fy = windY + 200;
      
      // Add perturbation:
      Fx += 10000*this.noise.perlin3(data.x, data.y, 0.13);
      Fy += 10000*this.noise.perlin3(data.x, data.y, 0.47);
      
      
      var ax = Fx / m;
      var ay = Fy / m;
      
      data.vx += ax * delta/1000;
      data.vy += ay * delta/1000;
      data.x += data.vx * delta/1000;
      data.y += data.vy * delta/1000;
      data.r = linear(age, 1000, 2000, 254, data.eventualColor.r);
      data.g = linear(age, 1000, 2000, 254, data.eventualColor.g);
      data.b = linear(age, 1000, 2000, 254, data.eventualColor.b);
      if (age > 1000) {
        data.a = linear(age, 1000, age+data.l, 254, 0);
      } else {
        data.a = linear(age, 0, 1000, 0, 254);
      }
      data.s = linear(age, 0, age+data.l, 20, 0.1);
      data.l -= delta;

      var index = this.idToIndex_[data._id];
      this.emitter.updateParticle((p) => {
        // We copy over p with the new data.
        _.extend(p, data);
      }, index);
      
      if (data.l < 0) {
        // Don't continue to persist.
        return false;
      }
      return true;
    }, (data) => {
      debug('Removing particle ' + data._id);
      // When we delete a particle, we should remove it from our emitter.
      assert(data._id in this.idToIndex_, 'Attempting to remove a particle ' + data._id + ' that isn\'t in the index map!');
      var index = this.idToIndex_[data._id];
      this.emitter.removeParticle(index);
      delete this.idToIndex_[data._id];
    });
    
    this.emitter.markBuffersDirty();
    
    this.surface.render();
    
    // Generate debug info.
    // C: x, y, connection.id
    if (false) {
      var debugText = [(time/1000).toFixed(2)];
    
      debugText = debugText.concat(this.persistence_.clients.map((client) => {
        return ['C:', client.x + ',' + client.y, client.conn.id].join(' ');
      }));
    
      // P: index x,y,_index oldStatus newStatus 
      debugText = debugText.concat(
        _(this.persistence_.data_)
            .sortBy((data) => data.l, true)
            .map((data) => {
          var x = (data.x >= 0 ? '+' : '') + data.x.toFixed(2);
          var y = (data.y >= 0 ? '+' : '') + data.y.toFixed(2);
          var l = (data.l >= 0 ? '+' : '') + data.l.toFixed(2);
          return ['P:', data._id, x + ',' + y, l, this.idToIndex_[data._id], data._status].join(' ');
        }));
    
      this.drawDebugText(_.flatten(debugText));
    }
  }
  drawDebugText(linesOfText) {
    this.debugCanvas.context.clearRect(
        0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    this.debugCanvas.context.fillStyle = 'white';
    this.debugCanvas.context.textAlign = 'left';
    var fontHeight = 32;
    this.debugCanvas.context.font = fontHeight + 'px monospace';
    this.debugCanvas.context.textBaseline = 'top';
    linesOfText.forEach((line, index) => {
      this.debugCanvas.context.fillText(line, 10, 10 + index * fontHeight);
    });
  }
}

register(ParticlesServer, ParticlesClient);
