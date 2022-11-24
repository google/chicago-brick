import { Client } from "../../client/modules/module_interface.ts";
import { ModulePeer } from "../../client/network/peer.ts";
import { CanvasSurface } from "../../client/surface/canvas_surface.ts";
import { Surface } from "../../client/surface/surface.ts";
import { easyLog } from "../../lib/log.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { add } from "../../lib/math/vector2d.ts";

const log = easyLog("matrix");

interface Trail {
  headX: number;
  headY: number;
  y: number;
  seed: number;
  idealLength: number;
}

export function load(wallGeometry: Polygon, peerNetwork: ModulePeer) {
  function sampleColor(alpha: number) {
    const COLOR_MID = 0.95;
    let rgb = []; // [0-1]
    let value;
    if (alpha < COLOR_MID) {
      value = alpha / COLOR_MID;
      rgb = [0, value, 0];
    } else {
      value = (alpha - COLOR_MID) / (1 - COLOR_MID);
      rgb = [value, 1, value];
    }

    // Desaturate @ 50%:
    const intensity = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
    const k = 0.7;
    rgb[0] = intensity * k + rgb[0] * (1 - k);
    rgb[1] = intensity * k + rgb[1] * (1 - k);
    rgb[2] = intensity * k + rgb[2] * (1 - k);

    return "#" +
      rgb.map((c) => Math.floor(255 * c).toString(16).padStart(2, "0")).join(
        "",
      );
  }

  const CHARACTERS: string[] = [];
  // Add digits to characters:
  for (let i = 0; i <= 9; ++i) {
    CHARACTERS.push(String(i));
  }
  // Add japanese half-width characters:
  for (let i = 0xFF61; i <= 0xFF9F; ++i) {
    CHARACTERS.push(String.fromCharCode(i));
  }
  const CHAR_WIDTH = 20;
  const CHAR_HEIGHT = 32;

  interface MatrixClientSpawnStrategy {
    // Connects to the peer network.
    // Returns a promise that is resolved when that is complete.
    connect(deadline: number): void | Promise<void>;
    // Optionally spawns trails & sends that data to the network.
    spawn(time: number): void;
  }

  class MatrixSpawnerStrategy implements MatrixClientSpawnStrategy {
    x_: number;
    y_: number;
    width_: number;
    peerYs_: number[];
    trails_: Trail[];
    // Use the surface data to figure out which peers I should connect to.
    constructor(surface: Surface, trails: Trail[]) {
      this.x_ = surface.virtualOffset.x;
      this.y_ = surface.virtualOffset.y;
      this.width_ = surface.virtualRect.w;
      this.peerYs_ = [];
      this.trails_ = trails;
      for (
        let y = this.y_ + 1;
        surface.isOffsetWithinExtents(this.x_, y);
        ++y
      ) {
        if (surface.isOffsetVisible(this.x_, y)) {
          this.peerYs_.push(y);
        }
      }
    }
    async connect(): Promise<void> {
      const promises = [];
      for (const y of this.peerYs_) {
        promises.push(peerNetwork.connectToOffset({ x: this.x_, y }));
      }
      await Promise.all(promises);
      log(`Sending ${this.trails_.length} initials trails...`);
      peerNetwork.sendToAllPeers("trails", this.trails_);
    }
    spawn(time: number) {
      const maxTrailsRightNow = wallGeometry.extents.w / CHAR_WIDTH +
        20 * Math.sin(time / 1000 * Math.PI * 2 / 30);
      if (this.trails_.length < maxTrailsRightNow) {
        // Make a new trail!
        const y = Math.random() * -wallGeometry.extents.h / CHAR_HEIGHT;
        const newTrail: Trail = {
          headX: Math.floor(Math.random() * (this.width_ / CHAR_WIDTH)),
          headY: Math.floor(y),
          y,
          seed: 13 + Math.floor(time * 10 % 17),
          idealLength: Math.floor(Math.random() * 20 + 8),
        };
        this.trails_.push(newTrail);
        peerNetwork.sendToAllPeers("newTrail", newTrail);
      }
    }
  }

  class MatrixNotSpawnerStrategy implements MatrixClientSpawnStrategy {
    trails_: Trail[];
    constructor(trails: Trail[]) {
      this.trails_ = trails;
    }
    connect(): void {
      peerNetwork.on("trails", (sender, trails) => {
        log(`Got ${trails.length} new trails from ${sender}`);
        this.trails_.splice(0, 0, ...trails);
      });
      peerNetwork.on("newTrail", (sender, trail) => {
        log(`Got a new trail from ${sender}`);
        this.trails_.push(trail);
      });
    }
    spawn() {}
  }

  class MatrixClient extends Client {
    canvas!: CanvasRenderingContext2D;
    trails_: Trail[] = [];
    shouldSpawn_ = false;
    spawnStrategy_!: MatrixClientSpawnStrategy;
    willBeShownSoon(container: HTMLElement, deadline: number) {
      // Open the peer network (register with the network our unique id).
      peerNetwork.open();
      const surface = new CanvasSurface(container, wallGeometry);
      this.surface = surface;
      this.canvas = surface.context;

      const start = add(this.surface.virtualRect.center(), {
        x: 0,
        y: -this.surface.virtualRect.h,
      });
      // Should I spawn trails? Well, if there is no screen that is above mine,
      // then certainly. If not, then someone else will spawn for me.
      this.shouldSpawn_ = !wallGeometry.intersectionWithSegment(
        start,
        add(start, { x: 0, y: -100000 }),
      );

      if (this.shouldSpawn_) {
        log("I decided to spawn");
        this.spawnStrategy_ = new MatrixSpawnerStrategy(
          this.surface,
          this.trails_,
        );
      } else {
        log("I decided NOT to spawn");
        this.spawnStrategy_ = new MatrixNotSpawnerStrategy(this.trails_);
      }

      // Don't await the connect! It might take a second.
      this.spawnStrategy_.connect(deadline);
    }
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }
    // Draws a character at a specific position in text coordinates
    drawCharacterAt(
      c: string,
      x: number,
      y: number,
      color: string,
      flipped: boolean,
    ) {
      x *= CHAR_WIDTH;
      y *= CHAR_HEIGHT;
      y -= this.surface!.virtualRect.y;

      this.canvas.fillStyle = color;
      this.canvas.setTransform(flipped ? -1 : 1, 0, 0, 1, x, y);
      this.canvas.fillText(c, 0, 0);
    }
    draw(time: number, delta: number) {
      const WALL_BOTTOM = this.surface!.wallRect.h / CHAR_HEIGHT;
      this.spawnStrategy_.spawn(time);

      this.canvas.setTransform(1, 0, 0, 1, 0, 0);
      this.canvas.fillStyle = "black";
      this.canvas.fillRect(
        0,
        0,
        this.surface!.virtualRect.w,
        this.surface!.virtualRect.h,
      );
      this.canvas.textAlign = "center";
      this.canvas.textBaseline = "top";
      this.canvas.font = "32px Monaco";
      this.canvas.textBaseline = "middle";

      // For each trail:
      for (const trail of this.trails_) {
        // Draw the trail.
        for (let j = 0; j < trail.idealLength; ++j) {
          // Choose a random character.
          const characterSeed =
            (trail.idealLength + trail.headY - j + trail.headX + trail.seed) *
            trail.seed;
          const character = CHARACTERS[characterSeed % CHARACTERS.length];
          const flipped = !!(characterSeed % 2);

          // Draw char j at location headY - j
          this.drawCharacterAt(
            character,
            trail.headX,
            trail.headY - j,
            sampleColor(1 - j / trail.idealLength),
            flipped,
          );
        }

        // Move the trail.
        trail.y += delta / 1000 * 15;
        trail.headY = Math.floor(trail.y);
      }

      for (let i = this.trails_.length - 1; i >= 0; --i) {
        const trail = this.trails_[i];
        if (trail.y > WALL_BOTTOM + trail.idealLength) {
          this.trails_.splice(i, 1);
        }
      }
    }
  }

  return { client: MatrixClient };
}

declare global {
  interface EmittedEvents {
    trails(trails: Trail[]): void;
    newTrail(trail: Trail): void;
  }
}
