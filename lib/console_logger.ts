/* Copyright 2019 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import { LoggerBackend } from "./log.ts";

function calculateSeverityCode(severity: number): string {
  if (severity == -2) {
    return "E";
  } else if (severity == -1) {
    return "W";
  } else if (severity == 0) {
    return "I";
  } else {
    return String(severity);
  }
}

function isoTime(): string {
  return (new Date()).toISOString();
}

function formatServerTime(timeInMs: number): string {
  return timeInMs.toFixed(1);
}

function formatArg(arg: unknown, pretty = false): string {
  // TODO(applmak): Handle formal exception-like things here.
  // That would be things that, say, have a message key.
  // Maybe only show the message?
  // Maybe format the stacktrace?
  if (arg instanceof Error) {
    return `${arg.message}
${arg.stack}
`;
  }
  if (typeof arg == "string") {
    return arg;
  }
  if (pretty) {
    return JSON.stringify(arg, undefined, 2);
  }
  return JSON.stringify(arg);
}

function formatArgs(args: unknown[]): string {
  if (args.length == 0) {
    return "<No log message>";
  }
  if (args.length == 1) {
    return formatArg(args[0], true);
  }
  return args.map((arg) => formatArg(arg)).join(" ");
}

const COLORS = [
  "black",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "cyan",
  "magenta",
  "gray",
];

let nextColorIndex = 0;
function chooseNextColor(): string {
  const ret = COLORS[nextColorIndex];
  nextColorIndex = (nextColorIndex + 1) % COLORS.length;
  return ret;
}

const cachedChannelColors: Record<string, string> = {};

export interface StringColoringOptions {
  color: string;
  bold?: boolean;
  backgroundColor?: string;
}

function colorerForChannelAndSeverity(
  channel: string,
  severity: number,
): StringColoringOptions {
  if (!cachedChannelColors[channel]) {
    cachedChannelColors[channel] = chooseNextColor();
  }
  const color = cachedChannelColors[channel];
  const options: StringColoringOptions = { color };
  if (severity == -2) {
    options.backgroundColor = "red";
    options.bold = true;
  } else if (severity == -1) {
    options.bold = true;
  }
  return options;
}

export type StringWithOptions = { str: string; options: StringColoringOptions };

export function isStringWithOptions(
  str: string | StringWithOptions,
): str is StringWithOptions {
  return !!((str as StringWithOptions).options);
}

function colorString(
  str: string,
  options: StringColoringOptions,
): StringWithOptions {
  return { str, options };
}

type ConsoleLogger = (...strings: (StringWithOptions | string)[]) => void;
let consoleLogger: ConsoleLogger;
export function makeConsoleLogger(
  newConsoleLogger: ConsoleLogger,
  now: () => number,
): LoggerBackend {
  consoleLogger = newConsoleLogger;
  return function (channel: string, severity: number, args: unknown[]) {
    const options = colorerForChannelAndSeverity(channel, severity);
    consoleLogger(
      `${calculateSeverityCode(severity)} ${isoTime()} ${
        formatServerTime(now())
      }: [`,
      colorString(channel, options),
      `] ${formatArgs(args)}`,
    );
  };
}
