export const V = 0.001;
export const MAX_NEW_STARS = 10000;

export interface Star {
  x: number;
  y: number;
  z: number;
  index: number;
  size: number;
  spawnTime: number;
}

declare global {
  interface EmittedEvents {
    "stars:new-star": (stars: Star[]) => void;
    "stars:set-warp": (factor: number) => void;
  }
}
