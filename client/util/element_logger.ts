import { addLogger } from "../../lib/log.ts";

const COLORS = [
  "#0074D9",
  "#7FDBFF",
  "#39CCCC",
  "#B10DC9",
  "#F012BE",
  "#85144b",
  "#FF4136",
  "#FF851B",
  "#FFDC00",
  "#3D9970",
  "#2ECC40",
  "#01FF70",
  "#AAAAAA",
  "#DDDDDD",
  "#FFFFFF",
];

let nextColor = 0;
const COLOR_ASSIGNMENTS = new Map();

/** Initializes the logger's display onto the body. */
export function init() {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "0";
  el.style.right = "0";
  el.style.top = "0";
  el.style.bottom = "0";
  el.style.font = "10px Monaco, monospace";
  el.style.color = "white";
  el.style.overflowY = "auto";
  document.body.appendChild(el);

  addLogger((channel, severity, args) => {
    const lineEl = document.createElement("div");
    let color = COLOR_ASSIGNMENTS.get(channel);
    if (!color) {
      color = COLORS[nextColor];
      COLOR_ASSIGNMENTS.set(channel, color);
      nextColor = (nextColor + 1) % COLORS.length;
    }
    lineEl.style.color = color;
    const style = severity <= -2
      ? "boldest"
      : severity == -1
      ? "bold"
      : "normal";
    lineEl.style.fontWeight = style;
    lineEl.textContent = `${performance.now().toFixed(3)} ${
      severity <= -2
        ? "E"
        : severity == -1
        ? "W"
        : severity == 0
        ? "I"
        : `D${severity}`
    }: [${channel}] ${args.map((arg) => String(arg)).join(" ")}`;
    el.appendChild(lineEl);
    el.scrollTop = el.scrollHeight;
  });
}
