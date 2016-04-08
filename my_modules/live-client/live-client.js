var _ = require('underscore');

//
// Confguration
//
let DEFAULT_CONFIG = {
  codeServer: "http://localhost:3001"
};

const HIGHLIGHT_COLORS = ['#3cba54', '#f4c20d', '#db3236', '#4885ed'];

//
// Helper methods
//
function DefaultClientCode(client, text) {
  return (
`canvas.writeText(screen.width/2, screen.height/2-300, "Chicago Brick Live!", "#f4c20d", "140px Arial", {textAlign: "center"});
canvas.writeText(screen.width/2, screen.height/2-150, "${text}", "white", "100px Arial", {textAlign: "center"});
canvas.writeText(screen.width/2, screen.height/2+50, "${client.x}, ${client.y}", "white", "180px Arial", {textAlign: "center"});
canvas.draw.image(10, 10, "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png", 0.5);`
  );
}

function ClientCodeError(message) {
  return (
`canvas.writeText(screen.width/2, screen.height/2-300, "Chicago Brick Live - Code Error", "#d50f25", "120px Arial", {textAlign: "center"});
canvas.writeText(screen.width/2, screen.height/2, "${message}", "white", "80px Arial", {textAlign: "center"});
canvas.draw.image(10, 10, "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png", 0.5);`
  );
}

function getClientKey(client) {
  return `${client.x},${client.y}`;
}
//
// Server Module
//
class LiveClientServer extends ServerModuleInterface {
  constructor(config) {
    super();
    this.log = require('debug')('module:live_client');

    this.config = _.defaults(config, DEFAULT_CONFIG);
    this.log(`Attempting to use codeserver at ${this.config.codeServer}`);

    // All clients (x, y) that have ever connected.  Used to notify all clients
    // of global code changes (e.g., codeserver comes online) and cache code.
    this.clients = {};

    var inst = this;
    this.codeServer = require('socket.io-client')(this.config.codeServer);

    // Setup connection to code server.
    inst.codeServer.on('connect', function () {
      inst.log(`Connected to code server (${inst.config.codeServer}).`);

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

    inst.codeServer.on('code', function(data) {
      // Make a unique key of the form 'x,y' so we can use a dictionary for clients.
      var key = getClientKey(data.client);
      inst.log(`Received new info for client(${key}).`);

      // Override empty code
      data.code = data.code || DefaultClientCode(data.client, "waiting for code...");

      // Cache the code in case the code server goes away.
      inst.clients[key] = data;

      // Forward code to clients.
      network.emit(`code(${key})`, data);
    });

    // Handle connections from clients.
    network.on('connection', function(socket) {
      socket.on('requestCode', function(data) {

        var key = getClientKey(data.client);
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
            code: DefaultClientCode(data.client, "No code server available")
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

  dispose() {
    this.codeServer.close();
  }

  requestCode(client) {
    // Request code from code server
    var key = getClientKey(client);
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
    network.emit('requestCode', { client: this.client });
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
      }
    };

    return canvas;
  }

  setClientCode(clientCode) {
    // Merge the new client code with the existing.
    this.clientCode = _.extend(this.clientCode || {}, clientCode, { time0: undefined });

    try {
      this.clientCode.draw = new Function('canvas', 'time', 'globalTime', 'screen', this.clientCode.code);
    } catch (e) {
      // If there is a syntax error "new Function" will fail, replace code with
      // error message.
      this.setClientCode({ code: ClientCodeError(e.message) });
    }
  }

  draw(time, delta) {
    this.canvas.draw.rectangle(this.screen, 'black');

    this.clientCode.time0 = this.clientCode.time0 || time;

    try {
      this.clientCode.draw(this.canvas, time - this.clientCode.time0, time, this.screen);
    } catch (e) {
      // If there is a runtime error, replace code with error message.
      this.setClientCode({ code: ClientCodeError(e.message) });
    }

    // Draw client info.
    this.canvas.writeText(10, this.screen.height-20, getClientKey(this.client), "white", "40px Arial");
    if (this.clientCode.controlled) {
      this.canvas.save();
      this.canvas.strokeStyle = HIGHLIGHT_COLORS[(this.client.x + this.client.y) % HIGHLIGHT_COLORS.length];
      this.canvas.lineWidth   = 10;
      this.canvas.strokeRect(0,0, this.screen.width, this.screen.height);
      this.canvas.restore();
    }
  }
}

register(LiveClientServer, LiveClientClient);
