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

import * as network from "../network/network.ts";
import * as time from "../../lib/adjustable_time.ts";
import { Point } from "../../lib/math/vector2d.ts";

// The monitor in the client displays up-to-date information about what the
// server is doing. It's designed as a debugging tool.
// TODO(applmak): Enable showing the monitor without needing to reload the
// web browser.

class ServerState {
  playlistEvents: StateMachineEvent[] = [];
  moduleSm: StateMachineEvent[] = [];
  serverSm: StateMachineEvent[] = [];
  layoutSm: StateMachineEvent[] = [];

  interrupts: StateMachineEvent[] = [];
}

export interface StateMachineEvent {
  event?: string;
  state?: string;
  time: number;
  deadline?: number;
  color: [number, number, number];
}

export interface MonitoringChange {
  client?: StateMachineEvent;
  module?: StateMachineEvent;
  server?: StateMachineEvent;
  layout?: StateMachineEvent;
  playlist?: StateMachineEvent;
  interrupts?: StateMachineEvent[];
}

class ClientState {
  smEvents: StateMachineEvent[] = [];
  modulesToDraw: string[] = [];
}

const serverState = new ServerState();
const clientState = new ClientState();

const handleModelChange = (change: MonitoringChange) => {
  if (change.layout) {
    serverState.layoutSm.push(change.layout);
  }
  if (change.module) {
    serverState.moduleSm.push(change.module);
  }
  if (change.server) {
    serverState.serverSm.push(change.server);
  }
  if (change.playlist) {
    serverState.playlistEvents.push(change.playlist);
  }
  if (change.interrupts) {
    // An extern event has occurred that should be marked on the monitor.
    // For example, a reload request.
    serverState.interrupts = change.interrupts;
  }
};

const watchForModelChanges = () => {
  network.socket.send("enable-monitoring");
  network.socket.on("monitor", handleModelChange);
};

const stopWatchingModelChanges = () => {
  network.socket.send("disable-monitoring");
  network.socket.removeListener("monitor", handleModelChange);
};

let enabled = false;
let monitoringElement: HTMLElement;

const createMonitoringLayer = () => {
  const l = document.createElement("div");
  l.className = "monitor";

  // l is a thing that everything can doodle in.
  // Our UI presents time as moving from left to right, with a camera that
  // attempts to keep the time beam in the middle of the screen, so that
  // all of the views seem to move from the right to the left.

  const beam = document.createElement("div");
  beam.className = "beam";

  // Every state machine gets its own horizontal stripe across the whole view,
  // gravity towards the bottom, with layout sm on the bottom, module sm next,
  // server sm next, then client-local sm next. Every transition is marked as
  // a line across the box at a specific timestamp. The name of the demarcated
  // states are always visible. Each state machine might move through time at
  // a different rate in order to show known upcoming layout changes.

  const timeLabels = document.createElement("div");
  timeLabels.className = "time-label";

  const earliestTime = document.createElement("span");
  earliestTime.className = "label early";
  const nowTime = document.createElement("span");
  nowTime.className = "label now";
  const latestTime = document.createElement("span");
  latestTime.className = "label late";
  timeLabels.appendChild(earliestTime);
  timeLabels.appendChild(nowTime);
  timeLabels.appendChild(latestTime);

  const playlist = document.createElement("div");
  playlist.className = "playlist timeline";
  playlist.textContent = "Playlist";
  const playlistCanvas = document.createElement("canvas");
  playlist.appendChild(playlistCanvas);

  const layoutSM = document.createElement("div");
  layoutSM.className = "layout-sm timeline";
  layoutSM.textContent = "Layout";
  const layoutSMCanvas = document.createElement("canvas");
  layoutSM.appendChild(layoutSMCanvas);

  const moduleSM = document.createElement("div");
  moduleSM.className = "module-sm timeline";
  moduleSM.textContent = "Module";
  const moduleSMCanvas = document.createElement("canvas");
  moduleSM.appendChild(moduleSMCanvas);

  const serverSM = document.createElement("div");
  serverSM.className = "server-sm timeline";
  serverSM.textContent = "Server";
  const serverSMCanvas = document.createElement("canvas");
  serverSM.appendChild(serverSMCanvas);

  const clientSM = document.createElement("div");
  clientSM.className = "client-sm timeline";
  clientSM.textContent = "Client";
  const clientSMCanvas = document.createElement("canvas");
  clientSM.appendChild(clientSMCanvas);

  // On top of that, there's a line graph (that syncs up with the
  // timeline of the client-local graph) which contains information about
  // frame timing (one frame per pixel, probs), and a graph of a windowed
  // version of that data over the last N frames.

  const instantFps = document.createElement("div");
  instantFps.className = "instant timeline";
  instantFps.textContent = "FPS";
  const instantFpsCanvas = document.createElement("canvas");
  instantFps.appendChild(instantFpsCanvas);

  const timeDrift = document.createElement("div");
  timeDrift.className = "time-drift timeline";
  timeDrift.textContent = "Sync";
  const timeDriftCanvas = document.createElement("canvas");
  timeDrift.appendChild(timeDriftCanvas);

  const modulesToDrawDiv = document.createElement("div");
  modulesToDrawDiv.className = "modules-to-draw";

  // Add top-to-bottom:
  l.appendChild(timeDrift);
  l.appendChild(instantFps);
  l.appendChild(clientSM);
  l.appendChild(serverSM);
  l.appendChild(moduleSM);
  l.appendChild(layoutSM);
  l.appendChild(playlist);
  l.appendChild(timeLabels);

  l.appendChild(beam);

  l.appendChild(modulesToDrawDiv);

  return l;
};

interface WritableArrayLike<T> extends ArrayLike<T> {
  [index: number]: T;
}

class CircularBuffer<T> {
  data: WritableArrayLike<T>;
  size: number;
  nextWriteIndex: number;
  constructor(
    size: number,
    arrayType: { new (size: number): WritableArrayLike<T> },
  ) {
    this.data = new arrayType(size);
    this.size = 0;
    this.nextWriteIndex = 0;
  }
  get capacity() {
    return this.data.length;
  }
  get length() {
    return this.size;
  }
  push(value: T) {
    this.data[this.nextWriteIndex++] = value;
    this.size = Math.max(this.nextWriteIndex, this.size);
    this.nextWriteIndex = this.nextWriteIndex % this.capacity;
  }
  *[Symbol.iterator](): Iterator<T> {
    yield* this.last(this.size);
  }
  *range(start: number, N: number): Iterable<T> {
    // Now, we start at start and go to the end of the buffer or end,
    // whichever comes first.
    for (let i = start; i < Math.min(start + N, this.capacity); ++i) {
      yield this.data[i];
    }

    // Now, if end <= start
    if (start + N > this.capacity) {
      const end = start + N - this.capacity;
      for (let i = 0; i < end; ++i) {
        yield this.data[i];
      }
    }
  }
  *last(N: number): Iterable<T> {
    N = Math.max(0, Math.min(N, this.size));
    const start = (this.nextWriteIndex - N + this.capacity) % this.capacity;
    yield* this.range(start, N);
  }
  get(i: number): T | undefined {
    if (i >= this.size) {
      throw new Error("out of bounds");
    }
    for (const x of this.last(this.size - i)) {
      return x;
    }
  }
}

interface Range {
  min: number;
  max: number;
}

class Canvas {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly c: CanvasRenderingContext2D;
  readonly frame: {
    domain: Range;
    range: Range;
  };
  bounds: {
    domain: Range;
    range: Range;
  };

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = (canvas.parentNode! as Element).clientWidth;
    canvas.height = (canvas.parentNode! as Element).clientHeight;

    this.canvas = canvas;

    // TODO(applmak): Enable this for high-dpi devices, and fix the display.
    // let ratio = window.devicePixelRatio;
    // let {left, top, bottom, right} = this.canvas.getBoundingClientRect();
    // canvas.width = Math.floor(right * ratio) - Math.floor(left * ratio);
    // canvas.height = Math.floor(bottom * ratio) - Math.floor(top * ratio);

    this.width = canvas.width;
    this.height = canvas.height;
    this.c = canvas.getContext("2d")!;
    this.bounds = { domain: { min: 0, max: 1 }, range: { min: 0, max: 1 } };
    this.frame = {
      domain: { min: 0, max: this.canvas.width },
      range: { min: 0, max: this.canvas.height },
    };
  }
  clear() {
    this.c.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  scaleX(): number {
    return this.bounds.domain.max == this.bounds.domain.min
      ? 1.0
      : (this.frame.domain.max - this.frame.domain.min) /
        (this.bounds.domain.max - this.bounds.domain.min);
  }
  scaleY(): number {
    return this.bounds.range.max == this.bounds.range.min
      ? 1.0
      : (this.frame.range.max - this.frame.range.min) /
        (this.bounds.range.max - this.bounds.range.min);
  }
  convertX(x: number): number {
    const scale = this.scaleX();
    return Math.floor(
      (x - this.bounds.domain.min) * scale + this.frame.domain.min,
    );
  }
  convertY(y: number): number {
    const scale = this.scaleY();
    return this.canvas.height - 1 -
      Math.floor((y - this.bounds.range.min) * scale + this.frame.range.min);
  }
  convert(x: number, y: number): Point {
    return {
      x: this.convertX(x),
      y: this.convertY(y),
    };
  }
  strokeStyle(r: number, g: number, b: number, a = 1.0) {
    this.c.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  strokeGeneratedPath(iter: Iterable<[number, number]>) {
    this.c.beginPath();
    let i = 0;
    for (const [x, y] of iter) {
      const { x: cx, y: cy } = this.convert(x, y);
      (i == 0 ? this.c.moveTo : this.c.lineTo).call(this.c, cx + 0.5, cy + 0.5);
      i++;
    }
    this.c.stroke();
  }
  fillStyle(r: number, g: number, b: number, a = 1.0) {
    this.c.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.c.fillRect(x, y, w, h);
  }
  fillCircle(cx: number, cy: number, r: number) {
    this.c.beginPath();
    this.c.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2, false);
    this.c.fill();
  }
  font(style: string, weight = "normal") {
    this.c.font = `${weight} ${style}`;
  }
  text(text: string, x: number, y: number, baseline: CanvasTextBaseline) {
    const width = this.c.measureText(text);
    this.c.textBaseline = baseline;
    this.c.fillText(text, this.convertX(x), this.convertY(y));
    return width;
  }
  strokeArrow(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    fanLength: number,
    fanAngle = Math.PI / 4.0,
  ) {
    // Arrow: --->
    // Calculate delta arrow in data-space.
    let deltaX = x1 - x2;
    let deltaY = y1 - y2;
    // Convert to frame space to do make the arrow fans.
    deltaX *= this.scaleX();
    deltaY *= this.scaleY();

    const l = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    deltaX *= fanLength / l;
    deltaY *= fanLength / l;

    let p1x = Math.cos(fanAngle) * deltaX + Math.sin(fanAngle) * deltaY;
    let p1y = -Math.sin(fanAngle) * deltaX + Math.cos(fanAngle) * deltaY;

    let p2x = Math.cos(-fanAngle) * deltaX + Math.sin(-fanAngle) * deltaY;
    let p2y = -Math.sin(-fanAngle) * deltaX + Math.cos(-fanAngle) * deltaY;

    // Convert back to data space.
    p1x /= this.scaleX();
    p1y /= this.scaleY();

    p2x /= this.scaleX();
    p2y /= this.scaleY();

    this.strokeGeneratedPath([[x1, y1], [x2, y2], [x2 + p1x, y2 + p1y], [
      x2,
      y2,
    ], [x2 + p2x, y2 + p2y]]);
  }
  static calculateBounds(data: Iterable<[number, number]>) {
    const ret = {
      domain: { min: Infinity, max: -Infinity },
      range: { min: Infinity, max: -Infinity },
    };
    for (const [x, y] of data) {
      ret.domain.min = Math.min(x, ret.domain.min);
      ret.domain.max = Math.max(x, ret.domain.max);
      ret.range.min = Math.min(y, ret.range.min);
      ret.range.max = Math.max(y, ret.range.max);
    }
    return ret;
  }
}

class StateTimeline {
  readonly canvas: Canvas;
  oldestState: StateMachineEvent | null;
  oldestEvent: StateMachineEvent | null;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = new Canvas(canvas);
    this.oldestState = null;
    this.oldestEvent = null;
  }
  draw(events: StateMachineEvent[], earlyTime: number, lateTime: number) {
    this.canvas.clear();
    this.canvas.bounds.domain.min = earlyTime;
    this.canvas.bounds.domain.max = lateTime;
    this.canvas.strokeStyle(255, 255, 255);
    this.canvas.fillStyle(255, 255, 255);
    this.canvas.font("12pt monospace", "bolder");

    // Draw oldest state.
    const oldestState = events.filter((e) => e.state).shift();
    if (oldestState && oldestState.time <= earlyTime) {
      this.oldestState = oldestState;
    }
    if (this.oldestState) {
      this.canvas.fillStyle(127, 127, 127);
      this.canvas.text(this.oldestState.state!, earlyTime + 2, 0.5, "middle");
    }

    const oldestEvent = events.filter((e) => e.event).shift();
    if (oldestEvent && oldestEvent.time <= earlyTime) {
      this.oldestEvent = oldestEvent;
    }
    if (this.oldestEvent) {
      this.canvas.fillStyle(160, 160, 127);
      this.canvas.text(this.oldestEvent.event!, earlyTime + 2, 0.166, "middle");
    }

    const labelSlotsEnds = [0, 0];

    const pickASlot = () => {
      const slots = labelSlotsEnds.map((v, i) => ({ v, i }));
      slots.sort((a, b) => a.v - b.v);
      return slots.shift();
    };

    return events.filter((e) => {
      // There are two kinds of events: Ones with 'state' and ones without.
      if (e.state) {
        this.canvas.strokeStyle(160, 160, 160);
        this.canvas.fillStyle(160, 160, 160);

        let x = e.time;
        if (e.deadline) {
          this.canvas.strokeArrow(e.time, 0.1, e.deadline, 0.1, 5);
          x = (e.time + e.deadline) * 0.5;
        }
        this.canvas.strokeGeneratedPath([[e.time, 0.0], [e.time, 1.0]]);

        // Text describing the state.
        const state = e.state.replace(/State$/, "");
        this.canvas.text(state, x, 1 / 6.0, "middle");
      } else {
        if (e.deadline) {
          this.canvas.strokeStyle(100, 100, 100);
          this.canvas.strokeArrow(e.time, 0.5, e.deadline, 0.5, 5);
        }

        const bestSlot = pickASlot()!;
        const y = 1.0 / 6 * ((bestSlot.i + 1) * 2 + 1);

        const color = e.color || [255, 255, 160];
        this.canvas.strokeStyle(...color);
        this.canvas.fillStyle(...color);
        this.canvas.strokeGeneratedPath([[e.time, 0.0], [e.time, 1.0]]);
        const measurement = this.canvas.text(e.event!, e.time, y, "middle");
        labelSlotsEnds[bestSlot.i] = this.canvas.convertX(e.time) +
          measurement.width + 2;
      }

      if (e.deadline) {
        return e.deadline >= earlyTime;
      } else {
        return e.time >= earlyTime - 10;
      }
    });
  }
}

function isIterator<T>(i: Iterator<T> | Iterable<T>): i is Iterator<T> {
  return !!((i as Iterator<T>).next);
}

interface IterableArrayLike<T> extends ArrayLike<T> {
  [Symbol.iterator](): Iterator<T>;
}

function* izip<T>(
  a: Iterator<T> | Iterable<T> | IterableArrayLike<T>,
  b: Iterator<T> | Iterable<T> | IterableArrayLike<T>,
): Iterable<[T, T]> {
  if (!isIterator(a)) {
    a = a[Symbol.iterator]();
  }
  if (!isIterator(b)) {
    b = b[Symbol.iterator]();
  }
  for (
    let aVal = a.next(), bVal = b.next();
    !aVal.done && !bVal.done;
    aVal = a.next(), bVal = b.next()
  ) {
    yield [aVal.value, bVal.value];
  }
}

function* allNumbers(): Iterable<number> {
  for (let i = 0;; ++i) {
    yield i;
  }
}

let localFrameTimes: CircularBuffer<number>,
  syncedFrameTimes: CircularBuffer<number>,
  localTimeDeltas: CircularBuffer<number>,
  syncedTimeDeltas: CircularBuffer<number>;
let driftDeltaTimes: CircularBuffer<number>;
let clientSmTimeline: StateTimeline,
  serverSmTimeline: StateTimeline,
  moduleSmTimeline: StateTimeline,
  layoutSmTimeline: StateTimeline,
  playlistTimeline: StateTimeline;
const updateUI = () => {
  const t = time.now();
  const width = monitoringElement.offsetWidth;
  // Assume 60 fps, assume 1 frame of data per pixel.

  if (!localFrameTimes) {
    localFrameTimes = new CircularBuffer(width / 2, Float32Array);
    syncedFrameTimes = new CircularBuffer(width / 2, Float32Array);
    localTimeDeltas = new CircularBuffer(width / 2, Float32Array);
    syncedTimeDeltas = new CircularBuffer(width / 2, Float32Array);

    driftDeltaTimes = new CircularBuffer(width / 2, Float32Array);
  }

  // Update fps
  localFrameTimes.push(performance.now());
  syncedFrameTimes.push(t);

  if (localFrameTimes.size > 1) {
    const [oldT, newT] = localFrameTimes.last(2);
    localTimeDeltas.push(newT - oldT);
  }
  if (syncedFrameTimes.size > 1) {
    const [oldT, newT] = syncedFrameTimes.last(2);
    syncedTimeDeltas.push(newT - oldT);
  }

  const instantFpsCanvas = new Canvas(
    monitoringElement.querySelector(".instant.timeline canvas")!,
  );
  instantFpsCanvas.clear();
  {
    const bounds = Canvas.calculateBounds(
      izip(localFrameTimes, localTimeDeltas),
    );
    // Range must include 10 - 20 and not be > 100.
    bounds.range.min = Math.min(bounds.range.min, 10);
    bounds.range.max = Math.max(Math.min(bounds.range.max, 100), 20);
    instantFpsCanvas.bounds = bounds;
  }

  // Really, anything < 17ms is probably fine.
  instantFpsCanvas.fillStyle(0, 255, 0, 0.2);
  instantFpsCanvas.fillRect(
    0,
    instantFpsCanvas.convertY(0),
    instantFpsCanvas.width / 2,
    instantFpsCanvas.convertY(17) - instantFpsCanvas.convertY(0),
  );
  // Stuff between 17 and < 34 is less fine.
  instantFpsCanvas.fillStyle(255, 255, 0, 0.2);
  instantFpsCanvas.fillRect(
    0,
    instantFpsCanvas.convertY(17),
    instantFpsCanvas.width / 2,
    instantFpsCanvas.convertY(34) - instantFpsCanvas.convertY(17),
  );
  // Stuff > 34 is not fine.
  instantFpsCanvas.fillStyle(255, 0, 0, 0.2);
  instantFpsCanvas.fillRect(
    0,
    instantFpsCanvas.convertY(34),
    instantFpsCanvas.width / 2,
    instantFpsCanvas.convertY(instantFpsCanvas.bounds.range.max) -
      instantFpsCanvas.convertY(34),
  );

  // We want 1 pixel per 16.666ms, so we'll convert the whole range into
  // 60fps slices, and map THAT onto pixels.
  const graphWidth =
    (instantFpsCanvas.bounds.domain.max - instantFpsCanvas.bounds.domain.min) /
    1000 * 60;
  instantFpsCanvas.frame.domain.min = Math.floor(instantFpsCanvas.width / 2) -
    graphWidth;
  instantFpsCanvas.frame.domain.max = Math.floor(instantFpsCanvas.width / 2);

  instantFpsCanvas.strokeStyle(255, 255, 127);
  instantFpsCanvas.strokeGeneratedPath(izip(localFrameTimes, localTimeDeltas));

  // Update drift
  if (localTimeDeltas.size) {
    const a = [...localTimeDeltas.last(1)][0];
    const b = [...syncedTimeDeltas.last(1)][0];
    driftDeltaTimes.push(b - a);

    const clockDriftCanvas = new Canvas(
      monitoringElement.querySelector(".time-drift.timeline canvas")!,
    );
    clockDriftCanvas.clear();

    clockDriftCanvas.bounds = {
      domain: { min: 0, max: driftDeltaTimes.length },
      range: { min: -33, max: 33 },
    };
    clockDriftCanvas.frame.domain.min = clockDriftCanvas.width / 2 -
      driftDeltaTimes.length;
    clockDriftCanvas.frame.domain.max = clockDriftCanvas.width / 2;

    // Draw 1 frame zone.
    clockDriftCanvas.fillStyle(0, 255, 0, 0.2);
    clockDriftCanvas.fillRect(
      0,
      clockDriftCanvas.convertY(-16),
      clockDriftCanvas.width / 2,
      clockDriftCanvas.convertY(16) - clockDriftCanvas.convertY(-16),
    );

    // Draw axes.
    clockDriftCanvas.strokeStyle(255, 255, 255, 0.2);
    clockDriftCanvas.strokeGeneratedPath([[0, 0], [driftDeltaTimes.length, 0]]);

    clockDriftCanvas.strokeStyle(255, 255, 255, 1.0);
    clockDriftCanvas.strokeGeneratedPath(izip(allNumbers(), driftDeltaTimes));
  }

  // Calculate time bounds:
  const timeWidth = width / 1 / 60.0 * 1000.0;

  const earlyTime = t - timeWidth / 2;
  const lateTime = t + timeWidth / 2;

  // Update client local sm
  if (!clientSmTimeline) {
    clientSmTimeline = new StateTimeline(
      monitoringElement.querySelector(".client-sm.timeline canvas")!,
    );
  }
  clientState.smEvents = clientSmTimeline.draw(
    clientState.smEvents,
    earlyTime,
    lateTime,
  );

  // Update server server sm
  if (!serverSmTimeline) {
    serverSmTimeline = new StateTimeline(
      monitoringElement.querySelector(".server-sm.timeline canvas")!,
    );
  }
  serverState.serverSm = serverSmTimeline.draw(
    serverState.serverSm,
    earlyTime,
    lateTime,
  );

  // Update server module sm
  if (!moduleSmTimeline) {
    moduleSmTimeline = new StateTimeline(
      monitoringElement.querySelector(".module-sm.timeline canvas")!,
    );
  }
  serverState.moduleSm = moduleSmTimeline.draw(
    serverState.moduleSm,
    earlyTime,
    lateTime,
  );

  // Update server layout sm
  if (!layoutSmTimeline) {
    layoutSmTimeline = new StateTimeline(
      monitoringElement.querySelector(".layout-sm.timeline canvas")!,
    );
  }
  serverState.layoutSm = layoutSmTimeline.draw(
    serverState.layoutSm,
    earlyTime,
    lateTime,
  );

  // Update server playlist
  if (!playlistTimeline) {
    playlistTimeline = new StateTimeline(
      monitoringElement.querySelector(".playlist.timeline canvas")!,
    );
  }
  serverState.playlistEvents = playlistTimeline.draw(
    serverState.playlistEvents,
    earlyTime,
    lateTime,
  );

  // Update the time labels.
  monitoringElement.querySelector(".label.early")!.textContent =
    (earlyTime / 1000).toFixed(1);
  monitoringElement.querySelector(".label.now")!.textContent = (t / 1000)
    .toFixed(1);
  monitoringElement.querySelector(".label.late")!.textContent =
    (lateTime / 1000)
      .toFixed(1);

  // Update drawn modules.
  monitoringElement.querySelector(".modules-to-draw")!.textContent = clientState
    .modulesToDraw.join("\n");

  if (enabled) {
    self.requestAnimationFrame(updateUI);
  }
};

export function isEnabled() {
  return enabled;
}
export function enable() {
  enabled = true;
  watchForModelChanges();
  monitoringElement = createMonitoringLayer();
  document.body.appendChild(monitoringElement);
  updateUI();
}
export function disable() {
  enabled = false;
  stopWatchingModelChanges();
  monitoringElement.remove();
}

export function update(change: MonitoringChange) {
  if (enabled) {
    if (change.client) {
      clientState.smEvents.push(change.client);
    }
  }
}
export function markDrawnModules(modulesToDraw: string[]) {
  clientState.modulesToDraw = modulesToDraw;
}

declare global {
  interface EmittedEvents {
    "enable-monitoring": () => void;
    "disable-monitoring": () => void;
  }
}
