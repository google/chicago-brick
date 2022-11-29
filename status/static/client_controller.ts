import { TakeSnapshotResponse } from "../../client/client.ts";
import { Point } from "../../lib/math/vector2d.ts";
import { ErrorController } from "./error_controller.ts";

let snapshotReqId = 1;

interface SavedClient {
  id: string;
  rect: number[];
  element: SVGElement;
}

export class ClientController {
  readonly width: number;
  readonly height: number;
  wallGeometry?: Point[];
  wallPath?: SVGPathElement;
  readonly svg: SVGSVGElement;
  readonly clients: SavedClient[];
  readonly pendingSnapshots: Set<{ id: string; timeout: number }>;
  tx: (x: number) => number = (x) => x;
  ty: (y: number) => number = (y) => y;

  constructor(
    readonly container: HTMLElement,
    readonly takeSnapshotFn: (bits: { client: string; id: string }) => void,
    readonly errorController: ErrorController,
    readonly now: () => number,
  ) {
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;

    this.wallGeometry = undefined;

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.container.appendChild(this.svg);
    this.clients = [];
    this.pendingSnapshots = new Set();
  }
  makeEl() {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    g.appendChild(rect);
    g.appendChild(text);
    return g;
  }
  setClients(data: string[]) {
    for (const d of data) {
      this.newClient(d, false);
    }

    if (this.wallGeometry) {
      this.renderClients();
    }
  }
  calculateTransform() {
    const xs = this.wallGeometry!.map((p) => p.x);
    const ys = this.wallGeometry!.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);

    const B = 20;
    const W = this.width - 2 * B;
    const H = this.height - 2 * B;

    let scale: number;
    if (W / H > w / h) {
      scale = H / h;
    } else {
      scale = W / w;
    }

    this.tx = (x) => x * scale + B;
    this.ty = (y) => y * scale + B;
  }
  setWallGeometry(geo: Point[]) {
    this.wallGeometry = geo;

    if (!this.wallPath) {
      this.wallPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      this.svg.appendChild(this.wallPath);
    }

    this.calculateTransform();

    this.wallPath.setAttribute(
      "d",
      this.wallGeometry.map((p, i) => {
        const x = this.tx(p.x);
        const y = this.ty(p.y);
        return `${i == 0 ? "M" : "L"}${x},${y}`;
      }).join(" ") + " Z",
    );

    if (this.clients.length) {
      this.renderClients();
    }
  }
  newClient(d: string, render = true) {
    this.clients.push({
      id: d,
      rect: d.split(",").map((n: string) => Number(n)),
      element: this.makeEl(),
    });

    if (render && this.wallGeometry) {
      this.renderClients();
    }
  }
  renderClients() {
    for (const c of this.clients) {
      if (!c.element.parentNode) {
        const rect = c.element.firstElementChild!;
        const rectStrokeWidth = 1;
        rect.setAttribute("x", String(this.tx(c.rect[0]) + rectStrokeWidth));
        rect.setAttribute("y", String(this.ty(c.rect[1]) + rectStrokeWidth));
        rect.setAttribute(
          "width",
          String(this.tx(c.rect[2]) - this.tx(0) - 2 * rectStrokeWidth),
        );
        rect.setAttribute(
          "height",
          String(this.ty(c.rect[3]) - this.ty(0) - 2 * rectStrokeWidth),
        );

        const text = rect.nextElementSibling!;
        text.textContent = c.id;
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("alignment-baseline", "central");
        text.setAttribute("x", String(this.tx(c.rect[0] + c.rect[2] / 2)));
        text.setAttribute("y", String(this.ty(c.rect[1] + c.rect[3] / 2)));

        c.element.addEventListener("click", () => {
          if (c.element.getAttribute("class") != "loading") {
            c.element.setAttribute("class", "loading");
            const id = String(snapshotReqId++);
            this.pendingSnapshots.add({
              id,
              timeout: setTimeout(() => {
                // Remove pending snapshot after the timeout.
                const s = [...this.pendingSnapshots].find((s) => s.id == id);
                if (s) {
                  const time = this.now();
                  this.errorController.error({
                    client: "status",
                    message: `Snapshot id: ${id} timed out!`,
                    args: [{
                      module: "snapshot",
                      timestampSinceModuleStart: 0,
                      timestamp: time,
                    }],
                    namespace: "",
                    channel: "snapshot",
                    severity: 0,
                    timestamp: time,
                  });
                  this.pendingSnapshots.delete(s);
                  c.element.setAttribute("class", "failed");
                }
              }, 5000),
            });
            this.takeSnapshotFn({ client: c.id, id });
          }
        });

        this.svg.appendChild(c.element);
      }
    }
  }
  takeSnapshotRes(res: TakeSnapshotResponse) {
    // Is this a valid snapshot request?
    const validRequest = [...this.pendingSnapshots].find((s) => s.id == res.id);
    if (validRequest) {
      this.pendingSnapshots.delete(validRequest);
    } else {
      const time = this.now();
      this.errorController.error({
        client: "status",
        message: `Snapshot received unknown res (id: ${res.id})!`,
        args: [{
          module: "snapshot",
          timestampSinceModuleStart: 0,
          timestamp: time,
        }],
        namespace: "",
        channel: "snapshot",
        severity: 0,
        timestamp: time,
      });
      return;
    }
    const c = this.clients.find((c) => c.id == res.client)!;
    const groupEl = c.element;
    // Is there any data in this response?
    if (res.data) {
      // We got a snapshot! Make an image.
      const buffer = new Uint8ClampedArray(res.data);

      // Check if the buffer is totally transparent! This is an error condition.
      const allEmpty = buffer.every((b) => !b);
      if (allEmpty) {
        // We asked for an image... we got an empty array!
        // TODO(applmak): Update text or something.
        groupEl.setAttribute("class", "failed");
        const time = this.now();
        this.errorController.error({
          client: "status",
          message: "Snapshot failed: All pixels are empty!",
          args: [{
            module: "snapshot",
            timestampSinceModuleStart: 0,
            timestamp: time,
          }],
          namespace: "",
          channel: "snapshot",
          severity: 0,
          timestamp: time,
        });
      } else {
        const data = new ImageData(
          buffer,
          res.width!,
          buffer.length / 4 / res.width!,
        );
        const canvas = document.createElement("canvas");
        canvas.width = data.width;
        canvas.height = data.height;
        const context = canvas.getContext("2d")!;
        context.putImageData(data, 0, 0);
        const url = canvas.toDataURL("image/png");

        Array.from(groupEl.querySelectorAll("image")).forEach((e) =>
          e.remove()
        );
        const image = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "image",
        );
        image.setAttribute("href", url);
        image.setAttribute("x", String(this.tx(c.rect[0])));
        image.setAttribute("y", String(this.ty(c.rect[1])));
        image.setAttribute(
          "width",
          String(this.tx(c.rect[0] + c.rect[2]) - this.tx(c.rect[0])),
        );
        image.setAttribute(
          "height",
          String(this.ty(c.rect[1] + c.rect[3]) - this.ty(c.rect[1])),
        );
        groupEl.appendChild(image);

        groupEl.removeAttribute("class");
      }
    } else {
      groupEl.setAttribute("class", "failed");
      const time = this.now();
      this.errorController.error({
        client: "status",
        message:
          `Snapshot contained no data! Perhaps the module doesn't support snapshots?`,
        args: [{
          module: "snapshot",
          timestampSinceModuleStart: 0,
          timestamp: time,
        }],
        namespace: "",
        channel: "snapshot",
        severity: 0,
        timestamp: time,
      });
    }
  }
  lostClient(c: string) {
    const i = this.clients.findIndex((client) => client.id == c);
    if (i >= 0) {
      this.clients[i].element.remove();
      this.clients.splice(i, 1);
    }
  }
  disconnect() {
    for (const client of this.clients) {
      client.element.remove();
    }
    this.clients.length = 0;
    this.wallPath = undefined;
  }
}
