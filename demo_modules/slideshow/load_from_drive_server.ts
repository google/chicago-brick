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

import { ContentId, ContentPage, DriveLoadConfig } from "./interfaces.ts";
import {
  FileList,
  FilesListOptions,
} from "https://googleapis.deno.dev/v1/drive:v3.ts";
import * as credentials from "../../server/util/credentials.ts";
import { JWTInput } from "https://googleapis.deno.dev/_/base@v1/auth/jwt.ts";
import { easyLog } from "../../lib/log.ts";
import { ServerLoadStrategy } from "./server_interfaces.ts";
import { TypedWebsocketLike } from "../../lib/websocket.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { GoogleAuth } from "../../server/util/authenticate_google_api.ts";

const log = easyLog("slideshow:drive");

async function driveFilesList(
  client: GoogleAuth,
  opts?: FilesListOptions,
): Promise<FileList> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files`);
  if (opts?.q !== undefined) {
    url.searchParams.append("q", opts.q);
  }
  if (opts?.pageToken !== undefined) {
    url.searchParams.append("pageToken", opts.pageToken);
  }
  const res = await fetch(url, {
    headers: new Headers(await client.getRequestHeaders()),
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(
      `Error when getting info about drive file: ${res.statusText}`,
    );
  }
  return await res.json() as FileList;
}

class DriveItemsDownloader {
  readonly driveIdStream: ReadableStream<ContentId[]>;
  constructor(
    readonly config: DriveLoadConfig,
    readonly client: GoogleAuth,
    readonly abortSignal: AbortSignal,
  ) {
    this.driveIdStream = new ReadableStream({
      async start(controller) {
        let itemCount = 0;
        if (config.fileIds) {
          itemCount += config.fileIds.length;
          controller.enqueue(config.fileIds.map((i) => {
            return {
              id: i,
            };
          }));
        }
        if (config.folderIds) {
          for (const folderId of config.folderIds) {
            let paginationToken = "";
            do {
              const req: FilesListOptions = {
                q: `'${folderId}' in parents`,
              };
              if (paginationToken) {
                req.pageToken = paginationToken;
              }
              const response = await driveFilesList(client, req);
              itemCount += response.files?.length || 0;
              log(
                `Downloaded ${itemCount} content ids in folder: ${folderId}`,
              );
              controller.enqueue(response.files?.map((i) => {
                return {
                  id: i.id!,
                };
              }));
              paginationToken = response.nextPageToken || "";
            } while (paginationToken && !abortSignal.aborted);
          }
        }
        // All done!
        controller.close();
      },
    });
  }
  start() {
    return this.driveIdStream.getReader();
  }
}

export class LoadFromDriveServerStrategy implements ServerLoadStrategy {
  readonly driveItemsDownloader: DriveItemsDownloader;
  driveItemReader?: ReadableStreamReader<ContentId[]>;

  constructor(
    readonly config: DriveLoadConfig,
    network: ModuleWSS,
    readonly abortSignal: AbortSignal,
  ) {
    const creds = credentials.get(
      this.config.creds || "googleserviceaccountkey",
    ) as JWTInput;
    const client = new GoogleAuth(creds);
    client.setScopes(["https://www.googleapis.com/auth/drive.readonly"]);

    this.driveItemsDownloader = new DriveItemsDownloader(
      config,
      client,
      abortSignal,
    );

    network.on("slideshow:drive:init", async (socket: TypedWebsocketLike) => {
      log("Received drive init for some client");
      const firstHeaders = await client.getRequestHeaders();
      socket.send("slideshow:drive:credentials", firstHeaders);
      for await (const headers of client.tokenIterator()) {
        log("Sending new creds");
        socket.send("slideshow:drive:credentials", headers);
      }
    });
  }
  async getBytes(contentId: ContentId): Promise<Uint8Array> {
    // Download the bytes associated with this.
    log(`Fetching bytes for: ${contentId.id}`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${contentId.id}?alt=media`,
      {
        headers: new Headers(
          await this.driveItemsDownloader.client.getRequestHeaders(),
        ),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Error downloading drive item: ${contentId.id}: ${res.statusText}`,
      );
    }
    const buf = await res.arrayBuffer();
    log(`Fetch complete for: ${contentId.id}`);
    return new Uint8Array(buf);
  }
  async loadMoreContent(): Promise<ContentPage> {
    if (!this.driveItemReader) {
      this.driveItemReader = this.driveItemsDownloader.start();
    }

    const { done, value } = await this.driveItemReader.read();

    if (done) {
      return { contentIds: [] };
    }
    return {
      contentIds: value,
      paginationToken: "please continue to download drive items",
    };
  }
}
