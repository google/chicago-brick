export type HoleSpec = "none" | ["rounded", number] | ["circles", number];

export interface Gear {
  x: number;
  y: number;
  z: number;
  radius: number;
  teeth: number;
  speed: number;
  angle: number;
  colorIndex: number;
  holes: HoleSpec;
  pitch: number;
}

export interface GearDetails {
  pitchDiameter: number;
  diametralPitch: number;
  addendum: number;
  wholeDepth: number;
  radiusAngle: number;
  baseDiameter: number;
  baseRadius: number;
  outsideRadius: number;
  rootRadius: number;
}
