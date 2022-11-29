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

/**
 * @fileoverview API for displaying a standard or custom title card.
 *
 * Control of the title card display is controlled by the environment -- only
 * one client is identified as the title display (by setting title=1 on the
 * request). Modules can use a standard title card by setting their module
 * config:
 *
 * - Author/Title Card: Shows a title and author for the current module. It can
 *   be configured by setting "title" to a string in the "credit" object of the
 *   module config. "author" can optionally be set to a string to show the
 *   author as well.
 *   Example:
 *     {
 *       "name": "balls",
 *       "path": "demo_modules/balls/balls.js",
 *       "credit": {
 *         "title": "Bouncing Balls",
 *         "author": "Matt Handley"
 *       }
 *     },
 *
 * - Image Card: Shows a custom image over that client.  It can be configured by
 *   setting "credit" to an object containing an "image" field which corresponds
 *   to a file that will be found via the `asset` function. Any image format
 *   supported by Chrome is valid.
 *   Example:
 *     {
 *       "name": "balls",
 *       "path": "demo_modules/balls/balls.js",
 *       "credit": {
 *         "image": "local/path/to/title.png"
 *       }
 *     }
 * - Custom Card: Cilents can implement their own custom title card using the
 *   titleCard API from their module. useCustomCard() will return a reference to
 *   the title card element. This will be a full-screen semi-transparent black
 *   div (as in the Author/Title Card) with an id="title-card" and
 *   class="custom-title-card".  At any time, the custom card can be replaced
 *   with the config-based card by calling titleCard.useDefaultCard();
 *   Example:
 *     class BallsClient extends ModuleInterface.Client {
 *       constructor(config) { }
 *       willBeShownSoon(container, deadline) {
 *         var customCard = titleCard.useCustomCard();
 *         // Add content to customCard and set styles on it.
 *         // The framework will take care of showing/hiding it at the right
 *         // time.
 *       }
 *     }
 */

import asset from "./asset/asset.ts";

export interface CreditAuthorTitleJson {
  title: string;
  author?: string;
}

export interface CreditImageJson {
  image: string;
}

export type CreditJson = CreditAuthorTitleJson | CreditImageJson;

export function isCreditAuthorTitleJson(
  credit: CreditJson,
): credit is CreditAuthorTitleJson {
  return !!((credit as CreditAuthorTitleJson).title);
}

export function isCreditImageJson(
  credit: CreditJson,
): credit is CreditImageJson {
  return !!((credit as CreditImageJson).image);
}

function makeEmptyTitleCard() {
  const elem = document.createElement("div");
  elem.id = "title-card";
  return elem;
}

function makeDefaultTitleCard(credit: CreditJson) {
  const elem = makeEmptyTitleCard();
  if (isCreditImageJson(credit)) {
    elem.innerHTML = `<img src="${asset(credit.image)}">`;
  } else if (credit.title && credit.author) {
    elem.innerHTML = `<div>${credit.title}</div>
        <div>${credit.author}</div>`;
  } else if (credit.title) {
    elem.innerHTML = `<div>${credit.title}</div>`;
  }

  return elem;
}

export class TitleCard {
  inDocument_ = false;
  elem_: HTMLElement;
  constructor(readonly credit: CreditJson) {
    this.elem_ = makeDefaultTitleCard(credit);
  }

  replaceCard_(newCard: HTMLElement) {
    if (this.inDocument_) {
      this.elem_.parentNode!.replaceChild(newCard, this.elem_);
    }
    this.elem_ = newCard;
    return this.elem_;
  }

  // Creates a global API instance for use by the module code.
  getModuleAPI() {
    // This is the titleCard API provided to modules.
    return {
      // Creates a custom (empty) card and returns a reference to the caller.
      useCustomCard: () => {
        return this.replaceCard_(makeEmptyTitleCard());
      },
      // Creates a standard (config-based) card and returns a reference to the
      // caller.
      useDefaultCard: () => {
        return this.replaceCard_(makeDefaultTitleCard(this.credit));
      },
    };
  }

  // Called by the framework when the module has faded in.
  enter() {
    if (this.isTitleClient() && !this.inDocument_) {
      // Only add the document to the page if there's something to be added.
      if (this.elem_.children.length) {
        document.body.insertBefore(this.elem_, document.body.firstChild);
        this.inDocument_ = true;
        // Shrink the fonts so that things don't wrap beyond the containing box.
        for (const e of Array.from(this.elem_.querySelectorAll("div"))) {
          // Read the initial font size:
          let fontSize = parseInt(window.getComputedStyle(e).fontSize);
          while (e.scrollWidth > this.elem_.offsetWidth) {
            fontSize *= 0.95;
            e.style.fontSize = `${fontSize.toFixed(2)}px`;
          }
        }
      }
    }
  }

  // Called by the framework when the module is fading out.
  exit() {
    if (this.isTitleClient() && this.inDocument_) {
      this.elem_.remove();
      this.inDocument_ = false;
    }
  }

  isTitleClient(): boolean {
    return !!new URL(window.location.href).searchParams.get("title");
  }
}
