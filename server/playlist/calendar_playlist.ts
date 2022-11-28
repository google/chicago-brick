import { GoogleAuth } from "../util/authenticate_google_api.ts";
import { Calendar } from "https://googleapis.deno.dev/v1/calendar:v3.ts";
import * as credentials from "../util/credentials.ts";
import { JWTInput } from "https://googleapis.deno.dev/_/base@v1/auth/jwt.ts";
import { PlaylistDriver } from "./playlist_driver.ts";
import { library } from "../modules/library.ts";
import { BrickJson } from "./playlist.ts";
import { easyLog } from "../../lib/log.ts";

const log = easyLog("wall:calendar");

interface Event {
  start: Date;
  end: Date;
  moduleDef?: BrickJson;
  moduleName: string;
}

// Load and periodically refresh events for events within now + 1 day.
// Reload every hour.
async function loadEvents(id: string, calendar: Calendar) {
  const timeMin = new Date();
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMin.getDate() + 1);

  const results = await calendar.eventsList(id, {
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events: Event[] = [];
  for (const item of results.items || []) {
    if (!item.start?.dateTime || !item.end?.dateTime || !item.description) {
      continue;
    }
    const module: { moduleDef?: BrickJson; moduleName: string } = {
      moduleName: "",
    };
    if (item.description.includes("{")) {
      try {
        module.moduleDef = JSON.parse(item.description);
        module.moduleName = module.moduleDef!.name;
      } catch (e) {
        log.error(`Error loading module def: `, item.description);
        log.error(e);
        continue;
      }
    } else {
      module.moduleName = item.description;
    }
    events.push({
      start: item.start.dateTime,
      end: item.end.dateTime,
      ...module,
    });
  }

  return events;
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
let events: Event[] = [];

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

  events = await loadEvents(id, calendar);
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
      if (playlistDriver.modulePlayer.oldModule.name === originalName) {
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
