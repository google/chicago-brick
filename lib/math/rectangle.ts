/* Copyright 2019 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

interface Point {
  x: number;
  y: number;
}

export class Rectangle {
  static deserialize(str: string) {
    const parts = str.split(",");
    if (parts.length != 4) {
      return null;
    }
    return new Rectangle(
      parseFloat(parts[0]),
      parseFloat(parts[1]),
      parseFloat(parts[2]),
      parseFloat(parts[3]),
    );
  }
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
  ) {
  }
  static centeredAt(x: number, y: number, w: number, h: number): Rectangle {
    return new Rectangle(x - w / 2, y - h / 2, w, h);
  }
  serialize(): string {
    return [this.x, this.y, this.w, this.h].join(",");
  }
  intersects(that: Rectangle): boolean {
    // TODO this can be a (long) one liner.
    if (this.x >= that.x + that.w) {
      return false;
    } else if (this.y >= that.y + that.h) {
      return false;
    } else if (this.x + this.w <= that.x) {
      return false;
    } else if (this.y + this.h <= that.y) {
      return false;
    }

    return true;
  }
  intersection(other: Rectangle): Rectangle {
    const x = Math.max(this.x, other.x);
    const y = Math.max(this.y, other.y);
    return new Rectangle(
      x,
      y,
      Math.min(this.x + this.w, other.x + other.w) - x,
      Math.min(this.y + this.h, other.y + other.h) - y,
    );
  }
  union(other: Rectangle): Rectangle {
    const x = Math.min(this.x, other.x);
    const y = Math.min(this.y, other.y);
    return new Rectangle(
      x,
      y,
      Math.max(this.x + this.w, other.x + other.w) - x,
      Math.max(this.y + this.h, other.y + other.h) - y,
    );
  }
  isInside(p: Point) {
    return p.x >= this.x && p.x < this.x + this.w && p.y >= this.y &&
      p.y < this.y + this.h;
  }
  center(): Point {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }
  translate(p: Point): Rectangle {
    return new Rectangle(
      this.x + p.x,
      this.y + p.y,
      this.w,
      this.h,
    );
  }
  scale(sx: number, sy: number): Rectangle {
    return new Rectangle(
      this.x * sx,
      this.y * sy,
      this.w * sx,
      this.h * sy,
    );
  }
  inset(left: number, top: number, right: number, bottom: number): Rectangle {
    return new Rectangle(
      this.x - left,
      this.y - top,
      this.w - left - right,
      this.h - top - bottom,
    );
  }
}
