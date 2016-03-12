var Watcher = require('file-watcher');
var fs = require('fs');
var server = require('http').createServer();
var io = require('socket.io')(server);

var CLIENT_CODE = 'client-code';

var watcher = new Watcher({
  root: __dirname,
  filter: function(filename, stats) {
    return filename.indexOf(CLIENT_CODE) > -1;
  }
});

function notifyCode(file, notify) {
  console.log(`Notifying for ${file}`);
  var match = file.match(/x=([0-9]+),y=([0-9]+)/i);
  var cx = match[1];
  var cy = match[2];

  if (cx && cy) {
    console.log(`Code is for client (${cx},${cy})`);

    var data = fs.readFileSync(file, 'utf8');

    notify.emit(`code`, {
      client: {
        x: cx,
        y: cy
      },
      code: data });
  }
}

watcher.on('change', function(event) { notifyCode(event.newPath, io); });
watcher.on('create', function(event) { notifyCode(event.newPath, io); });

io.on('connection', function(socket){
  console.log('Client connected');
  socket.on('requestCode', function(data) {
    console.log(data);

    var cx = data.client.x;
    var cy = data.client.y;

    var filename = `${CLIENT_CODE}/client_x=${cx},y=${cy}.js`;
    notifyCode(filename, socket)
  });
});

io.on('disconnect', function() {
  console.log('Client disconnected');
})

watcher.watch();
server.listen(3001);
