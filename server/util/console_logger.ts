import * as colors from "https://deno.land/std@0.166.0/fmt/colors.ts";
import {
  isStringWithOptions,
  StringWithOptions,
} from "../../lib/console_logger.ts";

export const consoleLogger = (...strings: (string | StringWithOptions)[]) => {
  const coloredStrings: string[] = [];

  const COLOR_TO_FG_FN: Record<string, (s: string) => string> = {
    "black": colors.black,
    "red": colors.red,
    "green": colors.green,
    "blue": colors.blue,
    "yellow": colors.yellow,
    "orange": (s) => colors.rgb8(s, 202),
    "purple": (s) => colors.rgb8(s, 5),
    "cyan": colors.cyan,
    "magenta": colors.magenta,
    "gray": colors.gray,
  };
  const COLOR_TO_BG_FN: Record<string, (s: string) => string> = {
    "black": colors.bgBlack,
    "red": colors.bgRed,
    "green": colors.bgGreen,
    "blue": colors.bgBlue,
    "yellow": colors.bgYellow,
    "orange": (s) => colors.bgRgb8(s, 202),
    "purple": (s) => colors.bgRgb8(s, 5),
    "cyan": colors.bgCyan,
    "magenta": colors.bgMagenta,
    "gray": (s) => colors.bgRgb8(s, 8),
  };

  for (const str of strings) {
    if (isStringWithOptions(str)) {
      let newStr = str.str;
      if (str.options.bold) {
        newStr = colors.bold(newStr);
      }
      if (str.options.backgroundColor) {
        const bgFn = COLOR_TO_BG_FN[str.options.backgroundColor];
        if (bgFn) {
          newStr = bgFn(newStr);
        }
      }
      const fbFn = COLOR_TO_FG_FN[str.options.color];
      if (fbFn) {
        newStr = fbFn(newStr);
      }
      coloredStrings.push(newStr);
    } else {
      coloredStrings.push(str);
    }
  }
  console.log(coloredStrings.join(""));
};
