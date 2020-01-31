import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import express from 'express';
import fs from 'fs';
import path from 'path';

const FLAG_DEFS = [
  {name: 'port', type: Number, defaultValue: 3000}
];
const flags = commandLineArgs(FLAG_DEFS);
if (flags.help) {
  console.log('Available flags: ' + commandLineUsage({optionList: FLAG_DEFS}));
  process.exit();
}

const fsp = fs.promises;

function serveFile(path) {
  return async (req, res) => {
    try {
      const contents = await fsp.readFile(path, {encoding: 'utf-8'});
      res.statusCode = 200;
      res.end(contents, 'utf-8');
    } catch (e) {
      res.statusCode = 404;
      res.end('Not Found', 'utf-8');
    }
  };
}

// The location we are running from.
const cwd = path.join(process.cwd(), 'status');

console.log(`CWD: ${cwd}`);

// Create a router just for the brick files that could be served to the client.
// These are:
//   /client => node_modules/brick/client
//   /lib => node_modules/brick/lib
//   /node_modules => node_modules
const app = express();
app.use('/node_modules', express.static(path.join(cwd, 'node_modules')));
app.use('/js', express.static(path.join(cwd, 'static')));
app.get('/', serveFile(path.join(cwd, 'static/index.html')));

const server = app.listen(flags.port, () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log(`Server listening at http://${host}:${port}`);
});
