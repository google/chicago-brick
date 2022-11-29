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
import { PlaylistDriver, TransitionData } from "./playlist/playlist_driver.ts";
import { TypedWebsocketLike } from "../lib/websocket.ts";
import { DispatchServer } from "./util/serving.ts";
import { library } from "./modules/library.ts";
import { loadLayoutsFromConfig } from "./playlist/playlist_loader.ts";
import { BrickJson, LayoutConfig } from "./playlist/playlist.ts";
import { RecordErrorMessage } from "../client/util/error_logger.ts";
import { Point } from "../lib/math/vector2d.ts";
import { TakeSnapshotRequest } from "../client/client.ts";

const log = easyLog("wall:control");

export interface NewPlaylistRequest {
  playlist: LayoutConfig[];
  moduleConfig: Record<string, BrickJson>;
}

// Basic server management hooks.
// This is just for demonstration purposes, since the real server
// will not have the ability to listen over http.
export class Control {
  constructor(readonly playlistDriver: PlaylistDriver) {
  }

  installHandlers(server: DispatchServer) {
    const wss = new WSS({ server, path: "/control" });
    let transitionData = {} as TransitionData;
    this.playlistDriver.on("transition", (data: TransitionData) => {
      transitionData = data;
      wss.send("transition", data);
    });
    network.wss.on("new-client", (client: network.ClientInfo) => {
      wss.send("control:new-client", client.rect.serialize());
      client.socket.on(
        "takeSnapshotRes",
        (
          res: { client: string; id: string; data?: number[]; width?: number },
        ) => {
          log("Got snapshot result.");
          wss.send("takeSnapshotRes", res);
        },
      );
      client.socket.on("record-error", (err: RecordErrorMessage) => {
        wss.send("error", err);
      });
      client.socket.on("disconnect", () => {
        wss.send("lost-client", client.rect.serialize());
      });
    });
    wss.on("connection", (socket: TypedWebsocketLike) => {
      log("Control connected.");
      // When we transition to a new module, let this guy know.
      socket.send("time", time.now());
      socket.send("transition", transitionData);
      socket.send(
        "clients",
        [...network.clients.values()].map((c) => c.rect.serialize()),
      );
      socket.send("wallGeometry", wallGeometry.getGeo().points);
      socket.send("errors", getErrors());

      socket.on("takeSnapshot", (req: TakeSnapshotRequest) => {
        const client = [...network.clients.values()].find((c) =>
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
        log(
          `Received updated configs for modules: ${
            Object.keys(moduleConfig).join(", ")
          }`,
        );
        library.loadAllModules(Object.values(moduleConfig));
        const layouts = loadLayoutsFromConfig(playlist);
        this.playlistDriver.setPlaylist(layouts);
      });
      socket.on("resetPlaylist", () => {
        this.playlistDriver.resetPlaylist();
      });
    });
    wss.send("time", time.now());
    setInterval(() => {
      wss.send("time", time.now());
    }, 20000);
  }
}

declare global {
  interface EmittedEvents {
    "control:new-client": (rect: string) => void;
    "lost-client": (rect: string) => void;
    transition(data: TransitionData): void;
    error(error: RecordErrorMessage): void;
    errors(errors: RecordErrorMessage[]): void;
    clients(clients: string[]): void;
    wallGeometry(points: Point[]): void;
    newPlaylist(req: NewPlaylistRequest): void;
    resetPlaylist(): void;
  }
}
