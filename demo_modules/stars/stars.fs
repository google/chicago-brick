uniform float time;

varying float startTimeV;
varying float z;
varying float index;
varying float startOrEnd;

const float TIME = 500.0f;
const float FADE_OUT_DISTANCE = 0.1;

void main() {
  // Fade in the point over some time.
  float fadeInAlpha = clamp((time - startTimeV) / TIME, 0.0, 1.0);

  // Fade out as we get close to camera. The camera plane is at -0.1.
  float fadeOutAlpha = 1.0 - clamp((z + 1.0) / -FADE_OUT_DISTANCE, 0.0, 1.0);

  vec4 normalColor =
      mix(vec4(1.0, 0.95, 0.95, 1.0), vec4(0.95, 1.0, 0.95, 1.0), index);

  vec4 fadeInColor = mix(vec4(0.0), normalColor, fadeInAlpha);

  vec4 fadeOutColor = mix(fadeInColor, vec4(0.0), fadeOutAlpha);

  // Fade out as we get to the end of the trail.
  gl_FragColor = mix(vec4(0.0), fadeOutColor, startOrEnd);
}