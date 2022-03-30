import fs from 'fs';
import path from 'path';
import mime from 'mime';

const fsp = fs.promises;

function probablyBinary(type) {
  if (!type) {
    return 'text/plain';
  }
  return type.includes('image') || type.includes('video');
}

function respondWithContents(res, contents, type) {
  res.statusCode = 200;
  res.setHeader('content-type', type);
  const encoding = probablyBinary(type) ? 'binary' : 'utf-8';
  res.end(contents, encoding);
}

export function serveFile(urlPath, filePath) {
  return async (req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== urlPath) {
      next();
      return;
    }
    const type = mime.getType(path.extname(filePath));
    const encoding = probablyBinary(type) ? 'binary' : 'utf-8';
    let contents;
    try {
      contents = await fsp.readFile(filePath, {encoding});
    } catch (e) {
      res.statusCode = 404;
      res.end('Not Found', 'utf-8');
    }
    respondWithContents(res, contents, type);
  };
}

export function serveDirectory(pattern, dir) {
  return async (req, res, next) => {
    // First, see if the pattern matches the req path.
    const url = new URL(req.url, `http://${req.headers.host}`);
    const match = pattern.match(url.pathname);
    if (!match) {
      next();
      return;
    }
    const filePath = match['_'] || 'index.html';
    const fullPath = path.join(dir, filePath);
    const type = mime.getType(path.extname(filePath));
    const encoding = probablyBinary(type) ? 'binary' : 'utf-8';
    try {
      const contents = await fsp.readFile(fullPath, {encoding});
      respondWithContents(res, contents, type);
    } catch (e) {
      res.statusCode = 404;
      res.end('Not found', 'utf-8');
    }
  };
}

export function routingMain(routes) {
  return async (req, res) => {
    for (const route of routes) {
      // Try the route.
      let success = true;
      await route(req, res, () => {
        success = false;
      });
      if (success) {
        return;
      }
    }
    // No routes.
    res.statusCode = 404;
    res.end('Not found', 'utf-8');
  };
}