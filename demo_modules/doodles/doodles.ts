import { Client } from "../../client/modules/module_interface.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";
import doodles from "./doodles.clean.json" assert { type: "json" };
import * as info from "../../client/util/info.ts";

interface Doodle {
  hiResUrl: string;
  url: string;
}

const DOODLE_URLS = [
  "lh3.googleusercontent.com",
  "www.google.com/logos",
  "www.google.com/logos/doodles",
];

export function load(wallGeometry: Polygon) {
  class DoodleClient extends Client {
    readonly doodles: Doodle[] = [];
    readonly elements: HTMLImageElement[] = [];
    container!: HTMLElement;
    lastUpdate = 0;
    willBeShownSoon(container: HTMLElement, deadline: number) {
      this.container = container;
      this.lastUpdate = deadline;
      container.style.backgroundColor = "white";
      // First, load the json file.
      // deno-lint-ignore no-explicit-any
      for (const doodle of doodles as Array<any>) {
        // [null,"048361aa20592962827a391086cfc0e8",null,[1998,8,30],"Burning Man Festival","1/1998/googleburn.jpg","5f92616a0d43abce11e02c142b8fdec7"]
        const [hiResUrl, /*next*/,/*prev*/ ,/*date*/ ,/*title*/ , url] = doodle;
        this.doodles.push({ hiResUrl, url });
      }

      for (let i = 0; i < 4; ++i) {
        this.updateImageAtIndex(i);
      }
    }
    updateImageAtIndex(elIndex: number) {
      this.elements[elIndex]?.remove();

      const width = this.container.offsetWidth;
      const height = this.container.offsetHeight;

      const img = new Image();
      const index = Math.floor(this.doodles.length * Math.random());
      const chosenDoodle = this.doodles[index];
      const doodleUrl = chosenDoodle.hiResUrl || chosenDoodle.url;
      const fixedUrl = doodleUrl.replace(/^\d+/, (d) => {
        return `https://${DOODLE_URLS[Number(d)]}`;
      });
      img.src = fixedUrl;
      this.elements[elIndex] = img;
      img.style.position = "absolute";
      const x = elIndex % 2;
      const y = Math.floor(elIndex / 2);
      img.style.left = `${x * width / 2}px`;
      img.style.top = `${y * height / 2}px`;
      img.style.width = `${width / 2}px`;
      img.style.height = `${height / 2}px`;
      img.style.objectFit = "contain";

      this.container.appendChild(img);
    }
    draw(time: number) {
      if (
        time - this.lastUpdate > 1000
      ) {
        // Only do an update if we are chosen as one of the wall tiles.
        if (
          Math.random() <
            info.virtualRect.w * info.virtualRect.h / wallGeometry.extents.w /
              wallGeometry.extents.h
        ) {
          this.updateImageAtIndex(Math.floor(Math.random() * 4));
        }
        this.lastUpdate = time;
      }
    }
  }

  return { client: DoodleClient };
}
