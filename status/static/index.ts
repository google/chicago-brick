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

import { ClientController } from "./client_controller.ts";
import { PlaylistController } from "./playlist_controller.ts";
import { ErrorController } from "./error_controller.ts";
import { PlaylistCreator } from "./playlist_creator.ts";
import { WS } from "../../lib/websocket.ts";
import { addLogger } from "../../lib/log.ts";
import { makeConsoleLogger } from "../../lib/console_logger.ts";
import { library } from "./library.ts";
import { BrickJson, LayoutConfig } from "../../server/playlist/playlist.ts";
import { RecordErrorMessage } from "../../client/util/error_logger.ts";
import { TransitionData } from "../../server/playlist/playlist_driver.ts";
import { consoleLogger } from "../../client/util/console_logger.ts";
import { NewPlaylistRequest } from "../../server/control.ts";

addLogger(makeConsoleLogger(consoleLogger, () => performance.now()));

let lastUpdateFromServer = 0;
let timeOfLastUpdateFromServer = window.performance.now();
let connected = false;
function getTime() {
  if (!connected) {
    return lastUpdateFromServer;
  }
  return lastUpdateFromServer + window.performance.now() -
    timeOfLastUpdateFromServer;
}
const host = new URL(location.href).searchParams.get("host") ||
  "localhost:3000";
const control = WS.clientWrapper(`ws://${host}/control`);
const creatorEl = document.querySelector("#playlist-creator")! as HTMLElement;

function applyNewPlaylist(playlist: LayoutConfig[] | "reset") {
  // TODO(applmak): Passing a string here is a bit hacky.
  if (playlist == "reset") {
    control.send("resetPlaylist");
  } else {
    const moduleConfig = [...library.entries()].reduce(
      (agg, [name, config]) => {
        agg[name] = config;
        return agg;
      },
      {} as Record<string, BrickJson>,
    );
    const req: NewPlaylistRequest = { playlist, moduleConfig };
    control.send("newPlaylist", req);
  }
}

const playlistCreator = new PlaylistCreator(creatorEl, applyNewPlaylist);
const playlistController = new PlaylistController(
  document.querySelector(".playlist-container")!,
  getTime,
);
const errorController = new ErrorController(document.querySelector("footer")!);
const clientController = new ClientController(
  document.querySelector(".diagram")!,
  (req: { client: string; id: string }) => control.send("takeSnapshot", req),
  errorController,
  getTime,
);

function convertMsDurationToText(ms: number) {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);

  return mins ? `${mins} minutes` : secs ? `${secs} seconds` : String(ms);
}

let transitionData = {} as TransitionData;
control.on("transition", (data) => {
  transitionData = data;

  const duration = data.nextDeadline - data.deadline;
  const moduleNameEl = document.querySelector("#module")!;
  moduleNameEl.textContent = data.module;
  const durationEl = document.querySelector("#duration")!;
  durationEl.textContent = convertMsDurationToText(duration);

  playlistController.updateTransitionData(data);
  playlistCreator.setLivePlaylist(data.layouts);
  for (const name in data.configMap) {
    library.set(name, data.configMap[name]);
  }
  playlistCreator.renderModuleConfig();
});
control.on("clients", (data) => {
  clientController.setClients(data);
});
control.on("connect", () => {
  connected = true;
  (document.querySelector("#disconnected-warning")! as HTMLElement).style
    .visibility = "hidden";
});
control.on("disconnect", () => {
  connected = false;
  (document.querySelector("#disconnected-warning")! as HTMLElement).style
    .visibility = "visible";
  playlistController.disconnect();
  errorController.disconnect();
  clientController.disconnect();
});
control.on("time", (time) => {
  lastUpdateFromServer = time;
  timeOfLastUpdateFromServer = window.performance.now();
});
control.on("error", (e) => {
  playlistController.error();
  errorController.error(e);
});
control.on("errors", (es: RecordErrorMessage[]) => {
  es.forEach((e) => {
    errorController.error(e);
  });
});
control.on("control:new-client", (c) => {
  clientController.newClient(c);
});
control.on("lost-client", (c) => {
  clientController.lostClient(c);
});
control.on("wallGeometry", (p) => {
  clientController.setWallGeometry(p);
});
control.on("takeSnapshotRes", (res) => {
  clientController.takeSnapshotRes(res);
});

const openCreatorEl = document.querySelector("#open-creator")!;
openCreatorEl.addEventListener("click", () => {
  playlistCreator.open();
});

const timeEl = document.querySelector("#time")!;
const remainingEl = document.querySelector("#remaining")!;
function render() {
  timeEl.textContent = getTime().toFixed(0);
  const remainingMs = transitionData.nextDeadline - getTime();
  if (remainingMs < 0) {
    remainingEl.textContent = `Fading (${-remainingMs})`;
    remainingEl.classList.add("transitioning");
  } else {
    remainingEl.classList.remove("transitioning");
    remainingEl.textContent = convertMsDurationToText(remainingMs);
  }

  playlistController.render();

  self.requestAnimationFrame(render);
}
render();
