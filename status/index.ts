import commandLineArgs from "https://esm.sh/command-line-args@5.2.1";
import commandLineUsage from "https://esm.sh/command-line-usage@6.1.3";
import * as path from "https://deno.land/std@0.166.0/path/mod.ts";
import {
  DispatchServer,
  serveDirectory,
  serveFile,
} from "../server/util/serving.ts";
import { addLogger } from "../lib/log.ts";
import { makeConsoleLogger } from "../lib/console_logger.ts";
import { consoleLogger } from "../server/util/console_logger.ts";

addLogger(makeConsoleLogger(consoleLogger, () => performance.now()));

const FLAG_DEFS = [
  { name: "port", type: Number, defaultValue: 3000 },
];
const flags = commandLineArgs(FLAG_DEFS);
if (flags.help) {
  console.log(
    "Available flags: " + commandLineUsage({ optionList: FLAG_DEFS }),
  );
  Deno.exit();
}

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// The location we are running from.
const cwd = Deno.cwd();
let staticDir = cwd;
if (existsSync(path.join(cwd, "node_modules/chicago-brick"))) {
  staticDir = path.join(cwd, "node_modules/chicago-brick");
}
staticDir = path.join(staticDir, "status");

console.log(`CWD: ${cwd}`);
console.log(`Static Dir: ${staticDir}`);

const app = new DispatchServer({ port: flags.port });
app.addHandler("/lib/:path*", serveDirectory(path.join(cwd, "lib")));
app.addHandler("/server/:path*", serveDirectory(path.join(cwd, "server")));
app.addHandler("/client/:path*", serveDirectory(path.join(cwd, "client")));
app.addHandler("/:path*", serveDirectory(path.join(staticDir, "static")));
app.addHandler("/", serveFile(path.join(staticDir, "static/index.html")));

await app.start();
