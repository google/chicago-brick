import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import express from 'express';
import path from 'path';
import fs from 'fs';

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

const app = express();
app.use('/node_modules', express.static(path.join(cwd, 'node_modules')));
app.use('/', express.static(path.join(staticDir, 'static')));

const server = app.listen(flags.port, () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log(`Server listening at http://${host}:${port}`);
});
