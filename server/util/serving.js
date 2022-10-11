import fs from 'fs';
import path from 'path';
import mime from 'mime';
import { easyLog } from "../../lib/log.js";
import https from 'https';
import http from 'http';
import {URLPattern} from 'urlpattern-polyfill';

const fsp = fs.promises;
const log = easyLog("wall:serving");


export function serveFile(filePath) {
  return async () => {
    const type = mime.getType(path.extname(filePath)) || "text/plain";
    try {
      const contents = await fsp.readFile(filePath);
      return plain(contents, type);
    } catch (e) {
      log.error(e);
      return notFound();
    }
  };
}

export function serveDirectory(dir) {
  return async (req, match) => {
    // First, see if the pattern matches the req path.
    const filePath = match.pathname.groups.path || "index.html";
    const fullPath = path.join(dir, filePath);
    log(req.url, fullPath);
    const type = mime.getType(path.extname(filePath));
    try {
      const contents = await fsp.readFile(fullPath);
      return plain(contents, type);
    } catch (e) {
      log.error(e);
      return notFound();
    }
  };
}


export function notFound() {
  return new Response("Not Found", {
    headers: new Headers({ "content-type": "text/plain" }),
    status: 404,
  });
}

export function error(e) {
  return new Response(`Error: ${e.stack}`, {
    headers: new Headers({ "content-type": "text/plain" }),
    status: 500,
  });
}

export function plain(str, type) {
  return new Response(str, {
    headers: new Headers({ "content-type": type }),
    status: 200,
  });
}


export class DispatchServer {
  constructor(options) {
    this.options = options;
    this.started = false;
    this.handlers = [];
    this.server = null;
  }
  start() {
    if (this.started) {
      return;
    }
    this.started = true;
    try {
      const wrapper = async (req, res) => {
        // Convert not-real headers to a real header object.
        const fixedHeaders = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          fixedHeaders.append(key, value);
        }
        req.headers = fixedHeaders;
        const newRes = await this.mainHandler(req);
        for (const [header, value] of newRes.headers.entries()) {
          res.appendHeader(header, value);
        }
        res.writeHead(newRes.status, newRes.statusText);
        if (newRes.body) {
          const reader = newRes.body.getReader();
          do {
            const {value, done} = await reader.read();
            if (done) {
              res.end();
              break;
            } else {
              res.write(value);
            }
          // eslint-disable-next-line
          } while (true);
        } else {
          res.end();
        }
      };
      if (this.options.ssl) {
        this.server = https.createServer(this.options.ssl, wrapper);
      } else {
        this.server = http.createServer({}, wrapper);
      }
      this.server.listen(this.options.port, () => {
        const host = this.server.address().address;
        const port = this.server.address().port;
        
        const protocol = this.server instanceof https.Server ? 'https' : 'http';
        log(`Server listening at ${protocol}://${host}:${port}`);
      });
    } catch (e) {
      log.error(`Unable to launch server on port: ${this.options.port}`);
      log.error(e);
    }
  }
  async mainHandler(req) {
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
  addHandler(pattern, handler) {
    this.handlers.push({ pattern, handler });
  }
}
