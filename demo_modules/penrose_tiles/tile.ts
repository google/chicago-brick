import { PHI, PI_OVER_5 } from "./constants.ts";

enum TileType {
  Kite = 0,
  Dart,
}

class Tile {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly angle: number,
    readonly size: number,
    readonly type: TileType,
  ) {
  }
}

function deflateTiles(tiles: Tile[], generation: number): Tile[] {
  if (generation <= 0) {
    return tiles;
  }

  const newTiles: Tile[] = [];

  for (const tile of tiles) {
    const x = tile.x;
    const y = tile.y;
    const a = tile.angle;
    const size = tile.size / PHI;

    if (tile.type === TileType.Dart) {
      newTiles.push(new Tile(x, y, a + 5 * PI_OVER_5, size, TileType.Kite));

      for (let i = 0, sign = 1; i < 2; i++, sign *= -1) {
        const nx = x + Math.cos(a - 4 * PI_OVER_5 * sign) * PHI * tile.size;
        const ny = y - Math.sin(a - 4 * PI_OVER_5 * sign) * PHI * tile.size;
        newTiles.push(
          new Tile(nx, ny, a - 4 * PI_OVER_5 * sign, size, TileType.Dart),
        );
      }
    } else {
      for (let i = 0, sign = 1; i < 2; i++, sign *= -1) {
        newTiles.push(
          new Tile(x, y, a - 4 * PI_OVER_5 * sign, size, TileType.Dart),
        );

        const nx = x + Math.cos(a - PI_OVER_5 * sign) * PHI * tile.size;
        const ny = y - Math.sin(a - PI_OVER_5 * sign) * PHI * tile.size;
        newTiles.push(
          new Tile(nx, ny, a + 3 * PI_OVER_5 * sign, size, TileType.Kite),
        );
      }
    }
  }
  // TODO remove duplicates
  // tls = next.stream().distinct().collect(toList());

  return deflateTiles(newTiles, generation - 1);
}

export { deflateTiles, PHI, PI_OVER_5, Tile, TileType };
