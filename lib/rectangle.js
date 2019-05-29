/* Copyright 2018 Google Inc. All Rights Reserved.

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

export class Rectangle {
  static deserialize(str) {
    const parts = str.split(',');
    if (parts.length != 4) {
      return null;
    }
    return new Rectangle(parseFloat(parts[0]), parseFloat(parts[1]),
                         parseFloat(parts[2]), parseFloat(parts[3]));
  }
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }
  static centeredAt(x, y, w, h) {
    return new Rectangle(x - w/2, y - h/2, w, h);
  }
  serialize() {
    return [this.x, this.y, this.w, this.h].join(',');
  }
  intersects(that) {
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
}
