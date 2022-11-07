function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    }
    : null;
}

export const GOOGLE_COLORS = [
  "#3369e8",
  "#d50f25",
  "#eeb211",
  "#009925",
  "#FFFFFF",
].map(hexToRgb);

export interface Shape {
  posx: number;
  posy: number;
  size: number;
  myColorIndex: number;
  alpha: number;
  points: number;
}

declare global {
  interface EmittedEvents {
    chaos(data: { time: number; shapes: Shape[] }): void;
  }
}
