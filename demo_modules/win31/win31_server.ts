// Shows a bouncing logo.
import * as randomjs from "https://esm.sh/random-js@2.1.0";
import { easyLog } from "../../lib/log.ts";
import { doPhysics } from "../../lib/math/collision.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import { flip, sub } from "../../lib/math/vector2d.ts";
import { Server } from "../../server/modules/module_interface.ts";
import { ModuleState } from "../../server/network/state_manager.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { State } from "./messages.ts";

const log = easyLog("win31");

const IMG_WIDTH = 225;
const IMG_HEIGHT = 225;

const random = new randomjs.Random();

const ORIGIN_BALL_POLYGON = new Polygon([
  { x: 0, y: 0 },
  { x: IMG_WIDTH, y: 0 },
  { x: IMG_WIDTH, y: IMG_HEIGHT },
  { x: 0, y: IMG_HEIGHT },
]);

export function load(
  state: ModuleState,
  network: ModuleWSS,
  wallGeometry: Polygon,
) {
  function crash() {
    // Pick a random client on the wall.
    const randomClient = random.pick([...network.clients().values()]);
    log("crash");
    randomClient.send("win31:crash");
  }

  class Win31Server extends Server {
    state!: State;
    sentCrash = false;
    startTime = 0;

    willBeShownSoon() {
      const spawnRect = wallGeometry.extents.inset(
        IMG_WIDTH / 2,
        IMG_HEIGHT / 2,
        IMG_WIDTH / 2,
        IMG_HEIGHT / 2,
      );

      do {
        this.state = {
          x: random.real(spawnRect.x, spawnRect.x + spawnRect.w, false),
          y: random.real(spawnRect.y, spawnRect.y + spawnRect.h, false),
          vx: 0.2,
          vy: 0.2,
        };
      } while (
        !ORIGIN_BALL_POLYGON.translate(this.state).isInsidePolygon(wallGeometry)
      );
      log(this.state);
    }

    tick(time: number, delta: number) {
      if (!this.startTime) {
        this.startTime = time;
      }

      doPhysics(
        this.state,
        ORIGIN_BALL_POLYGON.extents,
        delta,
        wallGeometry,
        (state, dt, newPos) => {
          newPos.x = state.x + state.vx * dt;
          newPos.y = state.y + state.vy * dt;
        },
        (state, newPos, report) => {
          const segment = (report.objectSegment || report.wallSegment)!;
          const flippedV = flip(
            { x: state.vx, y: state.vy },
            sub(segment.b, segment.a),
          );
          state.x = newPos.x;
          state.y = newPos.y;
          state.vx = flippedV.x;
          state.vy = flippedV.y;
        },
      );

      state.store("logo", time, this.state);
      if (!this.sentCrash && time - this.startTime > 10000) {
        crash();
        this.sentCrash = true;
      }
    }
  }

  return { server: Win31Server };
}
