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

// `_frc` routines act like normal operations, but won't get
// optimized out by certain aggressive compilers (*cough* nvidia *cough*).
float times_frc(float a, float b) {return mix(.0, a * b, b != 0.0 ? 1.0 : 0.0);}
float add_frc(float a, float b) { return mix(a, a + b, b != 0.0 ? 1.0 : 0.0); }
float sub_frc(float a, float b) { return mix(a, a - b, b != 0.0 ? 1.0 : 0.0); }

// `_fast` are normal routine implementations.
// They are much faster but may result in loss of precision.
float times_fast(float a, float b) {return a*b;}
float add_fast(float a, float b) { return a+b; }
float sub_fast(float a, float b) { return a-b; }

// If set, routines will prefer fast operations isntead of frc.
// In some places (found empirically by using higher zoom and switching ops one
// by one) frc is always used because fast operations result in artifacts.
#define PREFER_FAST_MATH 1

#if PREFER_FAST_MATH
#define times times_fast
#define add add_fast
#define sub sub_fast
#else
#define times times_frc
#define add add_frc
#define sub sub_frc
#endif

struct float64 {
  float high;
  float low;
};

float64 makeFloat64(float a) { return float64(a, 0.0); }

float64 mul(float64 a, float64 b) {
  float64 ret;
  float c11, c21, c2, e, t1, t2;
  float a1, a2, b1, b2, cona, conb, split = 8193.;

  cona = times(a.high, split);
  conb = times(b.high, split);
  a1 = sub_frc(cona, sub(cona, a.high));
  b1 = sub_frc(conb, sub(conb, b.high));
  a2 = sub(a.high, a1);
  b2 = sub(b.high, b1);

  c11 = times(a.high, b.high);
  c21 = add(
      times(a2, b2),
      add(times(a2, b1),
              add(times(a1, b2), sub(times(a1, b1), c11))));

  c2 = add(times(a.high, b.low), times(a.low, b.high));

  t1 = add(c11, c2);
  e = sub_frc(t1, c11);
  t2 = add(add(times(a.low, b.low),
                       add(sub(c2, e), sub(c11, sub(t1, e)))),
               c21);

  ret.high = add(t1, t2);
  ret.low = sub(t2, sub_frc(ret.high, t1));

  return ret;
}

float64 square(float64 a) {
  float64 ret;
  float c11, c21, c2, e, t1, t2;
  float a1, a2, b1, b2, cona, conb, split = 8193.;

  cona = times(a.high, split);
  a1 = sub_frc(cona, sub(cona, a.high));
  a2 = sub(a.high, a1);

  c11 = times(a.high, a.high);
  c21 = add(
      times(a2, a2),
      add(times(a2, a1),
              add(times(a1, a2), sub(times(a1, a1), c11))));

  c2 = add(times(a.high, a.low), times(a.low, a.high));

  t1 = add(c11, c2);
  e = sub_frc(t1, c11);
  t2 = add(add(times(a.low, a.low),
                       add(sub(c2, e), sub(c11, sub(t1, e)))),
               c21);

  ret.high = add(t1, t2);
  ret.low = sub(t2, sub_frc(ret.high, t1));

  return ret;
}

float64 add(float64 a, float64 b) {
  float64 ret;
  float t1, t2, e;

  t1 = add(a.high, b.high);
  e = sub_frc(t1, a.high);
  t2 = add(
      add(add(sub(b.high, e), sub(a.high, sub_frc(t1, e))),
              a.low),
      b.low);
  ret.high = add(t1, t2);
  ret.low = sub(t2, sub_frc(ret.high, t1));
  return ret;
}

float64 sub(float64 a, float64 b) {
  float64 ret;
  float t1, t2, e;
  t1 = sub(a.high, b.high);
  e = sub_frc(t1, a.high);

  t2 = sub(add(add(sub(sub(0.0, b.high), e),
                               sub(a.high, sub_frc(t1, e))),
                       a.low),
               b.low);
  ret.high = add(t1, t2);
  ret.low = sub(t2, sub_frc(ret.high, t1));

  return ret;
}

// Returns a*2. Fast but loses precision.
float64 unpreciseTimes2(float64 a) {
  return float64(a.high+a.high, a.low+a.low);
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

bool eqEps(float64 a, float64 b) {
  const float eps = 0.00001;
  return abs(a.high - b.high) < eps && abs(a.low - b.low) < eps;
}

// Determine the color of the point at z.
// 64-bit version.
vec3 colorF64(const complex64 z) {
  float64 x = z.real;
  float64 y = z.imag;

  float64 x2 = square(x);
  float64 y2 = square(y);

  int period = 0;
  float64 xold = x;
  float64 yold = y;

  int iters = 0;
  for (; iters <= 250; iters++) {
    if (x2.high + y2.high > 4.0) {
      float smoothIndex = float(iters) + 1.0 - log2(log(x2.high + y2.high));
      float colorLocation = mod((smoothIndex * 4.0 + colorBias), 384.0);

      return texture2D(palette, vec2(colorLocation / 384.0, 0.0)).rgb;
    }

    y = add(mul(unpreciseTimes2(x), y), z.imag);
    x = add(sub(x2, y2), z.real);

    // If we have already encountered this point, the function will not diverge,
    // so we're inside the set and can bail early.
    if (eqEps(x, xold) && eqEps(y, yold)) {
      break;
    }

    period++;
    // Save x and y every 20 iterations for periodity checking.
    if (period > 20) {
      period = 0;
      xold = x;
      yold = y;
    }

    x2 = square(x);
    y2 = square(y);
  }
  return vec3(0.0);
}

// Multiplication if two complex numbers x+y*i represented by vec2.
vec2 v2ComplexMult(vec2 a, vec2 b) {
  return vec2(a.x*b.x - a.y*b.y, a.x*b.y+a.y*b.x);
}

// Determine the color of the point at z.
// float version.
vec3 colorFloat(vec2 z) {
  vec2 c = z;
  int iters = 0;

  for (; iters <= 250; iters++) {
    float modulus2 = z.x*z.x+z.y*z.y;
    if (modulus2 > 1.0e3) {
      // look up color
      float smoothIndex = float(iters) + 1.0 - log2(log(modulus2));
      float colorLocation = mod((smoothIndex * 4.0 + colorBias), 384.0);

      return texture2D(palette, vec2(colorLocation / 384.0, 0.0)).rgb;
    }

    z = v2ComplexMult(z, z) + c;
  }
  return vec3(0.0);
}

void main() {
  float screenZoom = 4.0 / wallDimension.x;
  vec2 pixelScreenSpace = ss - wallDimension / 2.0 + screenOffset;
  vec2 mandelbrotSpace = pixelScreenSpace * screenZoom;

  vec3 chosenColor;

// Set to 1 to enable floats in initial zoom levels.
#define USE_FLOATS_FOR_LOW_ZOOM_LEVELS 1

#if USE_FLOATS_FOR_LOW_ZOOM_LEVELS
  // Floats look good until roughly this zoom level.
  // Afterwards they start looking blocky.
  if (zoom_dp.x > 1.0e-5) {
#else
  if (false) {
#endif
    // `zoom_dp` is a fake double represented by vec2.
    // The zoom value we want fits in the float, which is the high part or `.x`.
    float zoom = zoom_dp.x;

    // `zoom_center` is a vector of two fake doubles.
    // Here we take the high parts from both.
    vec2 zoomedSpace = mandelbrotSpace * zoom + zoom_center.xz;

    chosenColor = colorFloat(zoomedSpace);
  } else {
    float64 zoom = float64(zoom_dp.x, zoom_dp.y);
    complex64 center = complex64(float64(zoom_center.x, zoom_center.y),
                                float64(zoom_center.z, zoom_center.w));
    complex64 zoomedSpace =
        complexAdd(complexScale(makeComplex64(mandelbrotSpace), zoom), center);

    chosenColor = colorF64(zoomedSpace);
  }

  gl_FragColor = vec4(chosenColor, 1.0);
}
