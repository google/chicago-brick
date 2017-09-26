/* Copyright 2017 Google Inc. All Rights Reserved.

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

// Most of this code borrowed or derived from the awesome weather visualization
// at https://earth.nullschool.net and its open source code:
// https://github.com/cambecc/earth.

const color = require('demo_modules/wind/color');

const MIN_WIND_RGB = 160;
const INTENSITY_SCALE_STEP = 5;
const MAX_INTENSITY = 20;
const MAX_PARTICLE_AGE = 100;
const MIN_PARTICLE_AGE = MAX_PARTICLE_AGE / 2;
const PARTICLE_LINE_WIDTH = 1;
const PARTICLE_MULTIPLIER = 5;
const FADE_FILL_STYLE = "rgba(0, 0, 0, 0.90)";

class ParticleField {
  constructor(bounds, grid, vectorField, context) {
    this.bounds = bounds;
    this.grid = grid;
    this.vectorField = vectorField;
    this.context = context;

    this.initializeColorBuckets();
    this.initializeParticles();
  }

  initializeColorBuckets() {
    // maxIntensity is the velocity at which particle color intensity is maximum
    this.colorStyles = color.windIntensityColorScale(
        INTENSITY_SCALE_STEP, MAX_INTENSITY, MIN_WIND_RGB);

    this.buckets = this.colorStyles.map(function() { return []; });
  }

  initializeParticles() {
    const particleCount = Math.round(this.bounds.width * PARTICLE_MULTIPLIER);
    this.particles = [];
    for (var i = 0; i < particleCount; i++) {
      this.particles.push(this.vectorField.randomize(
          {age: _.random(MIN_PARTICLE_AGE, MAX_PARTICLE_AGE)}));
    }
  }

  evolve() {
    this.buckets.forEach((bucket) => {
      bucket.length = 0;
    });
    this.particles.forEach((particle) => {
      if (particle.age > MAX_PARTICLE_AGE) {
        this.vectorField.randomize(particle).age = 0;
      }
      const x = particle.x;
      const y = particle.y;
      const v = this.vectorField.vector(x, y);

      const m = v[2];
      if (m === null) {
        // particle has escaped the grid, never to return...
        particle.age = MAX_PARTICLE_AGE;
      } else {
        const xt = x + v[0];
        const yt = y + v[1];
        if (this.vectorField.isDefined(xt, yt)) {
          // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
          particle.xt = xt;
          particle.yt = yt;
          this.buckets[this.colorStyles.indexFor(m)].push(particle);
        } else {
          // Particle isn't visible, but it still moves through the field.
          particle.x = xt;
          particle.y = yt;
        }
      }
      particle.age += 1;
    });
  }

  draw() {
    const context = this.context;
    context.lineWidth = PARTICLE_LINE_WIDTH;
    context.fillStyle = FADE_FILL_STYLE;

    // Fade existing particle trails.
    var prev = context.globalCompositeOperation;
    context.globalCompositeOperation = "destination-in";
    context.fillRect(this.bounds.x, this.bounds.y, this.bounds.width,
        this.bounds.height);
    context.globalCompositeOperation = prev;

    // Draw new particle trails.
    this.buckets.forEach((bucket, i) => {
      if (bucket.length > 0) {
        context.beginPath();
        context.strokeStyle = this.colorStyles[i];
        bucket.forEach((particle) => {
          context.moveTo(particle.x, particle.y);
          context.lineTo(particle.xt, particle.yt);
          particle.x = particle.xt;
          particle.y = particle.yt;
        });
        context.stroke();
      }
    });
  }
}

module.exports = ParticleField;
