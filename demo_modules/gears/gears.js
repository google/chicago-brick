/* globals Path2D */
const ModuleInterface = require('lib/module_interface');
const register = require('register');
const debug = require('debug');
const wallGeometry = require('wallGeometry');
const state = require('state');
const Rectangle = require('lib/rectangle');
const _ = require('underscore');
const GOOGLE_COLORS = ['#3369E8', '#D50F25', '#EEB211', '#009925'];
const HOLE_VARIETIES = ['none', 'rounded', 'circles'];

class GearsServer extends ModuleInterface.Server {
  willBeShownSoon() {    
    // Pick a random gear train.
    this.gears_ = [{
      x: wallGeometry.extents.w/2,
      y: wallGeometry.extents.h/2,
      radius: _.random(35, 300),
      teeth: _.random(6, 50),
      speed: _.random(1, 10)/40,
      angle: 0,
      color: 'white',
      type: 'external',
      holes: 'none'
    }];
  
    // TODO(applmak): Keep adding gears until we have no more room on
    // the wall.
  
    for (var c = 0; c < 1000; ++c) {
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
      type: 'ValueNearestInterpolator',
      holes: 'ValueNearestInterpolator',
    });
    state.get('gears').set(this.gears_, 0);
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
    for (var a = 0; a < 20; ++a) {
      var chosenGear = _.sample(this.gears_);
      //debug('Chosen gear at:', chosenGear.x, chosenGear.y, chosenGear.radius, chosenGear.teeth);
      
      var r = Math.random();
      var newTeeth = Math.floor(r * (150 - 6) + 6);
      var ratio = chosenGear.teeth / newTeeth;
      var newRadius = chosenGear.radius / ratio;
      var type = 'external';
      
      var dist;
      if (type == 'internal') {
        if (newTeeth < chosenGear.teeth + 12) {
          // Too small!
          continue;
        }
        // debug('Good size');
        dist = newRadius - chosenGear.radius;
      } else {
        dist = newRadius + chosenGear.radius;
      }
      
      
      for (var b = 0; b < 10; ++b) {
        var angle = Math.random() * 2 * Math.PI;
        var newX = Math.cos(angle) * dist + chosenGear.x;
        var newY = Math.sin(angle) * dist + chosenGear.y;
        
        var rect = Rectangle.centeredAt(newX, newY, newRadius*2);
        if (!rect.intersects(wallGeometry.extents)) {
          continue;
        }
        
        // debug('Inside');
        if (this.wouldOverlap_(newX, newY, newRadius)) {
          continue;
        }

        //debug('No overlap');
        var newSpeed = chosenGear.speed * ratio;
        if (type == 'external') {
          newSpeed *= -1;
        }
        var newAngle = this.calculateAngle_(
            chosenGear.x, chosenGear.y, chosenGear.teeth, chosenGear.angle,
            newX, newY, newTeeth, type);
        //
        if (!this.wouldMesh_(newX, newY, newRadius, newTeeth, newSpeed, newAngle)) {
          continue;
        }
        
        var holes = _.sample(HOLE_VARIETIES);
        if (holes == 'rounded') {
          holes = ['rounded', _.random(2, Math.floor(newTeeth / 4))];
        } else if (holes == 'circles') {
          holes = ['circles', _.random(2, 8)];
        }
        
        //debug('Meshes');
        this.gears_.push({
          x: newX,
          y: newY,
          radius: newRadius,
          teeth: newTeeth,
          speed: newSpeed,
          angle: newAngle,
          color: _.sample(_(GOOGLE_COLORS).without(chosenGear.color)),
          type: type,
          holes: holes
        });
        return true;
      }
    }
    return false;
  }
  overlaps_(x1, y1, r1, x2, y2, r2) {
    return (x1-x2)*(x1-x2) + (y1-y2)*(y1-y2) < (r1+r2)*(r1+r2);
  }
  wouldOverlap_(x, y, r) {
    return !!_(this.gears_).find((gear) => this.overlaps_(x, y, r, gear.x, gear.y, gear.radius));
  }
  wouldMesh_(x, y, r, t, s, a) {
    var calcOutsideRadius = (radius, teeth) => radius + radius * 2 / teeth;
    var mustMeshGears = _(this.gears_).filter((gear) => this.overlaps_(x, y, calcOutsideRadius(r, t), gear.x, gear.y, calcOutsideRadius(gear.radius, gear.teeth)));
    return !mustMeshGears.find((gear) => {
      // Find one that does not mesh, return true.
      // To mesh, we must show that s_1*r_1 = -s_2*r_2, or close enough.
      if (Math.abs(s*r + gear.speed * gear.radius) > 0.001) {
        return true;
      }
      
      // Well, it's going the right speed, but does it have the right angle?
      var idealAngle = this.calculateAngle_(
        gear.x, gear.y, gear.teeth, gear.angle, x, y, t
      );
      // The ideal angle and our angle must be offset by exactly a multiple of
      // our teeth angle.
      var teethAngle = 2*Math.PI/t;
      var diff = ((a - idealAngle) % teethAngle + teethAngle) % teethAngle;
      return diff > 0.01;
    });
  }
  calculateAngle_(x1, y1, t1, a1, x2, y2, t2, type) {
    // When second gear is exactly horizontal right from the first, and the 
    // angle of the first is 0, we need only consider if the second geer has
    // even (adjust by half-circular-pitch) or odd teeth (no adjustment).
    // Now, say the first gear is rotated by theta_1. That means the first tooth
    // at 0° has moved by theta_1 * radius_1, but because the gears are meshed,
    // we can be sure that these are in fact, equal: theta_1*r_1 = -theta_2*r_2.
    // So we solve for theta_2.
    // If the positions are not exactly horizontal, we first move the frame of
    // reference, then do the above, then move it back.
    var frame = Math.atan2(y2-y1, x2-x1);
    // Figure out where other gear should be.
    var newAngle = (a1 - frame)*t1/t2;
    if (type == 'external') {
      newAngle *= -1;
    }
    // Adjust for even/odd
    if (type == 'internal') {
      if (t1 % 2 != t2 % 2) {
        newAngle += Math.PI/t2;
      }
    } else {
      if (t2 % 2 == 0) {
        newAngle += Math.PI/t2;
      }
    }
    // Move back to reference frame.
    newAngle += frame;
    return newAngle;
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
  getGearPath_(type, holes, pitchRadius, numberOfTeeth) {
    var key = [type, holes, numberOfTeeth].join(',');
    if (!this.gearPaths_[key]) {
      var pitchDiameter = pitchRadius * 2;
      var diametralPitch = numberOfTeeth / pitchDiameter;
      var addendum = 1 / diametralPitch;
      //var toothThickness = Math.PI / 2 / diametralPitch;
      var wholeDepth = 2.157 / diametralPitch;
      //var workingDepth = 2*addendum;
      //var clearance = wholeDepth - workingDepth;
      //var filletRadius = 1.5 * clearance;
    
      var radiusAngle = 2*Math.PI / numberOfTeeth;
      var baseDiameter = pitchDiameter * Math.cos(20 * Math.PI / 180);
      var baseRadius = baseDiameter / 2;
      var outsideRadius = pitchRadius + addendum;
      var rootRadius;
      if (type == 'external') {
        rootRadius = outsideRadius - wholeDepth;
      } else if (type == 'internal') {
        rootRadius = (numberOfTeeth - 1.2) / diametralPitch / 2;
      }
      
      var path = new Path2D();
    
      var firstCommand = false;
    
      if (type == 'external') {
        // Center hole.
        path.arc(0, 0, 10, 0, 2*Math.PI, false);
        debug('holes', holes);
        if (holes[0] == 'circles') {
          var circleR = rootRadius / 4;
          var numCircles = holes[1];
          for (let i = 0; i < numCircles; ++i) {
            let angle = i * 2 * Math.PI / numCircles;
            let cx = Math.cos(angle) * circleR * 2;
            let cy = Math.sin(angle) * circleR * 2;
            path.moveTo(cx + circleR, cy);
            path.arc(cx, cy, circleR/1.5, 0, 2*Math.PI, false);
          }
        } else if (holes[0] == 'rounded') {
          var edgeThickness = 20;
          var barThickness = 30;
          do {
            var count = holes[1];
            var deltaAngle = 2 * Math.PI / count;
            var innerArcRadius = barThickness / Math.sin(deltaAngle/2);
            var ed = rootRadius - edgeThickness;
          } while (count > 0 && innerArcRadius > ed && (holes[1] = Math.floor(holes[1]/2)));
          // It's possible our teeth are so small that we would extend beyond
          // the edge of the gear. If this would happen, halve the number of
          // holes we request, and try again.
          for (let i = 0; i < count; ++i) {
            let angle = i * deltaAngle;
            let cx = Math.cos(angle + deltaAngle/2) * innerArcRadius;
            let cy = Math.sin(angle + deltaAngle/2) * innerArcRadius;
            let csa = angle + deltaAngle + Math.PI/2;
            let cr = barThickness/2;
            let bx = cx + Math.cos(csa) * cr;
            let by = cy + Math.sin(csa) * cr;
            path.moveTo(bx, by);
            path.arc(cx, cy, barThickness/2, csa, angle + 3*Math.PI/2, false);
            let ea = Math.asin(barThickness/2/ed);
            path.arc(0, 0, ed, angle + ea, angle + deltaAngle - ea, false);
          }
        }
      } else if (type == 'internal') {
        path.arc(0, 0, outsideRadius + addendum, 0, 2*Math.PI, false);
      }
      for (let i = 0; i < numberOfTeeth; ++i) {
        // Draw the teeth radii.
        var angle = i * radiusAngle;
    
        // Draw the tooth.
        // Start at the root circle:
        var a = angle - radiusAngle / 4;
        var rootCircleX = Math.cos(a) * rootRadius;
        var rootCircleY = Math.sin(a) * rootRadius;
        if (baseRadius > rootRadius && type == 'external') {
          if (!firstCommand) {
            path.moveTo(rootCircleX, rootCircleY);
            firstCommand = true;
          } else {
            path.lineTo(rootCircleX, rootCircleY);
          }
        }
    
        for (var j = 0; j <= 1; j++) {
          var dir = j ? -1 : 1;
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
          var t_pitch = Math.acos(baseRadius/pitchRadius);
          var t_0 = a - dir*(Math.tan(t_pitch) - t_pitch);
      
          // Now that we have our equation, figure out the t for when we hit the 
          // outer radius.
          var minT;
          if (baseRadius > rootRadius) {
            minT = 0;
          } else {
            minT = Math.acos(baseRadius/rootRadius);
          }
          var maxT = Math.acos(baseRadius/outsideRadius);
      
          var numSteps = 6;
          for (var step = 0; step <= numSteps; step++) {
            var t = (dir > 0 ? minT : maxT) + dir * step / numSteps * (maxT - minT);
            var r = baseRadius / Math.cos(t);
            var theta = dir * (Math.tan(t) - t) + t_0;
            var x = Math.cos(theta)*r;
            var y = Math.sin(theta)*r;
            if (!firstCommand) {
              path.moveTo(x, y);
              firstCommand = true;
            } else {
              path.lineTo(x, y);
            }
          }
        }
        if (baseRadius > rootRadius && type == 'external') {
          rootCircleX = Math.cos(a) * rootRadius;
          rootCircleY = Math.sin(a) * rootRadius;
          path.lineTo(rootCircleX, rootCircleY);
        }
      }
      this.gearPaths_[key] = path;
    }
    return this.gearPaths_[key];
  }
  drawGear_(centerX, centerY, pitchRadius, numberOfTeeth, baseAngle, color, type, holes) {
    var path = this.getGearPath_(type, holes, pitchRadius, numberOfTeeth);
    this.c.setTransform(1, 0 , 0, 1, 0, 0);
    this.surface.applyOffset();
    this.c.translate(centerX, centerY);
    this.c.rotate(baseAngle);
    
    this.c.fillStyle = color;
    this.c.fill(path, 'evenodd');
  }
  draw(time, delta) {
    this.c.setTransform(1, 0 , 0, 1, 0, 0);
    this.c.fillStyle = 'black';
    this.c.fillRect(0, 0, this.surface.virtualRect.w, this.surface.virtualRect.h);
    
    if (!this.gears_) {
      var gearsState = state.get('gears');
      if (!gearsState) {
        return;
      }
      this.gears_ = gearsState.get(0);
    }
    
    if (!this.gears_) {
      return;
    }
    
    var visibleGears = this.gears_.filter((gear) => {
      var rect = Rectangle.centeredAt(gear.x, gear.y, gear.radius*2, gear.radius*2);
      return rect.intersects(this.surface.virtualRect);
    });
    
    visibleGears.forEach((gear) => {
      var angle = 2*Math.PI * gear.speed * time / 1000 + gear.angle;
      this.drawGear_(gear.x, gear.y, gear.radius, gear.teeth, angle, gear.color, gear.type, gear.holes);
    });
  }
}

register(GearsServer, GearsClient);