precision highp float;

varying vec2 ss;

void main() {
  ss = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
