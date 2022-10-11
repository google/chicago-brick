import { serve, serveTls } from "https://deno.land/std@0.132.0/http/server.ts";
import * as path from "https://deno.land/std@0.132.0/path/mod.ts";
import mime from "https://esm.sh/mime";
import { easyLog } from "../../lib/log.js";

const log = easyLog("wall:serving");

export function serveFile(filePath: string): Handler {
  return async (req: Request) => {
    const type = mime.getType(path.extname(filePath)) || "text/plain";
    try {
      const contents = await Deno.readFile(filePath);
      return plain(contents, type);
    } catch (e) {
      log.error(e);
      return notFound();
    }
  };
}

export function serveDirectory(dir: string): Handler {
  return async (req: Request, match: URLPatternResult) => {
    const filePath = match.pathname.groups.path || "index.html";
    const fullPath = path.join(dir, filePath);
    log(req.url, fullPath);
    const type = mime.getType(path.extname(filePath)) || "text/plain";
    try {
      const contents = await Deno.readFile(fullPath);
      return plain(contents, type);
    } catch (e) {
      log.error(e);
      return notFound();
    }
  };
}

export function notFound(): Response {
  return new Response("Not Found", {
    headers: new Headers({ "content-type": "text/plain" }),
    status: 404,
  });
}

export function error(e: Error): Response {
  return new Response(`Error: ${e.stack}`, {
    headers: new Headers({ "content-type": "text/plain" }),
    status: 500,
  });
}

export function plain(str: string | Uint8Array, type: string): Response {
  return new Response(str, {
    headers: new Headers({ "content-type": type }),
    status: 200,
  });
}

export interface DispatchServerOptions {
  port: number;
  ssl?: {
    keyFile: string;
    certFile: string;
  };
}
type Handler = (
  req: Request,
  match: URLPatternResult,
) => Promise<Response>;
export class DispatchServer {
  private options: DispatchServerOptions;
  private started = false;
  private handlers: Array<
    { pattern: string; handler: Handler }
  > = [];
  constructor(options: DispatchServerOptions) {
    this.options = options;
  }
  async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    try {
      if (this.options.ssl) {
        log(`Starting ssl server on port ${this.options.port}`);
        await serveTls((req) => this.mainHandler(req), {
          port: this.options.port,
          ...this.options.ssl,
        });
      } else {
        log(`Starting server on port ${this.options.port}`);
        await serve((req) => this.mainHandler(req), {
          port: this.options.port,
        });
      }
    } catch (e) {
      log.error(`Unable to launch server on port: ${this.options.port}`);
      log.error(e);
    }
  }
  private async mainHandler(req: Request): Promise<Response> {
    const baseUrl = `http://${req.headers.get("host") || "localhost"}/`;
    // Test the request url against each handler.
    for (const { pattern, handler } of this.handlers) {
      const url = new URL(req.url, baseUrl);
      const p = new URLPattern(pattern, baseUrl);
      const match = p.exec(url);
      if (match) {
        // We got one!
        try {
          return await handler(req, match);
        } catch (e) {
          console.error(e);
          return error(e);
        }
      }
    }
    return notFound();
  }
  addHandler(
    pattern: string,
    handler: Handler,
  ) {
    this.handlers.push({ pattern, handler });
  }
}
