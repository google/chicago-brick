precision highp float;

attribute float startTime;

varying float startTimeV;
varying float z;
varying float index;

void main() {
  // Advance position by time and some constant v.
  vec3 pos = position;

  z = pos.z;

  startTimeV = startTime;

  index = floor(mod(float(gl_VertexID) / 6.0, 2.0));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
