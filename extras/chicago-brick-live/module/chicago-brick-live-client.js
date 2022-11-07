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
import {CanvasSurface} from '/client/surface/canvas_surface.ts';
import {Client} from '/client/modules/module_interface.ts';

export function load(debug, network, wallGeometry) {
  const HIGHLIGHT_COLORS = ['#3cba54', '#f4c20d', '#db3236', '#4885ed'];

  //
  // Helper methods
  //
  function clientCodeError(message) {
    return `canvas.writeText(screen.width/2, screen.height/2-300, "Chicago Brick Live - Code Error", "#d50f25", "120px Arial", {textAlign: "center"});
  canvas.writeText(screen.width/2, screen.height/2, "${message}", "white", "80px Arial", {textAlign: "center"});
  canvas.draw.image(10, 10, "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png", 0.5);`;
  }

  function getClientKey(client) {
    return `${client.x},${client.y}`;
  }

  // Code sandboxing
  function sandboxCode(defaultParams, code) {
    class Sandbox {
      constructor(defaultParams, code) {
        this._varNames = Object.keys(defaultParams);
        this._defaultParams = defaultParams;
        let varsAndCode = this._varNames.concat([code]);
        this._function = Function.apply(null, varsAndCode);
      }

      call(params) {
        // Get the params in the same order as this._function was created.  Use
        // the default values a parameter is not in params.
        const defaultedParams  = this._varNames.map(k => (k in params) ? params[k] : this._defaultParams[k]);
        return this._function.apply(null, defaultedParams);
      }
    }

    let sandbox = new Sandbox(defaultParams, code);
    return function(params) { sandbox.call(params); };
  }

  //
  // Client helpers
  //

  // code.org style artist for drawing lines.
  class Artist {
      constructor(canvas) {
          this.canvas = canvas;
          this.pos = { x: 0, y: 0 };
          this.angle = 90; // "Looking" right

          this.lineWidth = 5;
          this.style = 'white';

          this.drawingInProgress = false;
      }

      setLineWidth(w) {
        if (this.lineWidth != w) {
          // Execute any incomplete drawing.
          this.draw();
          this.lineWidth = w;
        }
        return this;
      }

      setStyle(s) {
        if (this.style != s) {
          // Execute any incomplete drawing.
          this.draw();
          this.style = s;
        }
        return this;
      }

      _beginDrawIfNeeded() {
        if (!this.drawingInProgress) {
          this.canvas.save();
          this.canvas.beginPath();
          this.canvas.moveTo(this.pos.x, this.pos.y);
          this.drawingInProgress = true;
        }
      }

      _newPosition(distance) {
          return {
              x: this.pos.x + distance * Math.sin(this.angle * Math.PI / 180),
              y: this.pos.y + distance * Math.cos(this.angle * Math.PI / 180)
          };
      }

      // Turn by a specified number of degrees.
      turn(deltaDegrees) {
        this.angle += deltaDegrees;
        return this;
      }

      // Turn to an angle.
      turnTo(degrees) {
        this.angle = degrees;
        return this;
      }

      // Move drawing a line.
      move(distance) {
          this._beginDrawIfNeeded();
          this.pos = this._newPosition(distance);
          this.canvas.lineTo(this.pos.x, this.pos.y);
          return this;
      }

      // Move to a specific spot.
      moveTo(x, y) {
          this._beginDrawIfNeeded();
          this.pos = { x: x, y: y };
          this.canvas.lineTo(this.pos.x, this.pos.y);
          return this;
      }

      // Jump a distance without drawing a line
      jump(distance) {
          this.pos = this._newPosition(distance);
          this.canvas.moveTo(this.pos.x, this.pos.y);
          return this;
      }

      // Jump to a specific spot.
      jumpTo(x, y) {
          this.pos = { x: x, y: y };
          this.canvas.moveTo(this.pos.x, this.pos.y);
          return this;
      }

      draw() {
          if (this.drawingInProgress) {
              this.canvas.strokeStyle = this.style;
              this.canvas.lineWidth = this.lineWidth;
              this.canvas.stroke();

              // Drawing is done, anything else is a new drawing.
              this.drawingInProgress = false;
              this.canvas.restore();
          }
          return this;
      }
  }

  //
  // Client Module
  //
  class ChicagoBrickLiveClient extends Client {
    finishFadeOut() {
      if (this.surface) {
        this.surface.destroy();
      }
    }

    async willBeShownSoon(container) {
      this.surface = new CanvasSurface(container, wallGeometry);
      this.canvas = this.extendCanvas(this.surface.context);
      this.screen = { x: 0, y: 0, width: this.canvas.canvas.width, height: this.canvas.canvas.height };

      // Basic client info.
      this.client = {
            x: this.surface.virtualOffset.x,
            y: this.surface.virtualOffset.y,
      };

      // Use the default code until told otherwise.
      this.setClientCode({ code: "", controlled: false });

      // The event we listen to for new code.
      this.newCodeEvent = `code(${getClientKey(this.client)})`;
      network.on(this.newCodeEvent, this.setClientCode.bind(this));

      // Ask for some code to run.
      network.send('requestCode', { client: this.client });
    }

    extendCanvas(canvas) {
      canvas._imageCache = {};

      canvas.writeText = function(x, y, text, style, font, extraProps) {
        Object.assign(this, {textAlign: "left"}, extraProps);

        this.font = font || "120px Arial";
        this.fillStyle = style || "white";
        this.baseBaseline = "bottom";
        this.fillText(text, x, y);
      };

      canvas.draw = {
        image: function(x, y, url, scale) {
          scale = scale || 1;

          // Only load each image once since everything is done in the draw loop.
          let image = canvas._imageCache[url];

          if (!image) {
            image = new Image();
            image.src = url;
            canvas._imageCache[url] = image;
          }

          canvas.drawImage(image, x, y, scale * image.width, scale * image.height);
        },
        line: function(x1, y1, x2, y2, style, lineWidth) {
          canvas.strokeStyle = style || "white";
          canvas.lineWidth = lineWidth || 5;
          canvas.beginPath();
          canvas.moveTo(x1, y1);
          canvas.lineTo(x2, y2);
          canvas.stroke();
        },
        rectangle: function(rect, style) {
          canvas.fillStyle = style || "white";
          canvas.fillRect(rect.left || rect.x, rect.top || rect.y,
                          rect.width || rect.w, rect.height|| rect.h);
        },
        circle: function(x, y, radius, style) {
          canvas.fillStyle = style || "white";
          canvas.beginPath();
          canvas.arc(x, y, radius, 0, 2 * Math.PI);
          canvas.fill();
        }
      };

      return canvas;
    }

    setClientCode(clientCode) {
      // Merge the new client code with the existing.
      this.clientCode = Object.assign(this.clientCode || {}, clientCode, { time0: undefined });

      try {
        // Draw params.
        let defaultParams = {
          canvas: this.canvas,
          time: undefined,
          globalTime: undefined,
          screen: this.screen,
          artist: null,
        };

        this.clientCode.draw = sandboxCode(defaultParams, this.clientCode.code);
      } catch (e) {
        // If there is a syntax error sandboxCode will fail, replace code with
        // error message.
        this.setClientCode({ code: clientCodeError(e.message) });
      }
    }

    draw(time) {
      this.clientCode.time0 = this.clientCode.time0 || time;
      this.canvas.draw.rectangle(this.screen, 'black');

      this.canvas.save();
      try {
        const params = {
            time: time - this.clientCode.time0,
            globalTime: time,
            artist: new Artist(this.canvas)
        };

        // Put the artist in the middle of the screen.
        params.artist.jumpTo(this.screen.width/2, this.screen.height/2);

        // Run client drawing code.
        this.clientCode.draw(params);

        // Finish any artist drawing.
        params.artist.draw();
      } catch (e) {
        // If there is a runtime error, replace code with error message.
        this.setClientCode({ code: clientCodeError(e.message) });
      }
      this.canvas.restore();

      // Draw client info.
      this.canvas.writeText(10, this.screen.height-20, getClientKey(this.client), "white", "40px Arial");
      if (this.clientCode.controlled) {
        this.canvas.save();
        this.canvas.strokeStyle = HIGHLIGHT_COLORS[(this.client.x + this.client.y) % HIGHLIGHT_COLORS.length];
        this.canvas.lineWidth = 10;
        this.canvas.strokeRect(0,0, this.screen.width, this.screen.height);
        this.canvas.restore();
      }
    }
  }

  return {client: ChicagoBrickLiveClient};
}
