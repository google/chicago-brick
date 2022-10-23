import {
  isStringWithOptions,
  StringWithOptions,
} from "../../lib/console_logger.ts";

export const consoleLogger = (...strings: (string | StringWithOptions)[]) => {
  const processedStrs = [];
  const css = [];
  for (const str of strings) {
    if (isStringWithOptions(str)) {
      processedStrs.push(str.str);
      if (str.options.bold) {
        css.push("font-weight: bolder");
      }
      if (str.options.backgroundColor) {
        css.push(`background-color: ${str.options.backgroundColor}`);
      }
    } else {
      processedStrs.push(str);
      if (css.length) {
        // Only add a '' css if we already have something in the css box.
        css.push("");
      }
    }
  }
  console.log(...processedStrs, ...css);
};
