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

import * as wallGeometry from "./util/wall_geometry.ts";
import * as time from "../lib/adjustable_time.ts";
import * as network from "./network/network.ts";
import { getErrors } from "./util/last_n_errors_logger.ts";
import { WSS } from "./network/websocket.ts";
import { easyLog } from "../lib/log.ts";
import { PlaylistDriver } from "./playlist/playlist_driver.ts";
import { Layout, LayoutConfig } from "./modules/layout.ts";
import { WS } from "../lib/websocket.ts";
import { DispatchServer } from "./util/serving.ts";
import { library } from "./modules/library.ts";
import { loadLayoutsFromConfig } from "./playlist/playlist_loader.ts";
import { BrickJson } from "./playlist/playlist.ts";

const log = easyLog("wall:control");

interface TakeSnapshotRequest {
  client: string;
}

interface NewPlaylistRequest {
  playlist: LayoutConfig[];
  moduleConfig: Record<string, BrickJson>;
}

// Basic server management hooks.
// This is just for demonstration purposes, since the real server
// will not have the ability to listen over http.
export class Control {
  constructor(
    readonly playlistDriver: PlaylistDriver,
    readonly initialPlaylist: Layout[],
  ) {
  }

  installHandlers(server: DispatchServer) {
    const wss = new WSS({ server, path: "/control" });
    let transitionData: unknown = {};
    this.playlistDriver.on("transition", (data: unknown) => {
      transitionData = data;
      wss.sendToAllClients("transition", data);
    });
    network.on("new-client", (client) => {
      wss.sendToAllClients("new-client", client.rect.serialize());
      client.socket.on("takeSnapshotRes", (res: unknown) => {
        log("Got snapshot result.");
        wss.sendToAllClients("takeSnapshotRes", res);
      });
      client.socket.on("record-error", (err: unknown) => {
        wss.sendToAllClients("error", err);
      });
      client.socket.on("disconnect", () => {
        wss.sendToAllClients("lost-client", client.rect.serialize());
      });
    });
    wss.on("connection", (socket: WS) => {
      // When we transition to a new module, let this guy know.
      socket.send("time", { time: time.now() });
      socket.send("transition", transitionData);
      socket.send(
        "clients",
        Object.values(network.clients).map((c) => c.rect.serialize()),
      );
      socket.send("wallGeometry", wallGeometry.getGeo().points);
      socket.send("errors", getErrors());

      socket.on("takeSnapshot", (req: TakeSnapshotRequest) => {
        const client = Object.values(network.clients).find((c) =>
          c.rect.serialize() == req.client
        );
        if (client) {
          client.socket.send("takeSnapshot", req);
        } else {
          socket.send("takeSnapshotRes", {
            ...req,
            error: `Client ${req.client} not found`,
          });
        }
      });
      socket.on("newPlaylist", (data: NewPlaylistRequest) => {
        const { playlist, moduleConfig } = data;
        console.log(moduleConfig);
        library.loadAllModules(Object.values(moduleConfig));
        const layouts = loadLayoutsFromConfig(playlist);
        this.playlistDriver.setPlaylist(layouts);
      });
      socket.on("resetPlaylist", () => {
        this.playlistDriver.setPlaylist(this.initialPlaylist);
      });
    });
    wss.sendToAllClients("time", { time: time.now() });
    setInterval(() => {
      wss.sendToAllClients("time", { time: time.now() });
    }, 20000);
  }
}
