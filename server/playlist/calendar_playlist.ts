import { GoogleAuth } from "../util/authenticate_google_api.ts";
import { Calendar } from "https://googleapis.deno.dev/v1/calendar:v3.ts";
import * as credentials from "../util/credentials.ts";
import { JWTInput } from "https://googleapis.deno.dev/_/base@v1/auth/jwt.ts";
import { PlaylistDriver } from "./playlist_driver.ts";
import { library } from "../modules/library.ts";
import { BrickJson, ExtendsBrickJson } from "./playlist.ts";
import { easyLog } from "../../lib/log.ts";
import { CreditAuthorTitleJson } from "../../client/title_card.ts";

const log = easyLog("wall:calendar");

interface ModuleDescription {
  moduleDef?: BrickJson;
  moduleName: string;
}

interface Event extends ModuleDescription {
  start: Date;
  end: Date;
}

function parseDescription(desc: string): ModuleDescription {
  // First, check if there's a {.
  if (desc.includes("{")) {
    try {
      const moduleDef = JSON.parse(desc);
      return { moduleDef, moduleName: moduleDef.name };
    } catch (e) {
      log.error(`Error parsing module def:`, desc);
      log.error(e);
      throw e;
    }
  }
  // Next, check if there's a :.
  if (desc.includes(":")) {
    // It's a "simple" brickjson, designed to extend the slideshow
    // module.
    const credit: CreditAuthorTitleJson = { title: "" };
    const config = {
      load: {},
      display: {
        fullscreen: {},
      },
      // deno-lint-ignore no-explicit-any
    } as any;
    const brickjson = {
      name: "",
      credit,
      extends: "slideshow",
      config,
    } as ExtendsBrickJson;
    for (const line of desc.split(/\n+/g)) {
      const [key, value] = line.split(/\s*:\s*/);
      if (key === "name") {
        brickjson.name = value;
      } else if (key === "title") {
        credit.title = value;
      } else if (key === "drive-folder") {
        config.load.drive = config.load.drive || {};
        config.load.drive.folderIds = config.load.drive.folderIds || [];
        config.load.drive.folderIds.push(...value.split(","));
      } else if (key === "drive-file") {
        config.load.drive = config.load.drive || {};
        config.load.drive.fileIds = config.load.drive.fileIds || [];
        config.load.drive.fileIds.push(...value.split(","));
      } else if (key === "period") {
        config.display.fullscreen.period = Number(value);
      } else if (key === "split" && value === "true") {
        config.display.fullscreen.split = true;
      } else if (key === "shuffle" && value === "true") {
        config.display.fullscreen.shuffle = true;
      }
    }
    return { moduleDef: brickjson, moduleName: brickjson.name };
  }
  // Last, it's a module name.
  return { moduleName: desc };
}

const events: Event[] = [];

// Load and periodically refresh events for events within now + 1 day.
// Reload every hour.
async function loadEvents(id: string, calendar: Calendar) {
  const timeMin = new Date();
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMin.getDate() + 1);

  let results;
  try {
    results = await calendar.eventsList(id, {
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });
  } catch (e) {
    log.error(`Got error when loading calendar events: ${e.message}`);
    // Give up.
    return;
  }

  events.length = 0;
  for (const item of results.items || []) {
    const startDate = item.start?.dateTime || item.start?.date;
    const endDate = item.end?.dateTime || item.end?.date;
    if (!startDate || !endDate || !item.description) {
      continue;
    }
    let module;
    try {
      module = parseDescription(item.description);
    } catch {
      continue;
    }
    events.push({
      start: startDate,
      end: endDate,
      ...module,
    });
  }
}

export async function startSchedule(
  id: string,
  credsKey = "googleserviceaccountkey",
  playlistDriver: PlaylistDriver,
) {
  const creds = credentials.get(credsKey) as JWTInput;
  if (!creds) {
    throw new Error(
      `Calendar schedule requires ${credsKey}, but these creds were not found`,
    );
  }

  const auth = new GoogleAuth(creds);
  auth.setScopes(["https://www.googleapis.com/auth/calendar.events.readonly"]);

  const calendar = new Calendar(auth);

  setInterval(() => {
    grabEvents(id, calendar, playlistDriver);
  }, 600 * 1000);
  await grabEvents(id, calendar, playlistDriver);
}

let timerUntilNextStartCheck = 0;
let timerUntilNextEndCheck = 0;

function findNextEvent(now: Date): Event | undefined {
  for (const event of events) {
    if (event.end <= now) {
      // This event is too early.
      continue;
    }
    // The next event is the right one.
    return event;
  }
  return undefined;
}

async function grabEvents(
  id: string,
  calendar: Calendar,
  playlistDriver: PlaylistDriver,
) {
  const now = new Date();

  await loadEvents(id, calendar);
  log(`Loaded ${events.length} calendar events`);
  sleepAndPlayNextEvent(now, playlistDriver);
}

function sleepAndPlayNextEvent(
  now: Date,
  playlistDriver: PlaylistDriver,
) {
  // Calculate time until the next check.
  const event = findNextEvent(now);

  // Clear timer until next check.
  clearTimeout(timerUntilNextStartCheck);
  clearTimeout(timerUntilNextEndCheck);

  if (event) {
    const originalName = event.moduleName;

    log(
      `Scheduling event ${originalName} at ${event.start.toString()} (${
        ((event.start.getTime() - now.getTime()) / 1000.0).toFixed(0)
      }s) ending at ${event.end.toString()} (${
        ((event.end.getTime() - now.getTime()) / 1000.0).toFixed(0)
      }s)`,
    );
    timerUntilNextStartCheck = setTimeout(() => {
      if (
        playlistDriver.modulePlayer.oldModule.name === originalName ||
        playlistDriver.modulePlayer.oldModule.name === "_from_calendar"
      ) {
        // We already told the module to play.
        return;
      }
      log(`Timer fired. Scheduling module: "${originalName}"`);
      if (event.moduleDef) {
        // Modify the name of the next module so we don't end up with a bazillion calendar modules.
        event.moduleDef.name = "_from_calendar";
        log(`Loading module def`, event.moduleDef);
        // Load this module into the library.
        library.loadAllModules([event.moduleDef]);
      }
      // Tell the playlist to switch to this event now and suspend the normal playlist ticking.
      playlistDriver.playModule(
        event.moduleDef?.name || event.moduleName,
        true,
      );
    }, event.start.getTime() - now.getTime());
    timerUntilNextEndCheck = setTimeout(() => {
      log(`Schedule ended for module ${originalName}.`);
      // It's time to change away, so try to play the next event.
      sleepAndPlayNextEvent(event.end, playlistDriver);
    }, event.end.getTime() - now.getTime());
  } else {
    log(`No module coming up. Back to normal playlist`);
    // We have no current event we are supposed to be playing, so
    // reset back to the default playlist.
    playlistDriver.resetPlaylist();
  }
}
