var Watcher = require('file-watcher');
var fs = require('fs');
var server = require('http').createServer();
var io = require('socket.io')(server);
var debug = require('debug')('live-client:server');

var CLIENT_CODE = 'client-code';

var watcher = new Watcher({
  root: __dirname,
  filter: function(filename, stats) {
    return filename.indexOf(CLIENT_CODE) > -1;
  }
});

function notifyCode(file, notify) {
  debug(`Notifying for ${file}`);
  var match = file.match(/x=([0-9]+),y=([0-9]+)/i);
  var cx = match[1];
  var cy = match[2];

  if (cx && cy) {
    debug(`Code is for client (${cx},${cy})`);

    fs.access(file, fs.F_OK, function(err) {
        // TODO Consider sending some default code.
        var data;

        if (!err) {
            data = fs.readFileSync(file, 'utf8');
        } else {
            debug(`Requested file (${file}) cannot be read, sending empty code`);
        }

        notify.emit(`code`, {
          client: {
            x: cx,
            y: cy
          },
          code: data });
    });
  }
}

function storeCode(file, code) {
  debug(`Storing code to ${file}`);
  fs.writeFileSync(file, code, 'utf8');
}

watcher.on('change', function(event) { notifyCode(event.newPath, io); });
watcher.on('create', function(event) { notifyCode(event.newPath, io); });

io.on('connection', function(socket){
  debug('Client connected');
  socket.on('requestCode', function(data) {
    debug('requestCode: ' + data);

    var cx = data.client.x;
    var cy = data.client.y;

    var filename = `${CLIENT_CODE}/client_x=${cx},y=${cy}.js`;
    notifyCode(filename, socket);
  });

  socket.on('storeCode', function(data) {

    debug('Store: ' + data);

    var cx = data.client.x;
    var cy = data.client.y;

    var filename = `${CLIENT_CODE}/client_x=${cx},y=${cy}.js`;
    storeCode(filename, data.code);
  });

  socket.on('error', function(e) {
      debug(`ERROR: ${e}`);
  });
});

io.on('disconnect', function() {
  debug('Client disconnected');
});

watcher.watch();
server.listen(3001);
