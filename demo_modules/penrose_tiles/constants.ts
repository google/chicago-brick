export const PHI = (1 + Math.sqrt(5)) / 2; // the Golden Ratio
export const PI_OVER_5 = Math.PI / 5; // 72 degrees, the primary angle used in P2 tiles
export const MAX_GENS = 7;
// Each gen will have four cycles of transitions from one color to the next (except the very first)
// each followed by a same-length cycle holding that color
export const GEN_LENGTH_MILLIS = 10_000;

export type HSL = {
    hue: number;
    sat: number;
    val: number;
}

function makeHSL(vals: number[]) {
    return {
        hue: vals[0],
        sat: vals[1],
        val: vals[2],
    };
}

// from https://brand-tools.appspot.com/google-colors/?surface=coated&type=hsl
export const GOOGLE_COLORS_600_HSL = [
    // turn/sat%/light%
    makeHSL([ 3/360, 0.71, 0.5]), // red
    makeHSL([ 41/360, 1.0, 0.49]), // yellow
    makeHSL([ 147/360, 0.66, 0.34]), // green
    makeHSL([ 214/360, 0.82, 0.51]), // blue
]