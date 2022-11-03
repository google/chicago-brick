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

import { Content, ContentId, ContentPage, DriveConfig } from "./interfaces.ts";
import { PromiseCache } from "../../lib/promise_cache.ts";
import {
  Drive,
  File,
  FileList,
  FilesGetOptions,
  FilesListOptions,
} from "https://googleapis.deno.dev/v1/drive:v3.ts";
import * as credentials from "../../server/util/credentials.ts";
import { JWTInput } from "https://googleapis.deno.dev/_/base@v1/auth/jwt.ts";
import { easyLog } from "../../lib/log.ts";
import { ServerLoadStrategy } from "./server_interfaces.ts";
import { TypedWebsocketLike } from "../../lib/websocket.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { GoogleAuth } from "./authenticate_google_api.ts";

const log = easyLog("slideshow:drive");

interface FilesGetOptionsWithFields extends FilesGetOptions {
  fields?: string;
}

async function drivefilesGet(
  client: GoogleAuth,
  fileId: string,
  opts: FilesGetOptionsWithFields = {},
): Promise<File> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  if (opts.fields !== undefined) {
    url.searchParams.append("fields", opts.fields);
  }
  const res = await fetch(url, {
    headers: new Headers(await client.getRequestHeaders()),
    method: "GET",
  });
  if (!res.ok) {
    const s = await res.json();
    throw new Error(
      `Error when getting info about drive file: ${res.statusText}: ${
        JSON.stringify(s, undefined, 2)
      }`,
    );
  }
  return await res.json() as File;
}

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
    readonly config: DriveConfig,
    readonly drive: Drive,
    readonly client: GoogleAuth,
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
            } while (paginationToken);
          }
        }
        // All done!
        controller.close();
      },
    });
  }
  start() {
    return this.driveIdStream;
  }
}

// LOAD FROM DRIVE STRATEGY
// Here, we specify the server & client strategies that can load images from a
// drive folder passed in the config. The drive folder should be shared
// publicly or with the appropriate credentials.
// TODO(applmak): Make the server-side filter out things the client can't
// display.
// TODO(applmak): Maybe make the server-side smarter about subfolders so as to
// create collections that should play, rather than needing to change the config
// every time.
// Config:
//   folderId: string - Drive folder ID from which to retrieve files.
//   fileId: string - Drive file ID that is the file to download.
//       Can't be specified with folderId.
export class LoadFromDriveServerStrategy implements ServerLoadStrategy {
  readonly drive: Drive;
  readonly inflightCache = new PromiseCache<string, Content>();
  // In-flight content cache: A cache for content in-flight. Note that as
  // soon as the data is downloaded, it's removed from this cache.
  readonly inflightContent = new Map<string, Promise<Uint8Array>>();

  readonly driveItemsDownloader: DriveItemsDownloader;
  driveItemReader?: ReadableStreamReader<ContentId[]>;

  constructor(readonly config: DriveConfig, network: ModuleWSS) {
    const creds = credentials.get(
      this.config.creds || "googleserviceaccountkey",
    ) as JWTInput;
    const client = new GoogleAuth(creds);
    client.setScopes(["https://www.googleapis.com/auth/drive.readonly"]);
    this.drive = new Drive(client);

    this.driveItemsDownloader = new DriveItemsDownloader(
      config,
      this.drive,
      client,
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
  async loadMoreContent(): Promise<ContentPage> {
    if (!this.driveItemReader) {
      this.driveItemReader = this.driveItemsDownloader.start().getReader();
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
