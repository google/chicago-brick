import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import path from 'path';
import fs from 'fs';
import {serveDirectory, routingMain} from '../server/util/serving.js';
import URLPattern from 'url-pattern';
import http from 'http';

const FLAG_DEFS = [
  {name: 'port', type: Number, defaultValue: 3000}
];
const flags = commandLineArgs(FLAG_DEFS);
if (flags.help) {
  console.log('Available flags: ' + commandLineUsage({optionList: FLAG_DEFS}));
  process.exit();
}

// The location we are running from.
const cwd = process.cwd();
let staticDir = cwd;
if (fs.existsSync(path.join(cwd, 'node_modules/chicago-brick'))) {
  staticDir = path.join(cwd, 'node_modules/chicago-brick');
}
staticDir = path.join(staticDir, 'status');

console.log(`CWD: ${cwd}`);
console.log(`Static Dir: ${staticDir}`);

const routes = [];
const app = routingMain(routes);
routes.push(serveDirectory(new URLPattern('/node_modules/*'), path.join(cwd, 'node_modules')));
routes.push(serveDirectory(new URLPattern('/lib/*'), path.join(cwd, 'lib')));
routes.push(serveDirectory(new URLPattern('/*'), path.join(staticDir, 'static')));

const server = http.createServer({}, app).listen(flags.port, () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log(`Server listening at http://${host}:${port}`);
});
