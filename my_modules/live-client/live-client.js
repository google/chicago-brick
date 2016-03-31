var _ = require('underscore');

//
// Confguration
//
//var CODE_SERVER = "http://130.211.117.91:3001";
var CODE_SERVER = "http://localhost:3001";

//
// Helper methods
//
function DefaultClientCode(text) {
  return (
`canvas.writeText(screen.width/2, screen.height/2-300, "Chicago Brick Live!", "#f4c20d", "140px Arial", {textAlign: "center"});
canvas.writeText(screen.width/2, screen.height/2, "${text}", "white", "100px Arial", {textAlign: "center"});
canvas.draw.image(10, 10, "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png", 0.5);`
  );
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

    // All clients (x, y) that have ever connected.  Used to notify all clients
    // of global code changes (e.g., codeserver comes online) and cache code.
    this.clients = {};

    // Setup connection to code server.
    inst.codeServer.on('connect', function () {
      inst.log(`Connected to code server (${CODE_SERVER}).`);

      // When code server connection is made re-request code for all clients
      // we know about.
      // #TODO Is there any client list provided by brick?
      for (var key in inst.clients) {
        inst.requestCode(inst.clients[key].client);
      }
    });

    inst.codeServer.on('disconnect', function () {
      inst.log('Disconnected from code server.');
    });

    // TODO: These listeners are never removed, fix this.
    inst.codeServer.on('code', function(data) {
      // Make a unique key of the form 'x,y' so we can use a dictionary for clients.
      var key = getClientKey(data.client.x, data.client.y);
      inst.log(`Received new code for client(${key}).`);

      // Cache the code in case the code server goes away.
      inst.clients[key] = data;

      // Forward code to clients.
      network.emit(`code(${key})`, data);
    });

    // Handle connections from clients.
    network.on('connection', function(socket) {
      socket.on('requestCode', function(data) {

        var key = getClientKey(data.client.x, data.client.y);
        inst.log(`Client(${key}) requested code.`);
        inst.log(`Code server connected: ${inst.codeServer.connected}`);

        // Track the client
        inst.clients[key] = _.extend(inst.clients[key] || {}, { client: data.client });
        inst.clients[key] = _.defaults(inst.clients[key], { code: undefined });

        var response;

        if (inst.clients[key].code || !inst.codeServer.connected) {
          inst.log(`Sending cached code to client(${key}).`);
          response = _.defaults(inst.clients[key], {
            client: data.client,
            code: DefaultClientCode("No code server available")
          });

          network.emit(`code(${key})`, response);
        } else {
          // If there isn't any code yet, ask the code server. Any code
          // it sends back will be forwarded to clients automatically.
          inst.requestCode(data.client);
        }
      });
    });
  }

  requestCode(client) {
    // Request code from code server
    var key = getClientKey(client.x, client.y);
    this.log(`Requesting code for client(${key}) from code server.`);
    this.codeServer.emit('requestCode', { client: client });
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
    canvas._imageCache = {};

    canvas.writeText = function(x, y, text, style, font, extraProps) {
      _.extend(this, {textAlign: "left"}, extraProps);

      this.font = font || "120px Arial";
      this.fillStyle = style || "white";
      this.baseBaseline = "bottom";
      this.fillText(text, x, y);
    };

    canvas.draw = {
      image: function(x, y, url, scale) {
        scale = scale || 1;

        // Only load each image once since everything is done in the draw loop.
        var image = canvas._imageCache[url];

        if (!image) {
          image = new Image();
          image.src = url;
          canvas._imageCache[url] = image;
        }

        canvas.drawImage(image, x, y, scale * image.width, scale * image.height);
      },
      rectangle: function(rect, style) {
        var l = rect.left || rect.x;
        var t = rect.top || rect.y;
        var w = rect.width || rect.w;
        var h = rect.height|| rect.h;

        canvas.fillStyle = style || "white";
        canvas.fillRect(l, t, w, h);
      },
      circle: function(x, y, radius, style) {
        canvas.fillStyle = style || "white";
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
