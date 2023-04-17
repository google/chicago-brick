/**
 * Code adapted from https://rosettacode.org/wiki/Penrose_tiling#Java
 */

import { PHI, PI_OVER_5 } from "./constants.ts";
import { Point } from "../../lib/math/rectangle.ts";

// The "P2" Penrose tile types
export enum TileType {
  Kite = 0,
  Dart,
}

// An individual tile
export class Tile {
  constructor(
    readonly origin: Point,
    readonly angle: number,
    readonly size: number,
    readonly type: TileType,
  ) {
  }

  // TODO(aarestad): make this clearer what we are doing
  get vertices(): readonly [Point, Point, Point, Point] {
    const dist = [[PHI, PHI, PHI], [-PHI, -1, -PHI]];
    let angle = this.angle - PI_OVER_5;

    const vertices = [this.origin];

    const ord = this.type;

    for (let i = 0; i < 3; i++) {
      const x = this.origin.x + dist[ord][i] * this.size * Math.cos(angle);
      const y = this.origin.y - dist[ord][i] * this.size * Math.sin(angle);
      vertices.push({x, y});
      angle += PI_OVER_5;
    }

    return vertices as [Point, Point, Point, Point];
  }
}

// "Deflate" the given tiles to the next generation
export function deflateTiles(tiles: Tile[]): Tile[] {
  const newTiles: Tile[] = [];

  for (const tile of tiles) {
    const x = tile.origin.x;
    const y = tile.origin.y;
    const a = tile.angle;
    const size = tile.size / PHI;

    if (tile.type === TileType.Dart) {
      newTiles.push(new Tile({x, y}, a + 5 * PI_OVER_5, size, TileType.Kite));

      for (let i = 0, sign = 1; i < 2; i++, sign *= -1) {
        const nx = x + Math.cos(a - 4 * PI_OVER_5 * sign) * PHI * tile.size;
        const ny = y - Math.sin(a - 4 * PI_OVER_5 * sign) * PHI * tile.size;
        newTiles.push(
          new Tile({x: nx, y: ny}, a - 4 * PI_OVER_5 * sign, size, TileType.Dart),
        );
      }
    } else {
      for (let i = 0, sign = 1; i < 2; i++, sign *= -1) {
        newTiles.push(
          new Tile({x, y}, a - 4 * PI_OVER_5 * sign, size, TileType.Dart),
        );

        const nx = x + Math.cos(a - PI_OVER_5 * sign) * PHI * tile.size;
        const ny = y - Math.sin(a - PI_OVER_5 * sign) * PHI * tile.size;
        newTiles.push(
          new Tile({x: nx, y: ny}, a + 3 * PI_OVER_5 * sign, size, TileType.Kite),
        );
      }
    }
  }
  // TODO remove duplicates?

  return newTiles;
}
