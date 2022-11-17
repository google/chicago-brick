export interface Destination {
  x: number;
  y: number;
  r: number;
}

declare global {
  interface EmittedEvents {
    "mandelbrot:points": (d: Destination[]) => void;
  }
}
