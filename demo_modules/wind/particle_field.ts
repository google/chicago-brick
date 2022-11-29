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

import { ColorScale, windIntensityColorScale } from "./color.ts";
import { ForecastGrid } from "./forecast_grid.ts";
import { Bounds, Particle } from "./util.ts";
import { VectorField } from "./vector_field.ts";
import * as randomjs from "https://esm.sh/random-js@2.1.0";

const random = new randomjs.Random();

// Most of this code borrowed or derived from the awesome weather visualization
// at https://earth.nullschool.net and its open source code:
// https://github.com/cambecc/earth.

const MIN_WIND_RGB = 160;
const INTENSITY_SCALE_STEP = 5;
const MAX_INTENSITY = 20;
const MAX_PARTICLE_AGE = 100;
const MIN_PARTICLE_AGE = MAX_PARTICLE_AGE / 2;
const PARTICLE_LINE_WIDTH = 1;
const PARTICLE_MULTIPLIER = 5;
const FADE_FILL_STYLE = "rgba(0, 0, 0, 0.90)";

export class ParticleField {
  colorStyles!: ColorScale;
  particles!: Particle[];
  constructor(
    readonly bounds: Bounds,
    readonly grid: ForecastGrid,
    readonly vectorField: VectorField,
    readonly context: CanvasRenderingContext2D,
  ) {
    this.initializeColorBuckets();
    this.initializeParticles();
  }

  initializeColorBuckets() {
    // maxIntensity is the velocity at which particle color intensity is maximum
    this.colorStyles = windIntensityColorScale(
      INTENSITY_SCALE_STEP,
      MAX_INTENSITY,
      MIN_WIND_RGB,
    );
  }

  initializeParticles() {
    const particleCount = Math.round(this.bounds.width * PARTICLE_MULTIPLIER);
    this.particles = [];
    for (let i = 0; i < particleCount; i++) {
      const particle = {
        age: random.real(MIN_PARTICLE_AGE, MAX_PARTICLE_AGE),
        m: 1,
      } as Particle;
      this.particles.push(this.vectorField.randomize(particle));
    }
  }

  evolve() {
    this.particles.forEach((particle) => {
      // Update current position.
      if (particle.xt !== undefined) {
        particle.x = particle.xt;
      }
      if (particle.yt !== undefined) {
        particle.y = particle.yt;
      }

      particle.age += 1;

      // Randomize aged-out particles.
      if (particle.age >= MAX_PARTICLE_AGE) {
        this.vectorField.randomize(particle).age = 0;
      }

      const x = particle.x;
      const y = particle.y;
      const [vx, vy, m] = this.vectorField.vector(x, y);

      if (m === null) {
        // particle has escaped the grid, never to return...
        particle.age = MAX_PARTICLE_AGE;
      } else {
        particle.xt = x + vx!;
        particle.yt = y + vy!;
        particle.m = m;
      }
    });
  }

  draw() {
    const buckets = this.particles.reduce((buckets, p) => {
      // Add particles that are not aged out and are defined in the field to the
      // draw buckets.
      if (p.age < MAX_PARTICLE_AGE && this.vectorField.isDefined(p.xt, p.yt)) {
        const index = this.colorStyles.indexFor(p.m!);
        buckets[index].push(p);
      }
      return buckets;
    }, this.colorStyles.map(() => [] as Particle[]));

    const context = this.context;
    context.lineWidth = PARTICLE_LINE_WIDTH;
    context.fillStyle = FADE_FILL_STYLE;

    // Fade existing particle trails.
    const prev = context.globalCompositeOperation;
    context.globalCompositeOperation = "destination-in";
    context.fillRect(
      this.bounds.x,
      this.bounds.y,
      this.bounds.width,
      this.bounds.height,
    );
    context.globalCompositeOperation = prev;

    // Draw new particle trails.
    buckets.forEach((bucket, i) => {
      if (bucket.length > 0) {
        context.beginPath();
        context.strokeStyle = this.colorStyles[i];
        bucket.forEach((particle) => {
          context.moveTo(particle.x, particle.y);
          context.lineTo(particle.xt!, particle.yt!);
        });
        context.stroke();
      }
    });
  }
}
