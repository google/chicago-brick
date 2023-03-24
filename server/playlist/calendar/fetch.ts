import {
  Calendar,
  Events as CalendarResponse,
} from "https://googleapis.deno.dev/v1/calendar:v3.ts";
import { easyLog } from "../../../lib/log.ts";
import { ModuleDescription, parseDescription } from "./parse.ts";
import { GoogleAuth } from "../../util/authenticate_google_api.ts";
import * as credentials from "../../util/credentials.ts";
import { JWTInput } from "https://googleapis.deno.dev/_/base@v1/auth/jwt.ts";
import { createHash } from "https://deno.land/std@0.101.0/hash/mod.ts";

// Window of time both before and after the current time for which to fetch events.
// Note that this also means events that start outside the window will not be
// considered. Depending on the implementation of the Calendar API we might have
// issues if events are longer than this window.
const FETCH_WINDOW_HRS = 12;

const log = easyLog("wall:calendar");

export interface Event extends ModuleDescription {
  descriptionHash: string;
  start: Date;
  end: Date;
}

// Load calendar events.
// Returns an ordered list of the events around the current time.
export async function fetchEvents(
  id: string,
  credsKey: string,
): Promise<Event[]> {
  const timeNow = new Date();
  const timeMin = new Date(Date.now() - FETCH_WINDOW_HRS * 60 * 60 * 1000);
  const timeMax = new Date(Date.now() + FETCH_WINDOW_HRS * 60 * 60 * 1000);

  // Create API client.
  const creds = credentials.get(credsKey) as JWTInput;
  if (!creds) {
    throw new Error(
      `Calendar schedule requires ${credsKey}, but these creds were not found`,
    );
  }
  const auth = new GoogleAuth(creds);
  auth.setScopes(["https://www.googleapis.com/auth/calendar.events.readonly"]);
  const calendarClient = new Calendar(auth);

  // Fetch calendar data.
  let results: CalendarResponse;
  try {
    results = await calendarClient.eventsList(id, {
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });
  } catch (e) {
    log.error(`Got error when loading calendar events: ${e.message}`);
    return [];
  }

  // Clean up and parse results into events.
  const events: Event[] = [];
  for (const item of results.items || []) {
    const startDate = item.start?.dateTime || item.start?.date;
    const endDate = item.end?.dateTime || item.end?.date;
    if (!startDate || !endDate || !item.description) {
      continue;
    }

    try {
      events.push({
        descriptionHash: createHash("md5").update(item.description).toString(),
        start: startDate,
        end: endDate,
        ...parseDescription(item.description),
      });
    } catch {
      continue;
    }
  }

  // Order events by their start time.
  events.sort((a, b) => a.start < b.start ? -1 : 1);

  // Log event count and next event start time.
  let nextEvent: Event | null = null;
  for (const event of events) {
    if (event.start > timeNow) {
      nextEvent = event;
      break;
    }
  }
  if (nextEvent === null) {
    log(`Fetched ${events.length} event(s).`);
  } else {
    log(
      `Fetched ${events.length} events. Next event starting at ${nextEvent?.start}`,
    );
  }

  return events;
}
