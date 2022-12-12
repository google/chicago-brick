import {
  isStringWithOptions,
  StringWithOptions,
} from "../../lib/console_logger.ts";

export const consoleLogger = (...strings: (string | StringWithOptions)[]) => {
  const processedStrs = [];
  const css = [];
  for (const str of strings) {
    if (isStringWithOptions(str)) {
      const cssItem = [];
      if (str.options.bold) {
        cssItem.push("font-weight: bolder");
      }
      if (str.options.backgroundColor) {
        cssItem.push(`background-color: ${str.options.backgroundColor}`);
      }
      if (str.options.color) {
        cssItem.push(`color: ${str.options.color}`);
      }
      processedStrs.push(`%c${str.str}%c`);
      css.push(cssItem.join(" "));
      css.push("");
    } else {
      processedStrs.push(str);
    }
  }
  console.log(processedStrs.join(" "), ...css);
};
