/* globals Path2D */
const ModuleInterface = require('lib/module_interface');
const Rectangle = require('lib/rectangle');

const debug = require('debug');
const register = require('register');
const state = require('state');
const wallGeometry = require('wallGeometry');
const _ = require('underscore');

const GOOGLE_COLORS = ['#3369E8', '#D50F25', '#EEB211', '#009925'];
const HOLE_VARIETIES = ['none', 'rounded', 'circles'];

function overlaps(x1, y1, r1, x2, y2, r2) {
  return (x1-x2)*(x1-x2) + (y1-y2)*(y1-y2) < (r1+r2)*(r1+r2);
}

function calculateAngle(x1, y1, t1, a1, x2, y2, t2) {
  // When second gear is exactly horizontal right from the first, and the 
  // angle of the first is 0, we need only consider if the second geer has
  // even (adjust by half-circular-pitch) or odd teeth (no adjustment).
  // Now, say the first gear is rotated by theta_1. That means the first tooth
  // at 0° has moved by theta_1 * radius_1, but because the gears are meshed,
  // we can be sure that these are in fact, equal: theta_1*r_1 = -theta_2*r_2.
  // So we solve for theta_2.
  // If the positions are not exactly horizontal, we first move the frame of
  // reference, then do the above, then move it back.
  const frame = Math.atan2(y2-y1, x2-x1);
  // Figure out where other gear should be.
  let newAngle = (a1 - frame)*t1/t2;
  newAngle *= -1;
  // Adjust for even/odd
  if (t2 % 2 == 0) {
    newAngle += Math.PI/t2;
  }
  // Move back to reference frame.
  newAngle += frame;
  return newAngle;
}

class GearsServer extends ModuleInterface.Server {
  willBeShownSoon() {    
    // Generate a random gear train.
    
    // To start, place the middle gear.
    this.gears_ = [{
      x: wallGeometry.extents.w/2,
      y: wallGeometry.extents.h/2,
      radius: _.random(35, 300),
      teeth: _.random(6, 50),
      speed: _.random(1, 10)/40,
      angle: 0,
      color: 'white',
      holes: 'none'
    }];
  
    // Now, add 1000 gears. We might fail to place some of them, but that's
    // okay, it will look great.
    // TODO(applmak): Keep adding gears until we have no more room on
    // the wall, rather than just 1000.
    for (let c = 0; c < 1000; ++c) {
      this.makeNewGear_();
    }
    
    debug('Num gears', this.gears_.length);
    
    state.create('gears', {
      x: 'ValueNearestInterpolator',
      y: 'ValueNearestInterpolator',
      radius: 'ValueNearestInterpolator',
      teeth: 'ValueNearestInterpolator',
      speed: 'ValueNearestInterpolator',
      angle: 'ValueNearestInterpolator',
      color: 'ValueNearestInterpolator',
      holes: 'ValueNearestInterpolator',
    });
    state.get('gears').set(this.gears_, 0);
    return Promise.resolve();
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
      const chosenGear = _.sample(this.gears_);
      
      // 2) Pick a number of teeth, and consequently, a distance away.
      const newTeeth = Math.floor(Math.random() * (150 - 6) + 6);
      const ratio = chosenGear.teeth / newTeeth;
      const newRadius = chosenGear.radius / ratio;

      // 2.5) Use the radius to generate the distance between the new gear and
      // the chosen gear.
      const dist = newRadius + chosenGear.radius;
      
      // 3) Try a bunch of times to place a gear.
      for (let b = 0; b < 10; ++b) {
        // 3.1) Pick an angle that the new gear should be placed related to the
        // old gear.
        const placementAngle = Math.random() * 2 * Math.PI;
        
        // 3.2) Now that we have an angle (and a radius) calculate the position.
        const newX = Math.cos(placementAngle) * dist + chosenGear.x;
        const newY = Math.sin(placementAngle) * dist + chosenGear.y;
        
        // 3.3) Make sure that this gear is on the screen.
        const rect = Rectangle.centeredAt(newX, newY, newRadius*2);
        if (!rect.intersects(wallGeometry.extents)) {
          continue;
        }
        
        // 3.4) Check to make sure that this gear doesn't overlap with another
        // gear, because that would look weird.
        if (this.wouldOverlap_(newX, newY, newRadius)) {
          continue;
        }

        // 3.5) Calculate the rotation of this gear to mesh with the chosenGear.
        const rotation = calculateAngle(
            chosenGear.x, chosenGear.y, chosenGear.teeth, chosenGear.angle,
            newX, newY, newTeeth);

        // 3.6) Calculate the speed.
        // External gears move in the opposite direction from their driver.
        let newSpeed = -chosenGear.speed * ratio;
        
        // 3.7) Check to see if this meshes well with everything else we've
        // already placed (for example, this might intersect another gear!).
        if (!this.wouldMesh_(newX, newY, newRadius, newTeeth, newSpeed, rotation)) {
          continue;
        }
        
        // 3.8) Pick a look for the gear.
        let holes = _.sample(HOLE_VARIETIES);
        if (holes == 'rounded') {
          holes = ['rounded', _.random(2, Math.floor(newTeeth / 4))];
        } else if (holes == 'circles') {
          holes = ['circles', _.random(2, 8)];
        }
        
        this.gears_.push({
          x: newX,
          y: newY,
          radius: newRadius,
          teeth: newTeeth,
          speed: newSpeed,
          angle: rotation,
          color: _.sample(_(GOOGLE_COLORS).without(chosenGear.color)),
          holes: holes
        });
        return true;
      }
    }
    return false;
  }
  wouldOverlap_(x, y, r) {
    return !!this.gears_.find(gear => overlaps(x, y, r, gear.x, gear.y, gear.radius));
  }
  wouldMesh_(x, y, r, t, s, a) {
    const calcOutsideRadius = (radius, teeth) => radius + radius * 2 / teeth;
    const mustMeshGears = this.gears_.filter(
      gear => overlaps(x, y, calcOutsideRadius(r, t), gear.x, gear.y, calcOutsideRadius(gear.radius, gear.teeth)));
    return !mustMeshGears.find(gear => {
      // Find one that does not mesh, return true.
      // To mesh, we must show that s_1*r_1 = -s_2*r_2, or close enough.
      if (Math.abs(s*r + gear.speed * gear.radius) > 0.001) {
        return true;
      }
      
      // Well, it's going the right speed, but does it have the right angle?
      const idealAngle = calculateAngle(
        gear.x, gear.y, gear.teeth, gear.angle, x, y, t
      );
      // The ideal angle and our angle must be offset by exactly a multiple of
      // our teeth angle.
      const teethAngle = 2*Math.PI/t;
      const diff = ((a - idealAngle) % teethAngle + teethAngle) % teethAngle;
      return diff > 0.01;
    });
  }
}
class GearsClient extends ModuleInterface.Client {
  willBeShownSoon(container, deadline) {
    const CanvasSurface = require('client/surface/canvas_surface');
    this.surface = new CanvasSurface(container, wallGeometry);
    this.c = this.surface.context;
    this.gears_ = null;
    
    // A map of teeth -> Path2D.
    this.gearPaths_ = [];
  }
  finishFadeOut() {
    if (this.surface) {
      this.surface.destroy();
    }
  }
  getGearPath_(holes, pitchRadius, numberOfTeeth) {
    // Rather than always making a new gear path, consult our cache.
    const key = [holes, numberOfTeeth].join(',');
    if (!this.gearPaths_[key]) {
      const pitchDiameter = pitchRadius * 2;
      const diametralPitch = numberOfTeeth / pitchDiameter;
      const addendum = 1 / diametralPitch;
      //var toothThickness = Math.PI / 2 / diametralPitch;
      const wholeDepth = 2.157 / diametralPitch;
      //var workingDepth = 2*addendum;
      //var clearance = wholeDepth - workingDepth;
      //var filletRadius = 1.5 * clearance;
    
      const radiusAngle = 2*Math.PI / numberOfTeeth;
      const baseDiameter = pitchDiameter * Math.cos(20 * Math.PI / 180);
      const baseRadius = baseDiameter / 2;
      const outsideRadius = pitchRadius + addendum;
      const rootRadius = outsideRadius - wholeDepth;
      
      const path = new Path2D();
    
      let firstCommand = false;
    
      // Center hole.
      path.arc(0, 0, 10, 0, 2*Math.PI, false);
      if (holes[0] == 'circles') {
        const circleR = rootRadius / 4;
        const numCircles = holes[1];
        for (let i = 0; i < numCircles; ++i) {
          const angle = i * 2 * Math.PI / numCircles;
          const cx = Math.cos(angle) * circleR * 2;
          const cy = Math.sin(angle) * circleR * 2;
          path.moveTo(cx + circleR, cy);
          path.arc(cx, cy, circleR/1.5, 0, 2*Math.PI, false);
        }
      } else if (holes[0] == 'rounded') {
        const edgeThickness = 20;
        const barThickness = 30;
        let count, innerArcRadius, ed, deltaAngle;
        do {
          count = holes[1];
          deltaAngle = 2 * Math.PI / count;
          innerArcRadius = barThickness / Math.sin(deltaAngle/2);
          ed = rootRadius - edgeThickness;
        } while (count > 0 && innerArcRadius > ed && (holes[1] = Math.floor(holes[1]/2)));
        // It's possible our teeth are so small that we would extend beyond
        // the edge of the gear. If this would happen, halve the number of
        // holes we request, and try again.
        for (let i = 0; i < count; ++i) {
          const angle = i * deltaAngle;
          const cx = Math.cos(angle + deltaAngle/2) * innerArcRadius;
          const cy = Math.sin(angle + deltaAngle/2) * innerArcRadius;
          const csa = angle + deltaAngle + Math.PI/2;
          const cr = barThickness/2;
          const bx = cx + Math.cos(csa) * cr;
          const by = cy + Math.sin(csa) * cr;
          path.moveTo(bx, by);
          path.arc(cx, cy, barThickness/2, csa, angle + 3*Math.PI/2, false);
          const ea = Math.asin(barThickness/2/ed);
          path.arc(0, 0, ed, angle + ea, angle + deltaAngle - ea, false);
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
          const t_pitch = Math.acos(baseRadius/pitchRadius);
          const t_0 = a - dir*(Math.tan(t_pitch) - t_pitch);
      
          // Now that we have our equation, figure out the t for when we hit the 
          // outer radius.
          let minT;
          if (baseRadius > rootRadius) {
            minT = 0;
          } else {
            minT = Math.acos(baseRadius/rootRadius);
          }
          const maxT = Math.acos(baseRadius/outsideRadius);
      
          const numSteps = 6;
          for (let step = 0; step <= numSteps; step++) {
            const t = (dir > 0 ? minT : maxT) + dir * step / numSteps * (maxT - minT);
            const r = baseRadius / Math.cos(t);
            const theta = dir * (Math.tan(t) - t) + t_0;
            const x = Math.cos(theta)*r;
            const y = Math.sin(theta)*r;
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
  drawGear_(centerX, centerY, pitchRadius, numberOfTeeth, baseAngle, color, holes) {
    const path = this.getGearPath_(holes, pitchRadius, numberOfTeeth);
    this.c.setTransform(1, 0 , 0, 1, 0, 0);
    this.surface.applyOffset();
    this.c.translate(centerX, centerY);
    this.c.rotate(baseAngle);
    
    this.c.fillStyle = color;
    this.c.fill(path, 'evenodd');
  }
  draw(time, delta) {
    this.c.setTransform(1, 0, 0, 1, 0, 0);
    this.c.fillStyle = 'black';
    this.c.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    
    if (!this.gears_) {
      const gearsState = state.get('gears');
      if (!gearsState) {
        return;
      }
      this.gears_ = gearsState.get(0);
    }
    
    if (!this.gears_) {
      return;
    }
    
    const visibleGears = this.gears_.filter(gear => {
      const rect = Rectangle.centeredAt(gear.x, gear.y, gear.radius*2, gear.radius*2);
      return rect.intersects(this.surface.virtualRect);
    });
    
    visibleGears.forEach(gear => {
      const angle = 2*Math.PI * gear.speed * time / 1000 + gear.angle;
      this.drawGear_(gear.x, gear.y, gear.radius, gear.teeth, angle, gear.color, gear.holes);
    });
  }
}

register(GearsServer, GearsClient);