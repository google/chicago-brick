import { GOOGLE_COLORS } from "./colors.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import * as randomjs from "https://esm.sh/random-js@2.1.0";
import { Server } from "../../server/modules/module_interface.ts";
import { Logger } from "../../lib/log.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { Gear, HoleSpec } from "./gears.ts";

const random = new randomjs.Random();

const MIN_GEAR_RADIUS = 50;
const MAX_GEAR_RADIUS = 500;

export function load(debug: Logger, state: ModuleState, wallGeometry: Polygon) {
  const HOLE_VARIETIES = ["none", "rounded", "circles"];

  function overlaps(
    x1: number,
    y1: number,
    r1: number,
    x2: number,
    y2: number,
    r2: number,
  ) {
    return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2) <
      (r1 + r2) * (r1 + r2);
  }

  function calculateAngle(
    x1: number,
    y1: number,
    t1: number,
    a1: number,
    x2: number,
    y2: number,
    t2: number,
  ): number {
    // When second gear is exactly horizontal right from the first, and the
    // angle of the first is 0, we need only consider if the second geer has
    // even (adjust by half-circular-pitch) or odd teeth (no adjustment).
    // Now, say the first gear is rotated by theta_1. That means the first tooth
    // at 0° has moved by theta_1 * radius_1, but because the gears are meshed,
    // we can be sure that these are in fact, equal: theta_1*r_1 = -theta_2*r_2.
    // So we solve for theta_2.
    // If the positions are not exactly horizontal, we first move the frame of
    // reference, then do the above, then move it back.
    const frame = Math.atan2(y2 - y1, x2 - x1);
    // Figure out where other gear should be.
    let newAngle = (a1 - frame) * t1 / t2;
    newAngle *= -1;
    // Adjust for even/odd
    if (t2 % 2 == 0) {
      newAngle += Math.PI / t2;
    }
    // Move back to reference frame.
    newAngle += frame;
    return newAngle;
  }

  function calculatePitch(radius: number, numberOfTeeth: number) {
    // Two gears will mesh only if they have the same pitch.
    const pitchDiameter = radius * 2;
    return numberOfTeeth / pitchDiameter;
  }

  class GearsServer extends Server {
    gears_: Gear[] = [];
    willBeShownSoon() {
      // Generate a random gear train.

      // To start, place the middle gear.
      this.gears_ = [{
        x: wallGeometry.extents.w / 2,
        y: wallGeometry.extents.h / 2,
        z: 1, // Which layer we're talking about.
        radius: random.integer(MIN_GEAR_RADIUS, MAX_GEAR_RADIUS),
        teeth: random.integer(6, 50),
        speed: random.integer(1, 10) / 40,
        angle: 0,
        colorIndex: -1,
        holes: "none",
        pitch: -1,
      }];
      this.gears_[0].pitch = calculatePitch(
        this.gears_[0].radius,
        this.gears_[0].teeth,
      );

      // Now, add 1000 gears. We might fail to place some of them, but that's
      // okay, it will look great.
      // TODO(applmak): Keep adding gears until we have no more room on
      // the wall, rather than just 1000.
      for (let c = 0; c < 1000; ++c) {
        this.makeNewGear_();
      }

      debug("Num gears", this.gears_.length);

      state.store("gears", 0, this.gears_);
    }

    makeNewGear_() {
      // Make a new gear that meshes with some existing gear.
      // Our algorithm goes like this:
      // 1) First, pick a gear to branch off of.
      // 2) Next, pick number of teeth for the new gear, which forces a size.
      // 3) Next, attempt to pick a point that's that radius away from the chosen
      //    preexisting gear. If the gear can be placed there, stop.
      // 4) If not, try up to 5 more random points.
      // 5) If still no luck, goto 1, unless we've tried 20 times, then stop.
      for (let a = 0; a < 20; ++a) {
        // 1) Pick a gear to connect to.
        const chosenGear = random.pick(this.gears_);

        // 2) Pick a number of teeth:
        const newTeeth = Math.floor(Math.random() * (150 - 6) + 6);

        // 2.25) Perhaps create an axle, which allows a gear to connect to the
        // chosen gear in the z-direction.
        let newZ = chosenGear.z;
        let newRadius, newX = 0, newY = 0, newSpeed, rotation;
        // Bias against axles and towards long gear trains.
        if (chosenGear.colorIndex >= 0 && Math.random() < 0.1) {
          // Pick the other z-plane.
          newZ = 1 - newZ;
          // 2.5) Pick a random new radius (which might generate a random new
          // pitch), but that's okay.
          newRadius = random.integer(MIN_GEAR_RADIUS, MAX_GEAR_RADIUS * 2);
          // The new gear is in exactly the same x,y position.
          newX = chosenGear.x;
          newY = chosenGear.y;

          // 3) Try to place this gear here. We know it's on screen already, so
          // we only need to see if it overlaps with another gear.
          if (this.wouldOverlap_(newX, newY, newZ, newRadius)) {
            // Ah, just give up.
            continue;
          }

          newSpeed = chosenGear.speed;
          rotation = 0;
          // We've found a valid axle!
        } else {
          // Calculate the size of the new gear.
          const ratio = chosenGear.teeth / newTeeth;
          newRadius = chosenGear.radius / ratio;

          // 2.5) Use the radius to generate the distance between the new gear and
          // the chosen gear.
          const dist = newRadius + chosenGear.radius;

          // 3) Try a bunch of times to place a gear.
          let fail = true;
          for (let b = 0; b < 10; ++b) {
            // 3.1) Pick an angle that the new gear should be placed related to the
            // old gear.
            const placementAngle = Math.random() * 2 * Math.PI;

            // 3.2) Now that we have an angle (and a radius) calculate the position.
            newX = Math.cos(placementAngle) * dist + chosenGear.x;
            newY = Math.sin(placementAngle) * dist + chosenGear.y;

            // 3.3) Make sure that this gear is on the screen.
            const rect = Rectangle.centeredAt(
              newX,
              newY,
              newRadius * 2,
              newRadius * 2,
            );
            if (!rect.intersects(wallGeometry.extents)) {
              continue;
            }

            // 3.4) Check to make sure that this gear doesn't overlap with another
            // gear, because that would look weird.
            if (this.wouldOverlap_(newX, newY, newZ, newRadius)) {
              continue;
            }

            // This is a good XY.
            fail = false;
            break;
          }
          if (fail) {
            continue;
          }

          newSpeed = -chosenGear.speed * ratio;
          // 3.5) Calculate the rotation of this gear to mesh with the chosenGear.
          rotation = calculateAngle(
            chosenGear.x,
            chosenGear.y,
            chosenGear.teeth,
            chosenGear.angle,
            newX,
            newY,
            newTeeth,
          );
        }

        // If the chosen radius is too small, reject.
        if (newRadius < 20) {
          continue;
        }

        // 3.7) Check to see if this meshes well with everything else we've
        // already placed (for example, this might intersect another gear!).
        if (
          !this.wouldMesh_(
            newX,
            newY,
            newZ,
            newRadius,
            newTeeth,
            newSpeed,
            rotation,
          )
        ) {
          continue;
        }

        // 3.8) Pick a look for the gear.
        const holeType = random.pick(HOLE_VARIETIES);
        let holes: HoleSpec;
        if (holeType == "rounded") {
          holes = ["rounded", random.integer(2, Math.floor(newTeeth / 4))];
        } else if (holeType == "circles") {
          holes = ["circles", random.integer(2, 8)];
        } else {
          holes = "none";
        }

        const newColorIndex = random.pick(
          Array.from({ length: GOOGLE_COLORS.length }, (_u, i) => i)
            .filter((i) => i != chosenGear.colorIndex),
        );

        this.gears_.push({
          x: newX,
          y: newY,
          z: newZ,
          radius: newRadius,
          teeth: newTeeth,
          speed: newSpeed,
          angle: rotation,
          colorIndex: newColorIndex,
          holes: holes,
          pitch: calculatePitch(newRadius, newTeeth),
        });

        return true;
      }
      return false;
    }
    wouldOverlap_(x: number, y: number, z: number, r: number) {
      return !!this.gears_.filter((g) => g.z == z)
        .find((gear) => overlaps(x, y, r, gear.x, gear.y, gear.radius));
    }
    wouldMesh_(
      x: number,
      y: number,
      z: number,
      r: number,
      t: number,
      s: number,
      a: number,
    ) {
      const calcOutsideRadius = (radius: number, teeth: number) =>
        radius + radius * 2 / teeth;
      const p = calculatePitch(r, t);
      const mustMeshGears = this.gears_.filter((g) => g.z == z)
        .filter((gear) =>
          overlaps(
            x,
            y,
            calcOutsideRadius(r, t),
            gear.x,
            gear.y,
            calcOutsideRadius(gear.radius, gear.teeth),
          )
        );
      return !mustMeshGears.find((gear) => {
        // Find one that does not mesh, return true.
        // The pitches must match.
        if (gear.pitch != p) {
          return true;
        }

        // To mesh, we must show that s_1*r_1 = -s_2*r_2, or close enough.
        if (Math.abs(s * r + gear.speed * gear.radius) > 0.001) {
          return true;
        }

        // Well, it's going the right speed, but does it have the right angle?
        const idealAngle = calculateAngle(
          gear.x,
          gear.y,
          gear.teeth,
          gear.angle,
          x,
          y,
          t,
        );
        // The ideal angle and our angle must be offset by exactly a multiple of
        // our teeth angle.
        const teethAngle = 2 * Math.PI / t;
        const diff = ((a - idealAngle) % teethAngle + teethAngle) % teethAngle;
        return diff > 0.01;
      });
    }
  }

  return { server: GearsServer };
}
