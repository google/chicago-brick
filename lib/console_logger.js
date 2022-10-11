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

function calculateSeverityCode(severity) {
  if (severity == -2) {
    return 'E';
  } else if (severity == -1) {
    return 'W';
  } else if (severity == 0) {
    return 'I';
  } else {
    return String(severity);
  }
}

function isoTime() {
  return (new Date).toISOString();
}

function formatServerTime(timeInMs) {
  return timeInMs.toFixed(1);
}

function formatArg(arg, pretty = false) {
  // TODO(applmak): Handle formal exception-like things here.
  // That would be things that, say, have a message key.
  // Maybe only show the message?
  // Maybe format the stacktrace?
  if (arg instanceof Error) {
    return `${arg.message}
${arg.stack}
`;
  }
  if (typeof arg == 'string') {
    return arg;
  }
  if (pretty) {
    return JSON.stringify(arg, undefined, 2);
  }
  return JSON.stringify(arg);
}

function formatArgs(args) {
  if (args.length == 0) {
    return '<No log message>';
  }
  if (args.length == 1) {
    return formatArg(args[0], true);
  }
  return args.map(arg => formatArg(arg)).join(' ');
}

const COLORS = [
  'black',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'cyan',
  'magenta',
  'gray',
];

let colorFn;
let nextColorIndex = 0;
function nextColor() {
  const ret = colorFn ? colorFn(COLORS[nextColorIndex]) : COLORS[nextColorIndex];
  nextColorIndex = (nextColorIndex+1) % COLORS.length;
  return ret;
}

const channelColors = {};
function colorForChannel(channel, severity) {
  if (!channelColors[channel]) {
    channelColors[channel] = nextColor();
  }
  if (severity == -2) {
    return channelColors[channel];
  } else if (severity == -1) {
    return channelColors[channel];
  }
  return channelColors[channel];
}

export function makeConsoleLogger(newColorFn, now) {
  colorFn = newColorFn;
  return function(channel, severity, args) {
    const color = colorForChannel(channel, severity) || colorFn('red');
    const desc = color.desc;
    const str = `${calculateSeverityCode(severity)} ${
        isoTime()} ${
        formatServerTime(now())}: [${
        color(channel)}] ${formatArgs(args)}`;
    if (desc) {
      console.log(str, desc.join(';'), '');
    } else {
      console.log(str);
    }
  }
}
