precision highp float;

// Center of the zoom as a fake double.
uniform vec4 zoom_center;

// The current zoom level as a fake double.
uniform vec2 zoom_dp;

// The offset of the screen, in pixels.
uniform vec2 screenOffset;

// The size of the whole screen, in pixels.
uniform vec2 wallDimension;

// The palette bias.
uniform float colorBias;

// The palette use to when drawing the set.
uniform sampler2D palette;

// The screen-space interpolated position of this pixel.
varying vec2 ss;

struct float64 {
  float high;
  float low;
};

// We need some routines that act like normal operations, but won't get
// optimized out by certain aggressive compilers (*cough* nvidia *cough*).
float times_frc(float a, float b) {
  return mix(.0, a * b, b != 0.0 ? 1.0 : 0.0);
}
float add_frc(float a, float b) { return mix(a, a + b, b != 0.0 ? 1.0 : 0.0); }
float sub_frc(float a, float b) { return mix(a, a - b, b != 0.0 ? 1.0 : 0.0); }

float64 add(float64 a, float64 b) {
  float64 ret;
  float t1, t2, e;

  t1 = add_frc(a.high, b.high);
  e = sub_frc(t1, a.high);
  t2 = add_frc(
      add_frc(add_frc(sub_frc(b.high, e), sub_frc(a.high, sub_frc(t1, e))),
              a.low),
      b.low);
  ret.high = add_frc(t1, t2);
  ret.low = sub_frc(t2, sub_frc(ret.high, t1));
  return ret;
}

float64 sub(float64 a, float64 b) {
  float64 ret;
  float t1, t2, e;

  t1 = sub_frc(a.high, b.high);
  e = sub_frc(t1, a.high);
  t2 = sub_frc(add_frc(add_frc(sub_frc(sub_frc(0.0, b.high), e),
                               sub_frc(a.high, sub_frc(t1, e))),
                       a.low),
               b.low);
  ret.high = add_frc(t1, t2);
  ret.low = sub_frc(t2, sub_frc(ret.high, t1));
  return ret;
}

float cmp(float64 a, float64 b) {
  if (a.high < b.high) {
    return -1.;
  }
  if (b.high < a.high) {
    return 1.;
  }
  if (a.low < b.low) {
    return -1.;
  }
  if (b.low < a.low) {
    return 1.;
  }
  return 0.;
}

float64 mul(float64 a, float64 b) {
  float64 ret;
  float c11, c21, c2, e, t1, t2;
  float a1, a2, b1, b2, cona, conb, split = 8193.;

  cona = times_frc(a.high, split);
  conb = times_frc(b.high, split);
  a1 = sub_frc(cona, sub_frc(cona, a.high));
  b1 = sub_frc(conb, sub_frc(conb, b.high));
  a2 = sub_frc(a.high, a1);
  b2 = sub_frc(b.high, b1);

  c11 = times_frc(a.high, b.high);
  c21 = add_frc(
      times_frc(a2, b2),
      add_frc(times_frc(a2, b1),
              add_frc(times_frc(a1, b2), sub_frc(times_frc(a1, b1), c11))));

  c2 = add_frc(times_frc(a.high, b.low), times_frc(a.low, b.high));

  t1 = add_frc(c11, c2);
  e = sub_frc(t1, c11);
  t2 = add_frc(add_frc(times_frc(a.low, b.low),
                       add_frc(sub_frc(c2, e), sub_frc(c11, sub_frc(t1, e)))),
               c21);

  ret.high = add_frc(t1, t2);
  ret.low = sub_frc(t2, sub_frc(ret.high, t1));

  return ret;
}

float64 makeFloat64(float a) { return float64(a, 0.0); }

struct complex64 {
  float64 real;
  float64 imag;
};

complex64 complexAdd(complex64 a, complex64 b) {
  return complex64(add(a.real, b.real), add(a.imag, b.imag));
}

complex64 complexMult(complex64 a, complex64 b) {
  return complex64(sub(mul(a.real, b.real), mul(a.imag, b.imag)),
                   add(mul(a.real, b.imag), mul(a.imag, b.real)));
}

float64 complexLength(complex64 a) {
  return add(mul(a.real, a.real), mul(a.imag, a.imag));
}

complex64 complexScale(complex64 a, float64 s) {
  return complex64(mul(a.real, s), mul(a.imag, s));
}

complex64 makeComplex64(vec2 p) {
  return complex64(makeFloat64(p.x), makeFloat64(p.y));
}

// Determine the color of the point at z.
vec3 color(complex64 z) {
  complex64 c = z;
  int iters = 0;
  for (; iters <= 250; iters++) {
    float64 modulus2 = complexLength(z);
    if (cmp(modulus2, makeFloat64(1.0e3)) > 0.) {
      // look up color
      float smoothIndex = float(iters) + 1.0 - log2(log(modulus2.high));
      float colorLocation = mod((smoothIndex * 4.0 + colorBias), 384.0);

      return texture2D(palette, vec2(colorLocation / 384.0, 0.0)).rgb;
    }
    z = complexAdd(complexMult(z, z), c);
  }
  return vec3(0.0);
}

void main() {
  float screenZoom = 4.0 / wallDimension.x;
  vec2 pixelScreenSpace = ss - wallDimension / 2.0 + screenOffset;
  vec2 mandelbrotSpace = pixelScreenSpace * screenZoom;
  float64 zoom = float64(zoom_dp.x, zoom_dp.y);
  complex64 center = complex64(float64(zoom_center.x, zoom_center.y),
                               float64(zoom_center.z, zoom_center.w));
  complex64 zoomedSpace =
      complexAdd(complexScale(makeComplex64(mandelbrotSpace), zoom), center);

  vec3 chosenColor = color(zoomedSpace);
  gl_FragColor = vec4(chosenColor, 1.0);
}