function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

const GOOGLE_COLORS = ['#3369e8', '#d50f25', '#eeb211', '#009925', '#FFFFFF'].map(hexToRgb);

module.exports = {GOOGLE_COLORS};
