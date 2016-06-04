/* Copyright 2015 Google Inc. All Rights Reserved.

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
 *   be configured by setting "title" to a string in the module config.
 *   "author" can optionally be set to a string to show the author as well.
 *   Example:
 *     {
 *       "name": "balls",
 *       "path": "demo_modules/balls/balls.js",
 *       "title": "Bouncing Balls",
 *       "author": "Matt Handley"
 *     },
 *
 * - Image Card: Shows a custom image over that client.  It can be configured by
 *   setting "title" to an object containing a "path" field which corresponds to
 *   a local file path relative to the install root. Any image format supported
 *   by chrome is valid.
 *   Example:
 *     {
 *       "name": "balls",
 *       "path": "demo_modules/balls/balls.js",
 *       "title": {"path": "local/path/to/title.png"}
 *       "author": "Matt Handley"
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

define(function(require) {
  'use strict';
  var asset = require('client/asset/asset');
  var parsedLocation = require('client/util/location');

  function makeEmptyTitleCard() {
    var elem = document.createElement('div');
    elem.id = 'title-card';
    return elem;
  }

  function makeDefaultTitleCard(config) {
    var elem = makeEmptyTitleCard();
    if (typeof config.title === 'string') {
      elem.innerHTML = `<div>${config.title}</div>
          <div>${config.author}</div>`;
    } else if (config.title && typeof config.title.path === 'string') {
      elem.innerHTML = `<img src="${asset(config.title.path)}">`;
    }
    return elem;
  }

  class TitleCard {
    constructor(config) {
      this.config = config;
      this.inDocument_ = false;
      this.elem_ = makeDefaultTitleCard(config);
    }

    replaceCard_(newCard) {
      if (this.inDocument_) {
        this.elem_.parentNode.replaceChild(newCard, this.elem_);
      }
      this.elem_ = newCard;
      return this.elem_;
    }

    // Creates a global API instance for use by the module code.
    getModuleAPI() {
      var card = this;
      // This is the titleCard API provided to modules.
      return {
        // Creates a custom (empty) card and returns a reference to the caller.
        useCustomCard: function() {
          return card.replaceCard_(makeEmptyTitleCard());
        },
        // Creates a standard (config-based) card and returns a reference to the
        // caller.
        useDefaultCard: function() {
          return card.replaceCard_(makeDefaultTitleCard(card.config));
        },
      };
    }

    // Called by the framework when the module has faded in.
    enter() {
      if (this.isTitleClient() && !this.inDocument_) {
        document.body.insertBefore(this.elem_, document.body.firstChild);
        this.inDocument_ = true;
      }
    }

    // Called by the framework when the module is fading out.
    exit() {
      if (this.isTitleClient() && this.inDocument_) {
        this.elem_.remove();
        this.inDocument_ = false;
      }
    }

    isTitleClient() {
      return !!parsedLocation.title;
    }
  }
  return TitleCard;
});
