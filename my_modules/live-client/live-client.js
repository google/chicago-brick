//
// Confguration
//
var CODE_SERVER = "http://localhost:3001";

//
// Helper methods
//
function DefaultClientCode(x, y) {
  return `
  canvas.font =  "120px Arial";
  canvas.fillStyle = "white";
  canvas.textAlign = "center";
  canvas.textBaseline = "middle";
  canvas.fillText("Code server not available.", canvas.canvas.width/2, canvas.canvas.height/2);
  `;
}

function getClientKey(x,y) {
  return `${x},${y}`;
}
//
// Server Module
//
class LiveClientServer extends ServerModuleInterface {
  constructor(config) {
    super();
    this.log = require('debug')('module:live_client');

    var inst = this;
    this.codeServer = require('socket.io-client')(CODE_SERVER);

    // Keep all the client code so it can be sent to clients as needed.  This
    // will also be updated with new code when the code server sends it to us.
    this.clientCode = {};

    // Setup connection to code server.
    // TODO: These listeners are never removed, fix this.
    inst.codeServer.on('code', function(data) {
      // Make a unique key of the form 'x,y' so we can index a 1-D array for simplicity
      var key = getClientKey(data.client.x, data.client.y);
      inst.log(`Received new code for client(${key}).`);

      inst.clientCode[key] = data.code;

      // Forward code to clients.
      network.emit(`code(${key})`, data);
    });

    // Setup socket to receive code from code server.
    inst.codeServer.on('connect', function () {
      inst.log('Connected to code server.');
    });
    inst.codeServer.on('disconnect', function () {
      inst.log('Disconnected from code server.');
    });

    network.on('connection', function(socket) {
      socket.on('requestCode', function(data) {
        var key = getClientKey(data.client.x, data.client.y);
        inst.log(`Client(${key}) requested code.`);

        if (key in inst.clientCode) {
          inst.log(`Sending code to client(${key}).`);
          var response = {
            client: data.client,
            code: inst.clientCode[key] || DefaultClientCode(data.client.x, data.client.y)
          };
          network.emit(`code(${key})`, response);

        } else {
          // If there isn't any code yet, ask the code server. Any code
          // it sends back will be forwarded to clients automatically.
          inst.log(`Requesting code for client(${key}) from code server.`);
          inst.codeServer.emit('requestCode', { client: data.client });
        }
      });
    });
  }
}

//
// Client Module
//
class LiveClientClient extends ClientModuleInterface {
  finishFadeOut() {
    network.removeListener(this.newCodeEvent, this.newCodeHandler);

    if (this.surface) {
      this.surface.destroy();
    }
  }

  willBeShownSoon(container, deadline) {
    this.surface = new CanvasSurface(container, wallGeometry);
    this.canvas = this.extendCanvas(this.surface.context);

    // Client coordinates (offset in screens).
    var cx = this.surface.virtualOffset.x;
    var cy = this.surface.virtualOffset.y;

    // Use the default code until told otherwise.
    this.setClientCode("");

    // The event we listen to for new code.
    var inst = this;
    this.newCodeEvent = `code(${getClientKey(cx,cy)})`;
    this.newCodeHandler = function(data) {
      debug('Received new code.');
      inst.setClientCode(data.code);
    };

    network.on(this.newCodeEvent, this.newCodeHandler);

    // Ask for some code to run.
    network.emit('requestCode', { client: { x: cx, y: cy }});
  }

  extendCanvas(canvas) {
    canvas.writeText = function(x, y, text, style, font) {
      this.font = font;
      this.fillStyle = style;
      this.textAlign = "left";
      this.baseBaseline = "bottom";
      this.fillText(text, x, y);
    };

    canvas.draw = {
      rectangle: function(rect, style) {
        var l = rect.left || rect.x;
        var t = rect.top || rect.y;
        var w = rect.width || rect.w;
        var h = rect.height|| rect.h;

        canvas.fillStyle = style;
        canvas.fillRect(l, t, w, h);
      },
      circle: function(x, y, radius, style) {
        canvas.fillStyle = style;
        canvas.beginPath();
        canvas.arc(x, y, radius, 0, 2 * Math.PI);
        canvas.fill();
        canvas.stroke();
      }
    };

    return canvas;
  }

  setClientCode(code) {
    // TODO validate code
    this.client = {
      code: code,
      draw: new Function('canvas', 'time', 'globalTime', 'screen', code),
      time0: undefined,
      screen: { x: 0, y: 0, width: this.canvas.canvas.width, height: this.canvas.canvas.height },
    };
  }

  draw(time, delta) {
    this.canvas.draw.rectangle(this.client.screen, 'black');

    this.client.time0 = this.client.time0 || time;
    this.client.draw(this.canvas, time - this.client.time0, time, this.client.screen);
  }
}

register(LiveClientServer, LiveClientClient);