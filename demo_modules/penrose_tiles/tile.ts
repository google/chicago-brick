/**
 * Code adapted from https://rosettacode.org/wiki/Penrose_tiling#Java
 */

import { PHI, PI_OVER_5 } from "./constants.ts";
import { Point } from "../../lib/math/vector2d.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";

// The "P2" Penrose tile types
export enum TileType {
  Kite = 0,
  Dart,
}

// An individual tile
export class Tile extends Polygon {
  constructor(
    origin: Point,
    readonly angle: number,
    readonly size: number,
    readonly type: TileType,
  ) {
    const dist = [[PHI, PHI, PHI], [-PHI, -1, -PHI]];
    let a = angle - PI_OVER_5;

    const vertices = [origin];

    const ord = type;

    for (let i = 0; i < 3; i++) {
      const x = origin.x + dist[ord][i] * size * Math.cos(a);
      const y = origin.y - dist[ord][i] * size * Math.sin(a);
      vertices.push({ x, y });
      a += PI_OVER_5;
    }

    super(vertices);
  }

  static protoTiles(
    center: Point,
    size: number,
  ): readonly Tile[] {
    const protoTiles = [];

    for (
      let a = Math.PI / 2 + PI_OVER_5;
      a < 3 * Math.PI;
      a += 2 * PI_OVER_5
    ) {
      protoTiles.push(
        new Tile(
          center,
          a,
          size,
          TileType.Kite,
        ),
      );
    }

    return protoTiles;
  }
}

// "Deflate" the given tiles to the next generation
export function deflateTiles(tiles: Tile[]): Tile[] {
  const newTiles: Tile[] = [];

  for (const tile of tiles) {
    const x = tile.points[0].x;
    const y = tile.points[0].y;
    const a = tile.angle;
    const size = tile.size / PHI;

    if (tile.type === TileType.Dart) {
      newTiles.push(new Tile({ x, y }, a + 5 * PI_OVER_5, size, TileType.Kite));

      for (let i = 0, sign = 1; i < 2; i++, sign *= -1) {
        const nx = x + Math.cos(a - 4 * PI_OVER_5 * sign) * PHI * tile.size;
        const ny = y - Math.sin(a - 4 * PI_OVER_5 * sign) * PHI * tile.size;

        newTiles.push(
          new Tile(
            { x: nx, y: ny },
            a - 4 * PI_OVER_5 * sign,
            size,
            TileType.Dart,
          ),
        );
      }
    } else {
      for (let i = 0, sign = 1; i < 2; i++, sign *= -1) {
        newTiles.push(
          new Tile({ x, y }, a - 4 * PI_OVER_5 * sign, size, TileType.Dart),
        );

        const nx = x + Math.cos(a - PI_OVER_5 * sign) * PHI * tile.size;
        const ny = y - Math.sin(a - PI_OVER_5 * sign) * PHI * tile.size;

        newTiles.push(
          new Tile(
            { x: nx, y: ny },
            a + 3 * PI_OVER_5 * sign,
            size,
            TileType.Kite,
          ),
        );
      }
    }
  }
  // TODO remove duplicates?

  return newTiles;
}