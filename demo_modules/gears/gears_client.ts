/* globals Path2D */

import { DARK_COLORS, GOOGLE_COLORS } from "./colors.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import { Client } from "../../client/modules/module_interface.ts";
import { Logger } from "../../lib/log.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import {
  CurrentValueInterpolator,
  ModuleState,
  SharedState,
} from "../../client/network/state_manager.ts";
import { Gear, GearDetails, HoleSpec } from "./gears.ts";

export function load(debug: Logger, state: ModuleState, wallGeometry: Polygon) {
  // Initially start with two layers.
  const layers = 2;

  class GearsClient extends Client {
    surface: CanvasSurface | undefined = undefined;
    c!: CanvasRenderingContext2D;
    gears_?: Gear[];
    gearDetails_: Record<string, GearDetails> = {};
    gearPaths_: Record<string, Path2D> = {};
    gearsState?: SharedState;

    willBeShownSoon(container: HTMLElement) {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.c = this.surface.context;

      // A map of gear metric details.
      this.gearDetails_ = {};

      // A map of teeth -> Path2D.
      this.gearPaths_ = {};

      this.gearsState = state.define("gears", {
        x: CurrentValueInterpolator,
        y: CurrentValueInterpolator,
        z: CurrentValueInterpolator,
        radius: CurrentValueInterpolator,
        teeth: CurrentValueInterpolator,
        speed: CurrentValueInterpolator,
        angle: CurrentValueInterpolator,
        colorIndex: CurrentValueInterpolator,
        holes: CurrentValueInterpolator,
        pitch: CurrentValueInterpolator,
      });
    }
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }
    getGearDetails_(pitchRadius: number, numberOfTeeth: number) {
      const key = [pitchRadius, numberOfTeeth].join(",");
      if (!this.gearDetails_[key]) {
        const pitchDiameter = pitchRadius * 2;
        const diametralPitch = numberOfTeeth / pitchDiameter;
        const addendum = 1 / diametralPitch;
        //var toothThickness = Math.PI / 2 / diametralPitch;
        const wholeDepth = 2.157 / diametralPitch;
        //var workingDepth = 2*addendum;
        //var clearance = wholeDepth - workingDepth;
        //var filletRadius = 1.5 * clearance;

        const radiusAngle = 2 * Math.PI / numberOfTeeth;
        const baseDiameter = pitchDiameter * Math.cos(20 * Math.PI / 180);
        const baseRadius = baseDiameter / 2;
        const outsideRadius = pitchRadius + addendum;
        const rootRadius = outsideRadius - wholeDepth;

        this.gearDetails_[key] = {
          pitchDiameter,
          diametralPitch,
          addendum,
          wholeDepth,
          radiusAngle,
          baseDiameter,
          baseRadius,
          outsideRadius,
          rootRadius,
        };
      }
      return this.gearDetails_[key];
    }
    getGearPath_(holes: HoleSpec, pitchRadius: number, numberOfTeeth: number) {
      // Rather than always making a new gear path, consult our cache.
      const key = [holes, pitchRadius, numberOfTeeth].join(",");
      if (!this.gearPaths_[key]) {
        const {
          radiusAngle,
          baseRadius,
          outsideRadius,
          rootRadius,
        } = this.getGearDetails_(pitchRadius, numberOfTeeth);

        const path = new Path2D();

        let firstCommand = false;

        // Center hole.
        path.arc(0, 0, 10, 0, 2 * Math.PI, false);
        if (holes[0] == "circles") {
          const circleR = rootRadius / 4;
          const numCircles = holes[1] as number;
          for (let i = 0; i < numCircles; ++i) {
            const angle = i * 2 * Math.PI / numCircles;
            const cx = Math.cos(angle) * circleR * 2;
            const cy = Math.sin(angle) * circleR * 2;
            path.moveTo(cx + circleR / 1.5, cy);
            path.arc(cx, cy, circleR / 1.5, 0, 2 * Math.PI, false);
          }
        } else if (holes[0] == "rounded") {
          const edgeThickness = 20;
          const barThickness = 30;
          let count = holes[1] as number,
            innerArcRadius = 1,
            ed = 10,
            deltaAngle = 0.1;
          do {
            if (count < 2) {
              break;
            }
            deltaAngle = 2 * Math.PI / count;
            innerArcRadius = barThickness / Math.sin(deltaAngle / 2);
            ed = rootRadius - edgeThickness;
          } while (
            count > 0 && innerArcRadius > ed &&
            (count = Math.floor(count / 2))
          );
          if (count >= 2) {
            // It's possible our teeth are so small that we would extend beyond
            // the edge of the gear. If this would happen, halve the number of
            // holes we request, and try again.
            for (let i = 0; i < count; ++i) {
              const angle = i * deltaAngle;
              const cx = Math.cos(angle + deltaAngle / 2) * innerArcRadius;
              const cy = Math.sin(angle + deltaAngle / 2) * innerArcRadius;
              const csa = angle + deltaAngle + Math.PI / 2;
              const cr = barThickness / 2;
              const bx = cx + Math.cos(csa) * cr;
              const by = cy + Math.sin(csa) * cr;
              path.moveTo(bx, by);
              path.arc(
                cx,
                cy,
                barThickness / 2,
                csa,
                angle + 3 * Math.PI / 2,
                false,
              );
              const ea = Math.asin(barThickness / 2 / ed);
              if (ed < 0) {
                throw new Error(`... huh? ed shouldn't be negative!`);
              }
              path.arc(0, 0, ed, angle + ea, angle + deltaAngle - ea, false);
            }
          }
        }
        for (let i = 0; i < numberOfTeeth; ++i) {
          // Draw the teeth radii.
          const angle = i * radiusAngle;

          // Draw the tooth.
          // Start at the root circle:
          let a = angle - radiusAngle / 4;
          let rootCircleX = Math.cos(a) * rootRadius;
          let rootCircleY = Math.sin(a) * rootRadius;
          if (baseRadius > rootRadius) {
            if (!firstCommand) {
              path.moveTo(rootCircleX, rootCircleY);
              firstCommand = true;
            } else {
              path.lineTo(rootCircleX, rootCircleY);
            }
          }

          for (let j = 0; j <= 1; j++) {
            const dir = j ? -1 : 1;
            a = angle - dir * radiusAngle / 4;
            // Draw the involate, starting at the base circle, and passing through
            // the pitch point.
            // The equation of the involate in polar coords is:
            // r = r_base / cos(dir*t) = r_base / cos(t)
            // theta = tan(dir*t) - dir*t + t_0 = dir*(tan(t) - t) + t_0
            // We want to find a choice of t_0 such that the resulting curve hits
            // our pitch circle exactly.
            // Well, the pitchPoint is (r_pitch, a) in polar, so we solve:
            // r_pitch = r_base / cos(t_pitch)
            // a = dir*(tan(t_pitch) - t_pitch) + t_0
            // =>
            // r_base/r_pitch = cos(t_pitch)
            // =>
            // a = dir*tan(arccos(r_base/r_pitch)) - arccos(r_base/r_pitch) + t_0
            // =>
            // t_0 = a - dir*tan(arccos(r_base/r_pitch)) + arccos(r_base/r_pitch)
            const t_pitch = Math.acos(baseRadius / pitchRadius);
            const t_0 = a - dir * (Math.tan(t_pitch) - t_pitch);

            // Now that we have our equation, figure out the t for when we hit the
            // outer radius.
            let minT;
            if (baseRadius > rootRadius) {
              minT = 0;
            } else {
              minT = Math.acos(baseRadius / rootRadius);
            }
            const maxT = Math.acos(baseRadius / outsideRadius);

            const numSteps = 6;
            for (let step = 0; step <= numSteps; step++) {
              const t = (dir > 0 ? minT : maxT) +
                dir * step / numSteps * (maxT - minT);
              const r = baseRadius / Math.cos(t);
              const theta = dir * (Math.tan(t) - t) + t_0;
              const x = Math.cos(theta) * r;
              const y = Math.sin(theta) * r;
              if (!firstCommand) {
                path.moveTo(x, y);
                firstCommand = true;
              } else {
                path.lineTo(x, y);
              }
            }
          }
          if (baseRadius > rootRadius) {
            rootCircleX = Math.cos(a) * rootRadius;
            rootCircleY = Math.sin(a) * rootRadius;
            path.lineTo(rootCircleX, rootCircleY);
          }
        }
        this.gearPaths_[key] = path;
      }
      return this.gearPaths_[key];
    }
    drawGear_(
      centerX: number,
      centerY: number,
      z: number,
      pitchRadius: number,
      numberOfTeeth: number,
      baseAngle: number,
      colorIndex: number,
      holes: HoleSpec,
    ) {
      const path = this.getGearPath_(holes, pitchRadius, numberOfTeeth);
      this.c.setTransform(1, 0, 0, 1, 0, 0);
      this.surface!.applyOffset();
      this.c.translate(centerX, centerY);
      this.c.rotate(baseAngle);

      const colors = z ? GOOGLE_COLORS : DARK_COLORS;
      this.c.fillStyle = colorIndex >= 0 ? colors[colorIndex] : "white";
      this.c.fill(path, "evenodd");
    }
    draw(time: number) {
      this.c.setTransform(1, 0, 0, 1, 0, 0);
      this.c.fillStyle = "black";
      this.c.fillRect(
        0,
        0,
        this.surface!.virtualRect.w,
        this.surface!.virtualRect.h,
      );

      if (!this.gears_) {
        this.gears_ = this.gearsState!.get(0) as Gear[];

        if (!this.gears_) {
          return;
        }

        // First time we're seeing the gears, so cull the ones we can't see on
        // this screen.
        debug("gears before: " + this.gears_.length);
        this.gears_ = this.gears_.filter((g) => {
          const details = this.getGearDetails_(g.radius, g.teeth);
          const rect = Rectangle.centeredAt(
            g.x,
            g.y,
            details.outsideRadius * 2,
            details.outsideRadius * 2,
          );
          return rect.intersects(this.surface!.virtualRect);
        });
        debug("gears after: " + this.gears_.length);
      }

      for (let z = 0; z < layers; z++) {
        this.gears_.filter((g) => g.z == z)
          .forEach((gear) => {
            const angle = 2 * Math.PI * gear.speed * time / 1000 + gear.angle;
            this.drawGear_(
              gear.x,
              gear.y,
              gear.z,
              gear.radius,
              gear.teeth,
              angle,
              gear.colorIndex,
              gear.holes,
            );
          });
      }
    }
  }
  return { client: GearsClient };
}
