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

import * as monitor from "./monitoring/monitor.ts";
import * as network from "./network/network.ts";
import * as stateManager from "./network/state_manager.ts";
import { makeConsoleLogger } from "../lib/console_logger.ts";
import { addLogger, easyLog } from "../lib/log.ts";
import * as time from "../lib/adjustable_time.ts";
import { errorLogger } from "./util/error_logger.ts";
import { ClientModulePlayer } from "./modules/client_module_player.ts";
import { ClientModule } from "./modules/module.ts";
import { consoleLogger } from "./util/console_logger.ts";
import "./network/peer.ts";
import { LoadModuleEvent } from "./modules/events.ts";

const log = easyLog("wall:client");

addLogger(makeConsoleLogger(consoleLogger, time.now));
addLogger(errorLogger);

stateManager.init();

if (new URL(window.location.href).searchParams.get("monitor")) {
  monitor.enable();
}

const modulePlayer = new ClientModulePlayer();

// If we disconnect, go to _empty.
network.socket.on("disconnect", () => {
  log("Client disconnected. Going to empty module.");
  modulePlayer.playModule(ClientModule.newEmptyModule(time.now()));
});

// Server has asked us to load a new module.
network.socket.on(
  "loadModule",
  (bits: LoadModuleEvent) =>
    modulePlayer.playModule(ClientModule.deserialize(bits)),
);

network.socket.on("takeSnapshot", async (req) => {
  const oldModule = modulePlayer.oldModule as ClientModule;
  if (oldModule?.instance?.surface) {
    const image = oldModule.instance.surface.takeSnapshot();
    if (image) {
      // You can't draw an imagedata, so we convert to an imagebitmap.
      const WIDTH = 192;
      const HEIGHT = Math.floor(WIDTH / image.width * image.height);
      const bitmap = await createImageBitmap(image, {
        resizeWidth: WIDTH,
        resizeHeight: HEIGHT,
      });

      // We can't get the data of a bitmap, so we make a new canvas to get
      // back an imagedata.
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const smallData = context.getImageData(0, 0, WIDTH, HEIGHT);

      // And now, we get the array itself.
      network.socket.send("takeSnapshotRes", {
        data: Array.from(smallData.data),
        width: smallData.width,
        ...req,
      });
      return;
    }
  }
  console.error("snapshot failed", req);
  network.socket.send("takeSnapshotRes", { ...req });
});

export interface TakeSnapshotRequest {
  client: string;
  id: string;
}

export interface TakeSnapshotResponse extends TakeSnapshotRequest {
  data?: number[];
  width?: number;
  error?: string;
}

declare global {
  interface EmittedEvents {
    takeSnapshot(req: TakeSnapshotRequest): void;
    takeSnapshotRes(res: TakeSnapshotResponse): void;
  }
}
