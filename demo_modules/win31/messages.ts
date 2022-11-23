export interface State {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

declare global {
  interface EmittedEvents {
    "win31:crash": () => void;
  }
}
