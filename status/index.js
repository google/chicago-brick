import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import path from 'path';
import fs from 'fs';
import {
  DispatchServer,
  serveDirectory,
  serveFile,
} from "../server/util/serving.js";


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

const app = new DispatchServer({ port: flags.port });
app.addHandler(
  "/node_modules/:path*",
  serveDirectory(path.join(cwd, "node_modules")),
);
app.addHandler("/lib/:path*", serveDirectory(path.join(cwd, "lib")));
app.addHandler("/:path*", serveDirectory(path.join(staticDir, "static")));
app.addHandler("/", serveFile(path.join(staticDir, "static/index.html")));

app.start();