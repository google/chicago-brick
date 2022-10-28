/*
 * "Tiffany" stained glass module
 *
 * This module generates polygons that iteratively approximate underlying image
 * data.
 *
 * It uses jsfeat to resize images, convert them to grayscale and normalize
 * levels. It uses the "built-in" geometry/polygon library of the video wall
 * (and has added several functions to it).
 *
 * The module can be configured by passing in the following parameters:
 * - imageUrls: a list of URLs for jpeg images; defaults to a Chicago skyline
 *       from Wikipedia
 * - shuffle: whether to shuffle the images to be shown; defaults to false
 * - randomStart: whether to start at a random image in the list, but preserving
 *       order
 * - interval: how long to wait before starting over with the next image
 * - shatterRate: the number of shatters to perform per second; default: 100
 *
 * Planned parameters: (TODO!)
 * - displayMode: controls how images are shown on the screen; supported values:
 *   - tileHorizontal: stretches images vertically, adding images horizontally
 *         to fill the wall. Note that this ignores the cutouts on the wall.
 * - TBD: whether to show multiple copies of one image, or different images at
 *       once; TODO default is to show one image at a time
 * - align: supported values:
 *   - left: this is the default
 *   - center: TODO
 */

// TODO(johnotto): Automatically detect image format using mime type
// TODO(johnotto): Update shatter algorithm to accommodate concave polygons
// TODO(johnotto): customize shatter criteria
// TODO(johnotto): optimization: store polygons in quad-tree instead of array
// TODO(johnotto): optimization: do bbox check before inside poly check
// TODO(johnotto): Periodically send all polygons and redraw everything
// TODO(johnotto): Accelerate the shatter rate as time goes on
// TODO(johnotto): Lazily load images

import jsfeat from "https://esm.sh/jsfeat@0.0.8";
import * as randomjs from "https://esm.sh/random-js@2.1.0";
import * as polygon2d from "../../lib/math/polygon2d.ts";
import * as vector2d from "../../lib/math/vector2d.ts";
import { Server } from "../../server/modules/module_interface.ts";
import { Logger } from "../../lib/log.ts";
import { ModuleWSS } from "../../server/network/websocket.ts";
import { Color, TiffanyPoint, TiffanyPolygon } from "./types.ts";
import {
  ImageMagick,
  IMagickImage,
  initializeImageMagick,
} from "https://deno.land/x/imagemagick_deno@0.0.14/mod.ts";

const { Polygon } = polygon2d;
const { sub, add, scale } = vector2d;

const random = new randomjs.Random();

// The default time in millis to wait before starting over with a new image
const INTERVAL_MS = 120000;

// TODO(johnotto): Make these configurable

// The target height of the images we load, in px. This way we can load
// arbitrarily large images and make it take a predictable amount of time
// to process even very-large polygons.
const VERTICAL_RESOLUTION = 300;

// The maximum number of polygons to send to clients;
// if clients are "behind" they will have blank areas.
// This is to bound the bandwidth consumed, distributing data to clients
const MAX_POLYGONS = 2500;

// this knob controls how far in advance of the current time we should
// generate new polygons.
const PRECOMPUTE_MS = 5000;

// This controls how quickly new polygons should be created
const SHATTER_RATE = 1;

// This controls how often we send new polygon information to the clients.
// It should be smaller than the precomputation period.
const UPDATE_DELAY_MS = 2500;

// This controls the new polygon animation duration.
const POLYGON_TRANSITION_MS = 1000;

// Power-of-two values result in predominantly rectangular panes
const SEGMENTS_PER_EDGE = 3;

// The minimum number of pixels that must be in a cell for it to be
// "shatterable"; this doesn't prevent but is good insurance against
// cells that end up having no pixels in the source image actually
// contained within the polygon -- which turns the cell black.
const MIN_SHATTER_PIXEL_COUNT = 100;

// These images will be shown on the wall, tiled horizontally from left to right
// repeating the pattern.
const IMAGE_URLS = [
  "https://upload.wikimedia.org/wikipedia/commons/9/99/Chicago-Skyline.jpg",
];

interface JsFeatImage {
  cols: number;
  rows: number;
  data: Uint8ClampedArray;
}

interface TiffanyImage {
  url: string;
  original_u8c4: JsFeatImage;
  norm_u8: JsFeatImage;
  width: number;
  height: number;
}

await initializeImageMagick(); // make sure to initialize first!

export function load(
  debug: Logger,
  wallGeometry: polygon2d.Polygon,
  network: ModuleWSS,
) {
  /** Convert an image to grayscale. */
  function grayscale(image_u8c4: JsFeatImage) {
    const gray_u8 = new jsfeat.matrix_t(
      image_u8c4.cols,
      image_u8c4.rows,
      jsfeat.U8_t | jsfeat.C1_t,
    );
    jsfeat.imgproc.grayscale(
      image_u8c4.data,
      image_u8c4.cols,
      image_u8c4.rows,
      gray_u8,
    );
    return gray_u8;
  }

  /** Normalize an image. */
  function normalize(image_u8: JsFeatImage) {
    const norm_u8 = new jsfeat.matrix_t(
      image_u8.cols,
      image_u8.rows,
      jsfeat.U8_t | jsfeat.C1_t,
    );
    jsfeat.imgproc.equalize_histogram(image_u8, norm_u8);
    return norm_u8;
  }

  /**
   * Load and rescale an image, returning a promise for a struct that contains
   * the image data.
   */
  async function loadImage(url: string): Promise<TiffanyImage> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${url}`);
    }
    const buffer = await response.arrayBuffer();
    debug(`loaded url ${url}`);

    let data: Uint8Array;
    let imageWidth = 0, imageHeight = 0;
    ImageMagick.read(new Uint8Array(buffer), (img: IMagickImage) => {
      img.resize(
        img.width / img.height * VERTICAL_RESOLUTION,
        VERTICAL_RESOLUTION,
      );
      imageWidth = img.width;
      imageHeight = img.height;
      img.getPixels((pixels) => {
        data = pixels.toByteArray(0, 0, imageWidth, imageHeight, "RGBA")!;
      });
    });

    const resized_u8c4 = new jsfeat.matrix_t(
      imageWidth,
      imageHeight,
      jsfeat.U8_t | jsfeat.C4_t,
      new jsfeat.data_t(imageWidth * imageHeight, data!),
    );

    const norm_u8 = normalize(grayscale(resized_u8c4));

    return {
      url,
      original_u8c4: resized_u8c4,
      norm_u8,
      width: resized_u8c4.cols,
      height: resized_u8c4.rows,
    };
  }

  /** Rotates an array a random number of positions. */
  function randomRotate<T>(list: T[]) {
    const toRotate = random.integer(0, list.length - 1);
    const imgs = list.splice(0, toRotate);
    list.push(...imgs);
  }

  /** Initializes a polygon's attributes. */
  function initPolygon(
    polygon: TiffanyPolygon,
    time: number,
    imageIndex: number,
    parentColor: Color,
  ) {
    polygon.attrs = {
      addedAt: time,
      completeAt: time + POLYGON_TRANSITION_MS,
      imageIndex,
      replacedAt: null,
      deleteAt: null,
      parentColor,
      color: null,
      stddev: null,
    };
    return polygon;
  }

  /* Marks a polygon as having been shattered and removed at the given time. */
  function markPolygonForRemoval(polygon: TiffanyPolygon, time: number) {
    polygon.attrs.replacedAt = time;
    polygon.attrs.deleteAt = time + POLYGON_TRANSITION_MS;
  }

  /* Copies attributes from the src polygon to the dst polygon, returning dst. */
  function copyAttrs(src: TiffanyPolygon, dst: TiffanyPolygon) {
    dst.attrs = { ...src.attrs };
    return dst;
  }

  /*
   * Divides each edge in polygon into segmentsPerEdge equal length edges. This
   * gives the shatter algorithm more vertices to work with.
   */
  function segmentPolygon(polygon: TiffanyPolygon) {
    const newPoints = [];
    for (const [p0, p1] of polygon.pairs()) {
      const delta = sub(p1, p0);
      for (let j = 1; j < SEGMENTS_PER_EDGE; j++) {
        const frac = j / SEGMENTS_PER_EDGE;
        const newP = add(p0, scale(delta, frac)) as TiffanyPoint;
        newP.key = false;
        newP.newPt = false;
        newPoints.push(newP);
      }
      newPoints.push({ ...p1, key: true, newPt: false });
    }
    return copyAttrs(polygon, new TiffanyPolygon(newPoints));
  }

  /*
   * This removes all vertices from polygon that have key set to false, i.e. they
   * were added in segmentPolygon but were not used by the shatter function.
   */
  function desegmentPolygon(polygon: TiffanyPolygon) {
    const newPoints = polygon.points.filter((p) => p.key);
    return copyAttrs(polygon, new TiffanyPolygon(newPoints));
  }

  interface Instance {
    url: string;
    scale: number;
    x: number;
    y: number;
  }

  interface TiffanyConfig {
    interval?: number;
    imageUrls?: string[];
    shuffle?: boolean;
    randomStart?: boolean;
    shatterRate?: number;
  }

  class TiffanyServer extends Server {
    // Contains all polygons created but not yet deleted
    polygons: TiffanyPolygon[] = [];
    // Map from url to loaded image data
    readonly images: Record<string, TiffanyImage> = {};
    // Image instances on the wall, including position and scale
    readonly instances: Instance[] = [];
    // The last timestamp at which updated polygons were sent to clients
    lastUpdate = 0;
    // The timestamp up to which point polygons have been created
    shatterTime: number | null = null;
    // Set after the init code is done, so we don't try to handle ticks until
    // we're ready.
    initDone = false;
    // The last time we started over with a new set of images
    lastRestart: number | null = null;

    // The interval to wait before restarting with a new set of images.
    readonly interval: number;
    // The images to display.
    readonly imageUrls: string[];
    // The number of polygons to create when we shatter.
    readonly shatterRate: number;

    constructor(config: TiffanyConfig = {}) {
      super(config);
      debug("Tiffany Stained Glass Server!", config);

      this.interval = config.interval || INTERVAL_MS;
      this.imageUrls = config.imageUrls || IMAGE_URLS;

      if (config.shuffle) {
        random.shuffle(this.imageUrls);
      }

      if (config.randomStart) {
        randomRotate(this.imageUrls);
      }

      this.shatterRate = config.shatterRate || SHATTER_RATE;
    }

    /* Computes some stats about the image data within the given polygon. */
    processPolygon(polygon: TiffanyPolygon) {
      const instance = this.instances[polygon.attrs.imageIndex];
      const image = this.images[instance.url];
      const inverseScale = 1.0 / instance.scale;
      const resized = polygon
        .translate({ x: -instance.x, y: -instance.y })
        .scale(inverseScale, inverseScale);

      let n = 0;
      // for color averaging
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      // for stddev on normalized grayscale
      let sum = 0;
      let sumSq = 0;
      let k = null; // reference point

      // Find the index range of the points of lowest y in the resized polygon.
      // Because the poly is convex, the range always exists and is contiguous.
      // Now, we consider the points on the image lattice that are on the
      // inside of the poly, and to do that, we solve the line equation for the
      // edges that are adjacent to our index range at the floor(lowest y).
      // This gives us two numbers, and then we find the inner lattice points
      // on this row. These are the points we sample from the image.
      // This algorithm give us two line equations per row to solve, or fewer
      // if we use bresenham's line equation.
      // This is significantly better than the O(E*R*C) naive algorithm.

      for (const [y, leftX, rightX] of resized.iterateLatticePoints()) {
        for (let x = leftX; x < rightX; x++) {
          n += 1;

          // average colors
          let offset = (image.width * y + x) * 4;
          rSum += image.original_u8c4.data[offset];
          gSum += image.original_u8c4.data[offset + 1];
          bSum += image.original_u8c4.data[offset + 2];

          // compute stddev of grayscale image
          offset = image.width * y + x;
          const value = image.norm_u8.data[offset];
          if (k === null) {
            k = value;
          }
          sum += value - k;
          sumSq += (value - k) * (value - k);
        }
      }

      polygon.attrs.color = {
        counted: n,
        r: rSum / n,
        g: gSum / n,
        b: bSum / n,
      };

      const variance = (sumSq - sum * sum / n) / n;
      const stddev = Math.sqrt(variance);

      polygon.attrs.stddev = {
        n,
        stddev,
        weight: Math.sqrt(n) * stddev,
      };
      return polygon;
    }

    /*
     * Adds images from left to right, cycling through the images to be shown and
     * scaling them to fit the wall vertically.
     */
    tileHorizontally(time: number) {
      const images = [...this.imageUrls];

      // Randomize which image is shown first by rotating the array a random
      // number of times.
      randomRotate(images);

      const wall = wallGeometry.extents;
      let totalWidth = 0;
      while (totalWidth < wall.w) {
        const image = this.images[images[0]];
        // fit to height
        const scale = wall.h / image.height;
        const x = wall.x + totalWidth;
        // Limit the width to the remaining width on the wall.
        const w = Math.min(
          Math.floor(image.width * scale),
          wall.w - totalWidth, /* this is the remaining width */
        );

        const index = this.instances.length;
        this.instances.push({
          url: images[0],
          scale,
          x,
          y: 0,
        });
        debug("tile horizontal", images[0], scale, x, w);

        // Make a polygon for the image.
        const poly = new TiffanyPolygon([
          { x: x, y: 0 },
          { x: x + w, y: 0 },
          { x: x + w, y: wall.y + wall.h },
          { x: x, y: wall.y + wall.h },
        ]);

        this.polygons.push(this.processPolygon(initPolygon(poly, time, index, {
          counted: 1,
          r: 0,
          g: 0,
          b: 0,
        })));

        // update totalWidth to advance the next image to the right.
        totalWidth += w;

        // rotate the images array to cycle through the given images.
        images.push(images.shift()!);
      }
    }

    /*
     * Creates a set of new convex polygons that fills the same area as the given
     * convex polygon; each new polygon includes point as a vertex. Uses a greedy
     * algorithm to generate candidate polygon sets, and chooses the set with the
     * largest minimum angle to avoid narrow "shards".
     */
    shatterPolygon(polygon: TiffanyPolygon, point: TiffanyPoint, time: number) {
      if (!(polygon.isInside(point) && !polygon.isOn(point))) {
        return null;
      }

      const imageIndex = polygon.attrs.imageIndex;
      const edges = [...segmentPolygon(polygon).pairs()];

      const shatterPoint = { ...point, key: true, newPt: true };
      let bestPolygons = null;
      let bestPolygonsMinAngle = null;
      // Greedy algorithm: starting from each start index, add as many edges as
      // possible while maintaining a convex polygon
      // TODO(applmak): What is edge offset here?
      randomRotate(edges);
      for (let edgeOffset = 0; edgeOffset < edges.length; edgeOffset++) {
        const generatedPolygons = [];
        let error = null;
        let points: TiffanyPoint[] = [shatterPoint];
        for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
          const [p0, p1] = edges[edgeIndex];
          // try to add an edge and test if it's convex
          // override key=true on points adjacent to the shatter point.
          if (points.length == 1) {
            points.push({ ...p0, key: points.length == 1, newPt: false });
          }
          points.push(p1);
          if (!(new Polygon(points).isConvex())) {
            points.pop(); // errant point.
            if (points.length <= 2) {
              // this means the starting polygon must not be convex
              error = "failed to add polygon to point";
              debug(
                "shatter",
                error,
                "edgeOffset",
                edgeOffset,
                "edgeIndex",
                edgeIndex,
              );
              break;
            }
            // override key=true on points adjacent to the shatter point.
            points[points.length - 1] = {
              ...points[points.length - 1],
              key: true,
              newPt: false,
            };
            generatedPolygons.push(desegmentPolygon(
              initPolygon(
                new TiffanyPolygon(points),
                time,
                imageIndex,
                polygon.attrs.color!,
              ),
            ));
            // start a new polygon with this edge
            points = [shatterPoint];
            edgeIndex--;
          }
        }
        if (error) {
          // Rotate the edges...
          edges.push(edges.shift()!);
          continue;
        }
        // Push the final polygon...
        // override key=true on points adjacent to the shatter point.
        points[points.length - 1] = {
          ...points[points.length - 1],
          key: true,
          newPt: false,
        };
        generatedPolygons.push(desegmentPolygon(
          initPolygon(
            new TiffanyPolygon(points),
            time,
            imageIndex,
            polygon.attrs.color!,
          ),
        ));

        let minAngle = null;
        for (const poly of generatedPolygons) {
          const polygonMinAngle = Math.min(...poly.angles());
          if (minAngle === null || polygonMinAngle < minAngle) {
            minAngle = polygonMinAngle;
          }
        }

        if (
          !isNaN(minAngle!) &&
          (bestPolygonsMinAngle === null || minAngle! > bestPolygonsMinAngle)
        ) {
          bestPolygons = generatedPolygons;
          bestPolygonsMinAngle = minAngle;
        }

        // Rotate the edges...
        edges.push(edges.shift()!);
      }

      return bestPolygons;
    }

    /* Shatters the polygon with the highest weight. */
    shatterNextPoint(time: number) {
      let maxWeight = 0;
      let maxWeightPolygon = null;

      for (const polygon of this.polygons) {
        if (polygon.attrs.replacedAt) {
          continue;
        }
        // Don't shatter polygons that are still trying to appear.
        if (time < polygon.attrs.completeAt) {
          continue;
        }
        if (polygon.attrs.stddev!.n <= MIN_SHATTER_PIXEL_COUNT) {
          continue;
        }

        if (polygon.attrs.stddev!.weight > maxWeight) {
          maxWeight = polygon.attrs.stddev!.weight;
          maxWeightPolygon = polygon;
        }
      }

      if (!maxWeightPolygon) {
        return;
      }

      const centroid = maxWeightPolygon.centroid();
      const newPolygons = this.shatterPolygon(
        maxWeightPolygon,
        centroid as TiffanyPoint,
        time,
      );
      for (const newPoly of newPolygons || []) {
        const poly = this.processPolygon(newPoly);
        // If newPoly has no color because it was too small, inherit color from the parent.
        if (poly.attrs.color!.counted == 0) {
          poly.attrs.color!.r = maxWeightPolygon.attrs.color!.r;
          poly.attrs.color!.g = maxWeightPolygon.attrs.color!.g;
          poly.attrs.color!.b = maxWeightPolygon.attrs.color!.b;
        }
        this.polygons.push(poly);
      }
      markPolygonForRemoval(maxWeightPolygon, time);
    }

    /*
     * Shatters polygons at a fixed rate from the first tick to the server module,
     * up to the given time.
     */
    shatterUntil(time: number) {
      // if (this.polygons.length == 1) {
      //   console.dir(this.polygons, {depth: null, colors: true});
      //   this.shatterNextPoint(time);
      //   console.dir(this.polygons, {depth: null, colors: true});
      // }
      // return;
      if (this.shatterTime === null) {
        this.shatterTime = time;
      }

      while (this.shatterTime < time) {
        let ts = this.shatterTime;
        const interval = Math.floor(1000 / this.shatterRate);
        for (let i = 0; i < this.shatterRate; i++) {
          this.shatterNextPoint(ts);
          ts += interval;
        }
        this.shatterTime += 1000;
      }
    }

    /*
     * When called, expires all the old polygons, and starts over with a new set of
     * images.
     */
    restart(time: number) {
      this.lastRestart = time;
      for (const polygon of this.polygons) {
        if (polygon.attrs.deleteAt === null) {
          markPolygonForRemoval(polygon, time);
        }
      }
      this.tileHorizontally(time);
      this.shatterUntil(time + PRECOMPUTE_MS);

      // Advance the images playlist
      this.imageUrls.push(this.imageUrls.shift()!);
    }

    async willBeShownSoon(time: number) {
      // Preload images
      const images = await Promise.all(this.imageUrls.map((i) => loadImage(i)));
      for (const image of images) {
        this.images[image.url] = image;
      }
      this.restart(time);
      // If we're just starting up, don't start rendering polygons yet -- wait
      // until we get our first tick.
      this.shatterTime = null;
      this.initDone = true;
    }

    tick(time: number) {
      if (!this.initDone) {
        return;
      }

      this.shatterUntil(time + PRECOMPUTE_MS);

      let restarted = false;
      if (time + PRECOMPUTE_MS > this.lastRestart! + INTERVAL_MS) {
        restarted = true;
        this.restart(time + PRECOMPUTE_MS);
      }

      if (restarted || time >= this.lastUpdate + UPDATE_DELAY_MS) {
        this.lastUpdate = time;

        // clear out deleted polygons
        // TODO(johnotto): don't do this every time, it could get expensive
        const validPolygons = [];
        let deleted = 0;
        for (const poly of this.polygons) {
          if (poly.attrs.deleteAt === null || time < poly.attrs.deleteAt) {
            validPolygons.push(poly);
          } else {
            deleted++;
          }
        }
        this.polygons = validPolygons;

        let polygonsToSend = this.polygons;
        if (polygonsToSend.length > MAX_POLYGONS) {
          polygonsToSend = polygonsToSend.slice(
            polygonsToSend.length - MAX_POLYGONS,
          );
        }
        debug(
          "sending",
          "deleted",
          deleted,
          "have",
          this.polygons.length,
          "sending",
          polygonsToSend.length,
        );

        network.send("polygons", {
          polygons: polygonsToSend,
        });
      }
    }
  }

  return { server: TiffanyServer };
}
