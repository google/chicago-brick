import { PlaylistDriver } from "../playlist_driver.ts";
import { library } from "../../modules/library.ts";
import { easyLog } from "../../../lib/log.ts";
import { Event, fetchEvents } from "./fetch.ts";

const log = easyLog("wall:calendar");

const FETCH_EVENTS_INTERVAL_MS = /* 1 minute */ 60 * 1000;
const SYNC_EVENTS_INTERVAL_MS = /* 10 seconds */ 10 * 1000;

// Unique identifier of the current calendar event being displayed.
// Null when the wall state should be default/reset.
let currentScheduledModuleHash: string | null = null;

export async function startSchedule(
  id: string,
  credsKey: string,
  playlistDriver: PlaylistDriver,
) {
  // Set up loop that pulls calendar events.
  let events = await fetchEvents(id, credsKey);
  setInterval(async () => {
    events = await fetchEvents(id, credsKey);
  }, FETCH_EVENTS_INTERVAL_MS);

  // Set up loop that updates the wall according to calendar events.
  updateState(events, playlistDriver);
  setInterval(() => {
    updateState(events, playlistDriver);
  }, SYNC_EVENTS_INTERVAL_MS);
}

async function updateState(events: Event[], playlistDriver: PlaylistDriver) {
  const timeNow = new Date();
  const targetEvent = findEventAtTime(timeNow, events);

  // Nothing is scheduled.
  if (targetEvent === null) {
    // Already reset playlist.
    if (currentScheduledModuleHash === null) return;

    log(`No module coming up. Back to normal playlist`);
    await playlistDriver.resetPlaylist();
    currentScheduledModuleHash = null;
    return;
  }

  const targetEventName = targetEvent.moduleDef?.name || targetEvent.moduleName;

  // Target module is already playing.
  if (currentScheduledModuleHash === targetEvent.descriptionHash) {
    return;
  }

  // Switch to the new module.
  if (targetEvent.moduleDef !== undefined) {
    log(`Loading module def: `, targetEvent.moduleDef);
    library.loadAllModules([targetEvent.moduleDef]);
  }
  log(`Scheduling module from calendar: "${targetEventName}"`);
  playlistDriver.playModule(targetEventName, true);
  currentScheduledModuleHash = targetEvent.descriptionHash;
}

// Finds the event that should be playing at any arbitrary time.
// Returns null when nothing should be playing.
// Returns the event with the latest start time in case of overlaps.
export function findEventAtTime(date: Date, events: Event[]): Event | null {
  let foundEvent: Event | null = null;
  for (const event of events) {
    if (event.start <= date && event.end >= date) {
      if (foundEvent === null || foundEvent.start < event.start) {
        foundEvent = event;
      }
    }
  }
  return foundEvent;
}
