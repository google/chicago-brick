import { Rectangle } from "../../lib/math/rectangle.ts";
import { dist, Point } from "../../lib/math/vector2d.ts";

function shadeColor(color: string, percent: number) {
  // from SO post: http://stackoverflow.com/questions/5560248/programmatically-lighten-or-darken-a-hex-color-or-rgb-and-blend-colors
  let R = parseInt(color.substring(1, 3), 16);
  let G = parseInt(color.substring(3, 5), 16);
  let B = parseInt(color.substring(5, 7), 16);

  R = Math.floor(R * (100 + percent) / 100);
  G = Math.floor(G * (100 + percent) / 100);
  B = Math.floor(B * (100 + percent) / 100);

  R = (R < 255) ? R : 255;
  G = (G < 255) ? G : 255;
  B = (B < 255) ? B : 255;

  const RR = R.toString(16).padStart(2, "0");
  const GG = G.toString(16).padStart(2, "0");
  const BB = B.toString(16).padStart(2, "0");

  return "#" + RR + GG + BB;
}

export class Ball {
  color: { fill: string; edge: string };
  constructor(
    public id: string,
    public position: Point,
    public radius: number,
    color: string,
    public velocity: Point,
  ) {
    this.position = position;
    this.radius = radius;
    this.color = {
      fill: color,
      edge: shadeColor(color, -25),
    };
    this.velocity = velocity;
  }
  alive() {
    return this.radius > 0;
  }
  dead() {
    return !this.alive();
  }
  contains(ball: Ball) {
    // distance between ball centers
    const distance = dist(this.position, ball.position);

    return distance < (this.radius + ball.radius) * 0.85;
  }
  get extents() {
    return Rectangle.centeredAt(
      this.position.x,
      this.position.y,
      2 * this.radius,
      2 * this.radius,
    );
  }
  merge(ball: Ball) {
    // Merge balls weighting by area.
    const area = Math.PI * Math.pow(this.radius, 2);
    const ballArea = Math.PI * Math.pow(ball.radius, 2);

    const newArea = area + ballArea;

    this.velocity = {
      x: (this.velocity.x * area + ball.velocity.x * ballArea) / newArea,
      y: (this.velocity.y * area + ball.velocity.y * ballArea) / newArea,
    };

    this.radius = Math.sqrt(newArea / Math.PI);

    // Kill this ball.
    ball.radius = 0;
    ball.position.x = NaN;
    ball.position.y = NaN;
  }
}
