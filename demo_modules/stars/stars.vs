precision highp float;

attribute float startTime;

varying float startTimeV;
varying float z;
varying float index;
varying float startOrEnd;

void main() {
  // Advance position by time and some constant v.
  vec3 pos = position;

  z = pos.z;

  startTimeV = startTime;
  float index = mod(float(gl_VertexID), 6.0);
  startOrEnd = index <= 1.0 || index >= 5.0 ? 0.0 : 1.0;

  index = floor(mod(float(gl_VertexID) / 6.0, 2.0));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
