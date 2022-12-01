import { Server } from "../../server/modules/module_interface.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { MAX_NEW_STARS, Star, V } from "./interfaces.ts";
import { now } from "../../lib/adjustable_time.ts";
import { easyLog } from "../../lib/log.ts";

const SPAWN_DISTANCE = 8;

const log = easyLog("stars");

export function load(network: ModuleWSS) {
  class StarsServer extends Server {
    readonly stars: Star[] = [];

    warpFactor = 1.0;
    numStars = 100;

    spawnStar(index: number) {
      let x = 6 * Math.random() - 3;
      let y = 6 * Math.random() - 3;
      if (Math.abs(x) < 0.1 && Math.abs(y) < 0.1) {
        x += Math.sign(x) * 0.1;
        y += Math.sign(y) * 0.1;
      }
      const z = SPAWN_DISTANCE * (Math.random() - 1);
      const spawnTime = now();
      const size = Math.random() * (0.005 - 0.0015) + 0.0015;
      this.stars[index] = {
        x,
        y,
        z,
        spawnTime,
        index,
        size,
      };
    }
    willBeShownSoon() {
      // Pick a warp factor.
      this.warpFactor = Math.round(2 * Math.random() * 6.0 + 0.5) * 0.5;
      log(`Warp factor: ${this.warpFactor}`);

      this.numStars = Math.min(
        MAX_NEW_STARS,
        Math.floor(
          10 **
            (2 * Math.pow(Math.random(), 0.3) + Math.log10(MAX_NEW_STARS) - 2),
        ),
      );
      log(`Num stars: ${this.numStars}`);

      for (let i = 0; i < this.numStars; ++i) {
        this.spawnStar(i);
      }

      // Tell the clients about these stars.
      network.send("stars:new-star", this.stars);
      network.send("stars:set-warp", this.warpFactor);
      network.on("connect", (socket) => {
        socket.send("stars:new-star", this.stars);
        socket.send("stars:set-warp", this.warpFactor);
      });
    }
    tick(time: number): void {
      const updatedStars: Star[] = [];
      for (let i = 0; i < this.stars.length; ++i) {
        const star = this.stars[i];
        // Where is this star now?
        const z = star.z + V * (time - star.spawnTime);
        if (z > 0) {
          this.spawnStar(i);
          updatedStars.push(this.stars[i]);
        }
      }
      if (updatedStars.length) {
        network.send("stars:new-star", updatedStars);
      }
    }
  }
  return { server: StarsServer };
}
