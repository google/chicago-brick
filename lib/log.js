const perChannelLoggers = new Map;
const alwaysOnLoggers = new Set;
const channelStatus = new Map;

export function reset() {
  perChannelLoggers.clear();
  alwaysOnLoggers.clear();
  channelStatus.clear();
}

export function addLogger(logger, channel = '') {
  if (channel) {
    if (perChannelLoggers.has(channel)) {
      perChannelLoggers.get(channel).add(logger);
    } else {
      perChannelLoggers.set(channel, new Set([logger]));
    }
  } else {
    alwaysOnLoggers.add(logger);
  }
}

export function enable(channel, severity = Infinity) {
  channelStatus.set(channel, severity);
}
export function disable(channel) {
  channelStatus.set(channel, -Infinity);
}
export function inherit(channel) {
  channelStatus.delete(channel);
}

function* partials(arr) {
  for (let i = 1; i <= arr.length; ++i) {
    yield arr.slice(0, i);
  }
}

export function isEnabled(severity, channel) {
  if (channel && channelStatus.size) {
    const pieces = channel.split(':');
    let e = 0;  // Presume info, warn, error logs are fine.
    for (const partial of partials(pieces)) {
      const c = partial.join(':');
      if (channelStatus.has(c)) {
        e = channelStatus.get(c);
      }
    }
    return e !== undefined ? severity <= e : false;
  } else {
    // If not told otherwise, the default is info, warn, error logs.
    return severity <= 0;
  }
}

export function log(channel, severity, ...args) {
  loggerForChannel(channel, severity).forEach(c => c(channel, severity, args));
}

export function easyLog(channel) {
  const ret = (...args) => {
    log(channel, 0, ...args);
  };
  ret.error = (...args) => {
    log(channel, -2, ...args);
  };
  ret.warn = (...args) => {
    log(channel, -1, ...args);
  };
  ret.info = ret.log = (...args) => {
    log(channel, 0, ...args);
  };
  ret.debugAt = (level, ...args) => {
    log(channel, level, ...args);
  };
  return ret;
}

function loggerForChannel(channel, severity) {
  const ret = [];

  if (perChannelLoggers.has(channel)) {
    if (isEnabled(severity, channel)) {
      ret.push(...perChannelLoggers.get(channel));
    }
  }
  for (const logger of alwaysOnLoggers) {
    if (isEnabled(severity)) {
      ret.push(logger);
    }
  }
  return ret.length ? ret : [];
}
