/**
 * Code adapted from https://rosettacode.org/wiki/Penrose_tiling#Java
 * License: https://creativecommons.org/licenses/by-sa/4.0/
 */

import { PHI, PI_OVER_5 } from "./constants.ts";
import { Point } from "../../lib/math/vector2d.ts";
import { Polygon } from "../../lib/math/polygon2d.ts";

// The "P2" Penrose tile types
// see https://en.wikipedia.org/wiki/Penrose_tiling#Kite_and_dart_tiling_(P2)
export enum P2TileType {
  Kite = 0,
  Dart,
}

export type PenroseTilesState = {
  readonly newTiles: SerializedTile[];
  readonly kiteHue: number;
  readonly dartHue: number;
}

export type SerializedTile = {
  readonly points: Point[];
  readonly angle: number;
  readonly size: number;
  readonly type: P2TileType;
};

// An individual tile
export class Tile extends Polygon {
  constructor(
    readonly points: Point[],
    readonly angle: number,
    readonly size: number,
    readonly type: P2TileType,
  ) {
    super(points);
  }

  static fromOrigin(
    origin: Point,
    angle: number,
    size: number,
    type: P2TileType,
  ): Tile {
    const sideRatios = {
      [P2TileType.Kite]: [PHI, PHI, PHI],
      [P2TileType.Dart]: [-PHI, -1, -PHI],
    };

    let a = angle - PI_OVER_5;

    const points = [origin];

    for (let i = 0; i < 3; i++) {
      const x = origin.x + sideRatios[type][i] * size * Math.cos(a);
      const y = origin.y - sideRatios[type][i] * size * Math.sin(a);
      points.push({ x, y });
      a += PI_OVER_5;
    }

    return new Tile(points, angle, size, type);
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
        Tile.fromOrigin(
          center,
          a,
          size,
          P2TileType.Kite,
        ),
      );
    }

    return protoTiles;
  }

  serialize(): SerializedTile {
    return {
      points: this.points,
      angle: this.angle,
      size: this.size,
      type: this.type,
    };
  }

  static deserialize(s: SerializedTile): Tile {
    return new Tile(s.points, s.angle, s.size, s.type);
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

    if (tile.type === P2TileType.Dart) {
      newTiles.push(
        Tile.fromOrigin({ x, y }, a + 5 * PI_OVER_5, size, P2TileType.Kite),
      );

      for (let i = 0, sign = 1; i < 2; i++, sign *= -1) {
        const nx = x + Math.cos(a - 4 * PI_OVER_5 * sign) * PHI * tile.size;
        const ny = y - Math.sin(a - 4 * PI_OVER_5 * sign) * PHI * tile.size;

        newTiles.push(
          Tile.fromOrigin(
            { x: nx, y: ny },
            a - 4 * PI_OVER_5 * sign,
            size,
            P2TileType.Dart,
          ),
        );
      }
    } else {
      for (let i = 0, sign = 1; i < 2; i++, sign *= -1) {
        newTiles.push(
          Tile.fromOrigin({ x, y }, a - 4 * PI_OVER_5 * sign, size, P2TileType.Dart),
        );

        const nx = x + Math.cos(a - PI_OVER_5 * sign) * PHI * tile.size;
        const ny = y - Math.sin(a - PI_OVER_5 * sign) * PHI * tile.size;

        newTiles.push(
          Tile.fromOrigin(
            { x: nx, y: ny },
            a + 3 * PI_OVER_5 * sign,
            size,
            P2TileType.Kite,
          ),
        );
      }
    }
  }
  // TODO remove duplicates?

  return newTiles;
}
