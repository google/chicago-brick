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

import { Surface } from "../../client/surface/surface.ts";
import { Rectangle } from "../../lib/math/rectangle.ts";
import { WS } from "../../lib/websocket.ts";
import {
  ClientDisplayStrategy,
  ClientLoadStrategy,
  Content,
} from "./client_interfaces.ts";
import { FullscreenDisplayConfig } from "./interfaces.ts";
import * as time from "../../lib/adjustable_time.ts";
import { delay } from "../../lib/promise.ts";
import { LoadLocalClientStrategy } from "./load_local_client.ts";
import { easyLog } from "../../lib/log.ts";

const log = easyLog("slideshow:fullscreen");

function makeInfoElement() {
  const info = document.createElement("div");
  info.id = "fullscreen-info";
  info.style.position = "absolute";
  info.style.left = "0";
  info.style.right = "0";
  info.style.top = "0";
  info.style.bottom = "0";
  info.style.color = "white";
  info.style.font = "bolder 18px monospace";
  info.style.whiteSpace = "pre-wrap";
  return info;
}

function clearElement(el: Element) {
  while (el.firstChild) {
    el.firstChild.remove();
  }
}

export class FullscreenDisplayStrategyClient implements ClientDisplayStrategy {
  // The fullscreen display strategy only shows one piece of content at a time.
  content?: Content;
  readonly infoEl = makeInfoElement();
  nextDeadline = 0;

  // If the server split content for us, we need the local client strategy to load them.
  readonly localLoadStrategy: LoadLocalClientStrategy;
  constructor(
    readonly config: FullscreenDisplayConfig,
    readonly loadStrategy: ClientLoadStrategy,
    readonly network: WS,
    readonly surface: Surface,
  ) {
    this.localLoadStrategy = new LoadLocalClientStrategy({}, surface, network);
    this.surface.container.appendChild(this.infoEl);
    network.on("slideshow:fullscreen:content", async (contentId, deadline) => {
      log(`Loading ${contentId.id}`);
      this.infoEl.style.color = "white";
      this.infoEl.textContent = `Loading ${contentId.id}...`;

      this.nextDeadline = deadline;

      if (this.config.presplit || this.config.split) {
        const [dir, ext] = contentId.id.split("|");
        contentId.id =
          `${dir}/r${this.surface.virtualOffset.y}c${this.surface.virtualOffset.x}${ext}`;
      }

      let content;
      try {
        if (contentId.local) {
          // If it's local, use the local content strategy to load the content.
          content = await this.localLoadStrategy.loadContent(contentId);
        } else {
          content = await this.loadStrategy.loadContent(
            contentId,
            this.surface,
          );
        }
      } catch (e) {
        this.infoEl.style.color = "red";
        this.infoEl.textContent = e.stack;
        return;
      }

      // Given the config, figure out where this might be positioned.
      const rect = this.calculateContentPosition(content);

      const el = content.element;

      // Create a transform that maps the content to the calculated rect (and then onto the surface).
      const scaleXContentToRect = rect.w / content.width;
      const scaleYContentToRect = rect.h / content.height;

      // Create a transform from the virtual space onto the real surface (which may be quite a bit smaller than the virtualRect).
      const scaleXVirtualToReal = this.surface.container.offsetWidth /
        this.surface.virtualRect.w;
      const scaleYVirtualToReal = this.surface.container.offsetHeight /
        this.surface.virtualRect.h;

      const offsetXContentToRect =
        content.width / 2 * (scaleXContentToRect * scaleXVirtualToReal - 1) +
        rect.x * scaleXVirtualToReal;
      const offsetYContentToRect =
        content.height / 2 * (scaleYContentToRect * scaleYVirtualToReal - 1) +
        rect.y * scaleYVirtualToReal;

      // All together, this is a transform
      el.style.transform =
        `translate(${offsetXContentToRect}px, ${offsetYContentToRect}px) scale(${
          scaleXContentToRect * scaleXVirtualToReal
        }, ${scaleYContentToRect * scaleYVirtualToReal})`;

      await delay(time.until(deadline));

      clearElement(this.surface.container);
      this.surface.container.appendChild(el);

      this.content = content;
    });
    network.send(
      "slideshow:fullscreen:content_req",
      this.surface.virtualOffset,
    );
  }
  draw(time: number, delta: number) {
    this.content?.draw?.(this.nextDeadline, time, delta);
  }

  calculateContentPosition(content: Content): Rectangle {
    let scaleStrategy = this.config.scale || "fit";
    const surfaceScale = this.surface.virtualRect.w /
      this.surface.virtualRect.h;
    const contentScale = content.width / content.height;

    if (this.config.split) {
      scaleStrategy = "stretch";
    }

    switch (scaleStrategy) {
      case "fit":
      case "full": {
        // "fit": Fit the content box just inside of the surface box.
        // "full": Fill every pixel on the surface.
        const heightIsLimitingFactor =
          (scaleStrategy === "fit" && surfaceScale > contentScale) ||
          (scaleStrategy === "full" && surfaceScale < contentScale);
        if (heightIsLimitingFactor) {
          const updatedWidth = content.width / content.height *
            this.surface.virtualRect.h;
          // Center this in the surface.
          return Rectangle.centeredAt(
            this.surface.virtualRect.w / 2,
            this.surface.virtualRect.h / 2,
            updatedWidth,
            this.surface.virtualRect.h,
          );
        } else {
          const updatedHeight = content.height / content.width *
            this.surface.virtualRect.w;
          // Center this in the surface.
          return Rectangle.centeredAt(
            this.surface.virtualRect.w / 2,
            this.surface.virtualRect.h / 2,
            this.surface.virtualRect.w,
            updatedHeight,
          );
        }
      }
      case "stretch": {
        return new Rectangle(
          0,
          0,
          this.surface.virtualRect.w,
          this.surface.virtualRect.h,
        );
      }
    }
  }
}
