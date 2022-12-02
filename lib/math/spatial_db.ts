// A function that tells you which rectangles are near which other rectangles.

import { Rectangle } from "./rectangle.ts";

type SpatialObject = { extents: Rectangle };

export class SpatialDatabase<T extends SpatialObject> {
  readonly numCellsX: number;
  readonly numCellsY: number;
  readonly cells: Array<Set<T>>;
  readonly objToExtentsMap = new Map<T, Rectangle>();

  constructor(readonly maxExtents: Rectangle, approximateCellSize: number) {
    this.numCellsX = Math.round(maxExtents.w / approximateCellSize);
    this.numCellsY = Math.round(maxExtents.h / approximateCellSize);
    this.cells = Array.from(
      { length: this.numCellsX * this.numCellsY },
      () => new Set(),
    );
  }

  getCellExtents(extents: Rectangle) {
    const minCellX = Math.floor(
      (extents.x - this.maxExtents.x) / (this.maxExtents.w / this.numCellsX),
    );
    const minCellY = Math.floor(
      (extents.y - this.maxExtents.y) / (this.maxExtents.h / this.numCellsY),
    );

    const maxCellX = Math.ceil(
      (extents.x + extents.w - this.maxExtents.x) /
        (this.maxExtents.w / this.numCellsX),
    );
    const maxCellY = Math.ceil(
      (extents.y + extents.h - this.maxExtents.y) /
        (this.maxExtents.h / this.numCellsY),
    );
    return { minCellX, minCellY, maxCellX, maxCellY };
  }

  add(x: T) {
    const extents = x.extents;
    const { minCellX, minCellY, maxCellX, maxCellY } = this.getCellExtents(
      extents,
    );
    for (
      let j = Math.max(0, minCellY);
      j < Math.min(this.numCellsY, maxCellY);
      ++j
    ) {
      for (
        let i = Math.max(0, minCellX);
        i < Math.min(this.numCellsX, maxCellX);
        ++i
      ) {
        // Add this object to the right cells.
        this.cells[i + j * this.numCellsX].add(x);
      }
    }
    this.objToExtentsMap.set(x, extents);
  }
  delete(x: T) {
    const extents = this.objToExtentsMap.get(x);
    if (!extents) {
      // It doesn't exist.
      return;
    }
    // Figure out valid cells.
    const { minCellX, minCellY, maxCellX, maxCellY } = this.getCellExtents(
      extents,
    );

    for (
      let j = Math.max(0, minCellY);
      j < Math.min(this.numCellsY, maxCellY);
      ++j
    ) {
      for (
        let i = Math.max(0, minCellX);
        i < Math.min(this.numCellsX, maxCellX);
        ++i
      ) {
        // Add this object to the right cells.
        this.cells[i + j * this.numCellsX].delete(x);
      }
    }
  }
  update(x: T) {
    const oldExtents = this.objToExtentsMap.get(x);
    if (!oldExtents) {
      throw new Error("Asked to update x, which does not exist in the db");
    }
    const newExtents = x.extents;
    {
      const { minCellX, minCellY, maxCellX, maxCellY } = this.getCellExtents(
        oldExtents,
      );
      for (
        let j = Math.max(0, minCellY);
        j < Math.min(this.numCellsY, maxCellY);
        ++j
      ) {
        for (
          let i = Math.max(0, minCellX);
          i < Math.min(this.numCellsX, maxCellX);
          ++i
        ) {
          // Add this object to the right cells.
          this.cells[i + j * this.numCellsX].delete(x);
        }
      }
    }
    {
      const { minCellX, minCellY, maxCellX, maxCellY } = this.getCellExtents(
        newExtents,
      );
      for (
        let j = Math.max(0, minCellY);
        j < Math.min(this.numCellsY, maxCellY);
        ++j
      ) {
        for (
          let i = Math.max(0, minCellX);
          i < Math.min(this.numCellsX, maxCellX);
          ++i
        ) {
          // Add this object to the right cells.
          this.cells[i + j * this.numCellsX].add(x);
        }
      }
    }
  }
  get(extents: Rectangle): Set<T> {
    const objs = new Set<T>();
    const { minCellX, minCellY, maxCellX, maxCellY } = this.getCellExtents(
      extents,
    );
    for (
      let j = Math.max(0, minCellY);
      j < Math.min(this.numCellsY, maxCellY);
      ++j
    ) {
      for (
        let i = Math.max(0, minCellX);
        i < Math.min(this.numCellsX, maxCellX);
        ++i
      ) {
        for (const obj of this.cells[i + j * this.numCellsX]) {
          objs.add(obj);
        }
      }
    }
    return objs;
  }
}
