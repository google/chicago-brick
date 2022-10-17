const perChannelLoggers = new Map<string, Set<LoggerBackend>>();
const alwaysOnLoggers = new Set<LoggerBackend>();
const channelStatus = new Map<string, number>();

export function reset() {
  perChannelLoggers.clear();
  alwaysOnLoggers.clear();
  channelStatus.clear();
}

export function addLogger(logger: LoggerBackend, channel = "") {
  if (channel) {
    if (perChannelLoggers.has(channel)) {
      perChannelLoggers.get(channel)!.add(logger);
    } else {
      perChannelLoggers.set(channel, new Set([logger]));
    }
  } else {
    alwaysOnLoggers.add(logger);
  }
}

export function enable(channel: string, severity = Infinity) {
  channelStatus.set(channel, severity);
}
export function disable(channel: string) {
  channelStatus.set(channel, -Infinity);
}
export function inherit(channel: string) {
  channelStatus.delete(channel);
}

function* partials<T>(arr: T[]): Iterable<T[]> {
  for (let i = 1; i <= arr.length; ++i) {
    yield arr.slice(0, i);
  }
}

export function isEnabled(severity: number, channel = ""): boolean {
  if (channel && channelStatus.size) {
    const pieces = channel.split(":");
    let e = 0; // Presume info, warn, error logs are fine.
    for (const partial of partials(pieces)) {
      const c = partial.join(":");
      if (channelStatus.has(c)) {
        e = channelStatus.get(c)!;
      }
    }
    return e !== undefined ? severity <= e : false;
  } else {
    // If not told otherwise, the default is info, warn, error logs.
    return severity <= 0;
  }
}

export function log(channel: string, severity: number, ...args: unknown[]) {
  for (const backend of loggerForChannel(channel, severity)) {
    backend(channel, severity, args);
  }
}

export interface Logger {
  (...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debugAt(level: number, ...args: unknown[]): void;
}

export type LoggerBackend = (
  channel: string,
  severity: number,
  args: unknown[],
) => void;

export function easyLog(channel: string): Logger {
  const ret = (...args: unknown[]) => {
    log(channel, 0, ...args);
  };
  ret.error = (...args: unknown[]) => {
    log(channel, -2, ...args);
  };
  ret.warn = (...args: unknown[]) => {
    log(channel, -1, ...args);
  };
  ret.info = ret.log = (...args: unknown[]) => {
    log(channel, 0, ...args);
  };
  ret.debugAt = (level: number, ...args: unknown[]) => {
    log(channel, level, ...args);
  };
  return ret;
}

function loggerForChannel(channel: string, severity: number): LoggerBackend[] {
  const ret = [];

  if (perChannelLoggers.has(channel)) {
    if (isEnabled(severity, channel)) {
      ret.push(...perChannelLoggers.get(channel)!);
    }
  }
  for (const logger of alwaysOnLoggers) {
    if (isEnabled(severity)) {
      ret.push(logger);
    }
  }
  return ret.length ? ret : [];
}
