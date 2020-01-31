import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import express from 'express';
import path from 'path';

const FLAG_DEFS = [
  {name: 'port', type: Number, defaultValue: 3000}
];
const flags = commandLineArgs(FLAG_DEFS);
if (flags.help) {
  console.log('Available flags: ' + commandLineUsage({optionList: FLAG_DEFS}));
  process.exit();
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
app.use('/', express.static(path.join(cwd, 'static')));

const server = app.listen(flags.port, () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log(`Server listening at http://${host}:${port}`);
});
